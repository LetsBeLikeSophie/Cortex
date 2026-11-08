# Mehh 캡처 AI 분석 엔드포인트 (초안, 2026-11-08)

Mehh Pro가 폰에서 애매하다고 본 **캡처** 썸네일(얼굴 없는 것만)을 Cortex 서버가 Claude로 한 번 더 본다. 범위는 Mehh `docs/SPEC.md` 11장 "AI 분석" 그대로.

- 서버: Cortex 백엔드(Fastify, Oracle VM). Supabase Edge Function 아님 — 결제 확인(`googlePlay.ts`)·AI 호출·비용 기록·하루 상한을 그대로 쓰기 위해.
- 상태: 코드·테스트만. **배포 안 함, DB 마이그레이션 안 돌림, 꺼져 있음** (`MEHH_AI_ENABLED`가 `1`이 아니면 라우트 자체가 없음).

## 요청

`POST /mehh/screenshots/analyze` (JSON, 로그인 없음 — Mehh엔 계정이 없음)

```json
{
  "purchaseToken": "<Play 구매 토큰, mehh_pro_lifetime>",
  "today": "2026-11-08",
  "photos": [
    { "id": "p0", "image": "<base64 JPEG>" }
  ]
}
```

| 필드 | 규칙 |
|---|---|
| `purchaseToken` | 1–2000자. 서버는 저장하지 않고 SHA-256만 상한 키로 씀 |
| `today` | 폰의 날짜 `YYYY-MM-DD` (쿠폰 기한 판단용) |
| `photos` | 1–10장. `id`는 `[A-Za-z0-9_-]{1,64}` — Mehh가 이번 묶음 안에서만 쓰는 이름(파일 이름·경로 금지, 경로는 400). 같은 `id` 두 번은 400 |
| `image` | JPEG 권장, 긴 변 **768px**, 품질 ~70 (대략 30–60KB). 디코딩 후 300KB 넘으면 413 |

보내지 않는 것: 원본, 위치, EXIF, 파일 이름, 찍은 날짜, 기기 정보. 서버도 sharp로 다시 인코딩해서 혹시 붙어 온 메타데이터를 지운 뒤에만 Claude로 보낸다.

## 응답 200

```json
{
  "results": [{ "id": "p0", "verdict": "useless", "reason": "used_code" }],
  "skipped": ["p7", "p8"],
  "usage": { "used": 100, "limit": 100, "resetsAt": "2026-11-30T15:00:00.000Z" }
}
```

- `verdict`: `useless` · `receipt` · `expired_coupon` · `keep` · `unsure`
- `reason`: `used_code` · `delivery_done` · `temporary_info` · `duplicate_info` · `receipt` · `coupon_expired` · `coupon_valid` · `ticket_upcoming` · `document` · `note` · `person` · `other`
- 문장은 안 보냄. Mehh가 라벨마다 자기 문구(두 언어)를 붙인다.
- 안전 규칙(서버에서 강제, `mehhRules.ts`): AI가 빠뜨리거나 지어낸 답 → `unsure`(Mehh는 그대로 둠). `person` → 항상 `keep`. 즉 이상한 답이 사진을 X로 보내는 일은 없음.
- `skipped`: 이번 달 상한에 걸려 안 본 사진. Mehh는 다음 달까지 폰 판단 그대로 둔다.

## 오류와 Mehh가 보여줄 것

| 코드 | `error` | 뜻 | Mehh 화면 (짧게) |
|---|---|---|---|
| 400 | `invalid_body` | 형식 틀림 (Mehh 버그) | 안내 없이 폰 분석 결과만 사용, 앱 오류로 기록 |
| 400 | `unreadable_image` | 썸네일을 못 읽음 | 그 묶음은 폰 분석만. 문구 없음 |
| 413 | `image_too_large` | 썸네일이 너무 큼 (Mehh 버그) | 위와 같음 |
| 401 | `not_pro` | 구매 없음·환불됨·결제 대기 | "Pro에서 쓸 수 있어요" → Pro 안내 |
| 402 | `quota` (+`used`,`limit`,`resetsAt`) | 이번 달 다 씀 | "이번 달 AI 분석을 다 썼어요 · {날짜}에 다시 채워져요" |
| 429 | (rate limit) | 너무 자주 | 잠깐 뒤 자동 재시도, 문구 없음 |
| 502 | `ai_failed` | 일시 실패 (사진은 안 셈) | "잠시 뒤 다시 해 주세요" + 다시 |
| 503 | `ai_unavailable` | AI 크레딧·하루 상한·키 문제 | "지금은 AI 분석을 쓸 수 없어요" (폰 분석은 그대로) |
| 503 | `billing_unavailable` | Google Play 확인 불가 | 위와 같음 |

모든 경우 폰 분석 결과는 그대로 남는다 — 서버 실패가 사진 정리를 막지 않는다.

## Pro 확인

- Google Play Developer API `purchases.products.get` (패키지 `dev.itssophie.mehh`, 상품 `mehh_pro_lifetime`). Cortex와 같은 서비스 계정, 패키지만 다름.
- `purchaseState === 0`만 Pro. 1(환불·취소), 2(대기)는 401.
- 확인 결과는 서버 메모리에 **1시간** 캐시 (매 묶음마다 Google을 기다리지 않게). 환불은 길어야 1시간 뒤 반영.
- acknowledge는 Mehh 앱이 함(지금처럼). 서버는 읽기만.
- Google이 토큰을 모름(400/404/410) → 401. Google이 느리거나 다운 → 503 (10초 제한 그대로).

## 매달 상한 (N)

**N = 100장/월 (2026-11-08 Sophie: 50과 300 사이 중간), Cortex 무료 50과 따로.**

- 따로인 이유: Mehh엔 Cortex 계정이 없어서 같은 통을 쓸 키가 없음. "Mehh Pro → Cortex 무료 50 보너스"(별도 계획)는 Cortex 저장 분류용이라 이것과 다른 기능.
- 100인 이유: 아래 비용으로 한 사람 최악 ~25원/월. 평생 이용권(₩12,900)으로 오래 버틸 수 있는 선. 폰이 애매하다고 본 캡처만 오니 실제 사용은 훨씬 적을 것.
- 기준: 한국 시간 달력 월 (Cortex와 같음, `monthWindow`). 키는 구매 토큰의 SHA-256 → 같은 Google 계정의 폰 두 대는 한 통을 같이 씀.
- 세는 법: AI 호출 **전에** DB 함수 `mehh_ai_reserve`가 구매별 잠금 안에서 이번 달 합을 읽고 남은 만큼만 잡는다(동시에 두 묶음이 와도 넘지 않음). AI가 실패하면 그 행을 지워 돌려준다. 썸네일 디코딩 실패·Pro 아님·하루 상한은 세기 전에 끊는다.
- 환경변수: `MEHH_AI_MONTHLY`(100), `MEHH_RATE_LIMIT_MAX`(15분에 30번, 구매별).
- 서비스 전체 하루 AI 상한(`AI_DAILY_LIMIT_USD`)은 Cortex와 같이 씀.

## 저장하지 않는 것 / 남는 것

- 썸네일: 요청 메모리 안에서만. 파일·Storage·DB·로그 어디에도 안 씀. 요청 로그는 경로만 남김(본문 안 남김, 기존 설정).
- 결과(판정)도 저장 안 함.
- 남는 것:
  - `mehh_ai_usage`: 구매 토큰 해시, 사진 수, 시각. 지난달 이전 행은 매일 정리(`retention.ts`).
  - `ai_calls`: 호출마다 모델·토큰 수·비용 (`purpose = mehh_screenshot`, `user_id` 없음). 90일 뒤 월별 합계로.
- **주의 (개인정보 문구에 반영 필요):** 썸네일은 Anthropic API로 간다. Cortex 서버는 바로 버리지만, Anthropic은 자기 정책에 따라 남용 감시를 위해 일정 기간(현재 API 기본 최대 30일로 알고 있음 — 문구 쓰기 전에 최신 정책 확인) 보관할 수 있고 학습에는 쓰지 않는다. "서버가 바로 지운다"만 쓰면 부정확하다.

## 개인정보처리방침·데이터 보안 메모 (서버 규칙 2026-11-02)

이 변경은 아래가 고쳐진 뒤에만 켠다 (`MEHH_AI_ENABLED=1`).

- Mehh 개인정보처리방침: Pro가 AI 분석을 켜면 얼굴 없는 캡처의 작은 썸네일이 Cortex 서버(일본 도쿄, Oracle Cloud)와 Anthropic(미국)으로 감. 목적은 판정만, 서버에 저장 안 함, Anthropic 보관 조건(위). 구매 토큰은 Pro 확인에만 쓰고, 해시와 월별 사용 수만 남김(지난달 이전 삭제). 국외 이전 항목 추가.
- Mehh Play 데이터 보안: "사진" 수집·공유 = 예(기능 목적, 일시 처리 ephemeral, 선택 사항). "앱 활동/구매 내역" — 구매 토큰을 서버로 보냄(앱 기능·사기 방지). 전송 암호화 예.
- Cortex 개인정보처리방침: 수탁/처리 항목에 "Mehh 앱 이용자의 캡처 썸네일(일시 처리, 저장 안 함)"과 `mehh_ai_usage` 보관 기간 한 줄.
- Cortex Play 데이터 보안: Cortex 앱 이용자 데이터는 바뀌지 않음 (Mehh 쪽 신고만).
- Mehh 동의 창(처음 보내기 전): 무엇이(얼굴 없는 캡처 썸네일) 어디로(Cortex 서버 → Anthropic) 가고, 서버는 바로 버린다는 것.

## 사진당 비용 (Claude Haiku 5.5, 입력 $0.10 / 출력 $0.50 per 1M 토큰, 1달러 ≈ 1,400원)

이미지 토큰 ≈ 가로×세로 / 750. 768px 긴 변 폰 캡처(9:19.5) = 354×768 ≈ **360 토큰**, 9:16이면 ≈ 440.

| 묶음 | 입력 토큰 | 출력 토큰(생각 포함) | 비용 | 사진당 |
|---|---|---|---|---|
| 1장 | ~850 (프롬프트 420 + 사진 ~410) | ~150 | ~$0.00016 | **~0.22원** |
| 10장 | ~4,500 | ~400 | ~$0.00065 | **~0.09원** |

- 한 사람 한 달 최악(100장, 1장씩): ~$0.017 ≈ 25원. 10장씩이면 ~10원.
- 실제 값은 켠 뒤 `ai_calls`(`purpose = mehh_screenshot`)로 확인 (`scripts/ai-usage.ts`).
- 영수증·쿠폰 글자를 자주 못 읽으면 긴 변 1024로 올릴 수 있음(사진당 ~2배, 그래도 0.4원 안쪽).

## 켜기 전에 Sophie가 할 것

1. Play Console(Mehh 앱) → 사용자 및 권한 → Cortex 서비스 계정에 "재무 데이터 보기/주문 관리" 권한.
2. `backend/db/migrations/2026-11-08-mehh-ai.sql`을 SQL 에디터에서 실행.
3. (선택) `ANTHROPIC_API_KEY_MEHH` 새 키 — 콘솔에서 비용이 따로 보임. 없으면 분류 키(`ANTHROPIC_API_KEY_CLASSIFY`), 비용은 `ai_calls`에서 따로 보임.
4. 두 앱 개인정보처리방침·Mehh 데이터 보안 고친 뒤 `.env`에 `MEHH_AI_ENABLED=1`, 배포.
5. Mehh 쪽: 보내기·동의 창·위 오류 문구·상한 표시.

## 코드 위치

- `backend/src/routes/mehh.ts` — 라우트 (의존성 주입, 테스트 `mehh.test.ts`)
- `backend/src/lib/mehhRules.ts` — Pro 판정·상한·답 매핑 (순수, `mehhRules.test.ts`)
- `backend/src/lib/mehhUsage.ts` — Play 확인 캐시, 상한 예약/환불
- `backend/src/lib/mehhDeps.ts` — 실제 연결
- `backend/src/lib/anthropic.ts` `analyzeMehhScreenshots` — Claude 호출 (한 번에 최대 10장)
- `backend/src/lib/image.ts` `prepareMehhThumbnail` — 메타데이터 제거·768px
- `backend/src/lib/googlePlay.ts` `getMehhPurchase`

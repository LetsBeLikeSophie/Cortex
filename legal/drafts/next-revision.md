# 다음 약관·방침 개정 초안 (아직 게시하지 않음)

`[ ]`는 Sophie가 채울 값이에요. 값이 다 차면 `legal/`의 terms·privacy(한국어, 영어)에 반영하고, `tokushoho.html`을 `legal/`로 옮겨 함께 배포해요. 시행 7일 전 앱 안에서 공지해요(`components/PolicyNotice.tsx`). 불리한 변경이 있으면 30일 전이에요.

## 1. 판매자 정보 (약관 맨 아래, 스토어 링크에서도 보이게)

- 상호: 소피 앱스(Sophie Apps)
- 대표자: 최솔잎
- 사업장 주소: 서울특별시 동작구 신대방1나길 65-1 (신대방동)
- 전화: 010-3017-0322
- 사업자등록번호: 539-32-01828
- 통신판매업 신고번호: 제2026-서울동작-1304호 (서울특별시 동작구청)
- 문의: cortex@itssophie.dev

## 2. 제1조

"Cortex 개발자(개인)" → "소피 앱스(Sophie Apps)"

## 3. 제4조 제공 지역

현재 문장 뒤에 추가: "그 밖에 서비스에 쓰는 AI 처리업체(Anthropic)가 지원하지 않는 국가·지역에서도 제공하지 않습니다."

## 4. 제7조 평생 이용권

현재: "평생 이용권은 서비스가 제공되는 동안 Pro 기능을 추가 결제 없이 이용할 수 있는 상품입니다. 운영자가 서비스를 종료하는 경우 30일 전에 공지합니다."

변경: "평생 이용권은 사람의 평생이 아니라 Cortex 서비스가 운영되는 기간 동안 Pro 기능을 추가 결제 없이 이용할 수 있는 상품입니다. 운영자가 서비스를 종료하는 경우 60일 전에 공지하고, 그 기간 동안 저장한 기록을 내보낼 수 있게 합니다. 구매 금액에서 이용한 개월 수에 공지 당시 월간 구독 가격을 곱한 금액을 뺀 뒤 남는 금액이 있으면 환불합니다."

예: 79,000원에 사고 5개월 뒤 종료, 월 5,900원이면 79,000 - 29,500 = 49,500원 환불. 14개월부터 환불액 0원.

서비스를 종료하면 월간·연간 구독도 남은 기간을 환불해요. 사진 내보내기가 아직 없으니 종료 전에는 사진도 내보낼 수 있어야 해요.

## 5. 제8조 추가 (권리 침해 신고)

"저장한 콘텐츠가 자신의 저작권 등 권리를 침해한다고 생각하는 분은 이메일(cortex@itssophie.dev)로 신고할 수 있습니다. 운영자는 관련 법령에 따라 확인하고 필요한 조치를 합니다."

## 6. 개인정보처리방침

- 1항 "이용약관 제7조" → "이용약관 제8조" (조 번호 오류)
- 1항 카메라 `"카메라로 촬영"을 누른 경우` → `카메라를 누른 경우` (버튼 이름이 바뀜)
- 1항·9항 이용 통계: "이벤트 종류 · 카테고리 · 발생 시각"에 "결제 화면 조회·구매 단계(상품 종류)" 추가
- 게스트 보관 기간: "12개월 동안 이용 기록이 없는 게스트 계정과 저장한 내용은 삭제합니다." (코드 미반영, 이용 기록을 쌓은 뒤 적용)
- 탈퇴 후 결제 기록: "탈퇴하면 결제 기록에서 계정과의 연결을 지우고, 환불·세무 대응을 위해 주문번호·상품·기간·국가만 5년 보관합니다." (결정 C2, 코드 반영됨)
- Google로 보내는 항목: 결제 요청에 "이름이나 이메일이 들어 있지 않은 임의의 계정 ID"을 함께 보냄. 위탁·국외 이전의 Google 항목에 추가 (결정 P1, 코드 반영됨)
- 오류 정보: "앱 오류가 나면 앱 버전, 오류 종류, 코드 위치를 운영자 서버로 보내 90일 보관합니다. 계정과 메모 내용은 포함하지 않습니다." 수집 항목에 추가 (결정 E1, 코드 반영됨)
- 카카오 연결 해제 (결정 K1, 코드 반영됨, SQL `backend/db/migrations/2026-11-03-kakao-unlink-hold.sql` 먼저): 3항 보유 기간에 추가 — "카카오 설정에서 Cortex 연결을 끊으면 계정은 로그인할 수 없는 상태로 30일 보관한 뒤 계정 정보와 저장한 콘텐츠 전체를 삭제합니다. 그 사이 같은 카카오 계정으로 다시 로그인하면 그대로 이용할 수 있습니다." 영어: "If you disconnect Cortex in your Kakao settings, your account is kept, unable to sign in, for 30 days, then your account data and all saved content are deleted. Signing in again with the same Kakao account within that time restores it." Play 데이터 보안 신고는 바꿀 것 없음(새로 모으는 정보 없음, 삭제 요청 방법은 그대로)
- 8항 제외 지역: 약관 제4조와 같게
- 15항 등 책임자: 판매자 정보와 같게

## 7. 번역

위 내용이 확정된 뒤, 일본어·중국어 간체·번체 약관과 방침을 AI로 번역해 올려요(한국어본 우선 문구 유지). `i18n/index.ts`의 `PRIVACY_URL`, `TERMS_URL`도 언어별로 연결해요.

## 8. 약관 제6조 3항 (법무 리뷰 L-1, 결정 K1과 맞춤)

현재(`legal/terms.html:93`): "카카오 계정으로 로그인한 회원이 카카오 서비스 자체에서 연결을 해제한 경우에도, 운영자는 이를 전달받아 위 항과 동일하게 계정과 콘텐츠를 삭제합니다."

변경: "카카오 계정으로 로그인한 회원이 카카오 서비스 자체에서 연결을 해제한 경우, 운영자는 이를 전달받아 계정을 로그인할 수 없는 상태로 30일 동안 보관한 뒤 위 항과 동일하게 계정과 콘텐츠를 삭제합니다. 그 기간 안에 같은 카카오 계정으로 다시 로그인하면 계속 이용할 수 있습니다."

영어(`terms-en.html` 같은 조항): "If a member who signed in with Kakao disconnects Cortex in Kakao's own settings, we are notified and keep the account, unable to sign in, for 30 days, then delete the account and its content as in the paragraph above. Signing in again with the same Kakao account within that time restores it."

## 9. 방침 초안 ↔ 코드 대조 (법무 리뷰 L-1, 2026-11-04 `auto/2026-11-04` 기준)

"서버에 올라감"은 운영 서버(`ed6b553` + `cd7d55c`)와 테스트 중인 앱 vc10105(`49dfb87`) 기준이에요.

| 초안 항목 | 코드 위치 | 코드가 하는 일 | 초안 문구와 일치 | 서버에 올라감 |
|---|---|---|---|---|
| 결제 화면·구매 단계 이벤트 (6항 1·9항) | `backend/src/lib/supabase.ts` `AnalyticsEventType` (`quota_hit`, `paywall_view`, `purchase_*`, `subscription_*`), `detail`은 상품·화면 이름만 | 가명 ID + 종류 + `detail` 저장 | ✅ | **예** (`ed6b553`에 포함, 2026-10-31 SQL 실행됨). 공개 방침보다 먼저 모으고 있음 |
| 탈퇴 후 결제 기록 (결정 C2) | `deleteUserAccount`가 `purchases.user_id`를 지움, `retention.ts` `pruneOldRecords` 5년 | 연결 끊고 5년 보관 | ✅ | 아니요 (`36ca01a`) |
| Google로 보내는 임의 계정 ID (결정 P1) | 앱 `mobile/src/billing/AndroidPurchase.tsx` `obfuscatedAccountId`, 서버 `billingRules.ts` `buyerAccount` | 구매 요청에 계정 ID(이름·이메일 아님) | ✅ | **앱은 예** (vc10105에 포함, 테스트 구매 때 Google로 감). 서버 확인은 아니요 |
| 오류 정보 (결정 E1) | 앱 `mobile/src/errors/report.ts` → `POST /me/error`, 서버 `appErrors.ts`·`logAppError`, `retention.ts` 90일 | 앱 버전·오류 이름·코드 위치, 계정 없음 | ✅ | 앱은 보냄(vc10105), 서버 경로가 없어 저장 안 됨 |
| 카카오 연결 해제 30일 (결정 K1) | `routes/webhooks.ts` `markKakaoUnlinked` + 로그인 차단, `retention.ts` `purgeUnlinkedKakaoAccounts` | 30일 뒤 계정 전체 삭제, 다시 로그인하면 복구 | ✅ (약관은 8항으로 고침) | 아니요 (`224724e`, SQL 먼저) |
| 게스트 12개월 삭제 | 없음 | — | ❌ 코드 없음, 초안대로 보류 | — |

## 10. 방침 법정 기재 항목 (법무 리뷰 L-2)

근거: 개인정보보호법 28조의8 2항, 30조, 시행령 31조, 시행령 41조 4항. 업체 연락처는 각 사 공개 방침에서 2026-11-04에 확인했어요(Oracle은 페이지가 열리지 않아 문의 양식 주소만 적음, 게시 전 확인).

### 10-1. 6항 처리위탁 표에 추가

| 수탁업체 | 위탁 업무 | 처리 위치 |
|---|---|---|
| Oracle Corporation | 서비스 서버(백엔드 API, 웹) 호스팅 | 일본(도쿄) |
| Anthropic PBC | 저장한 콘텐츠의 AI 분석(동의한 경우만) | 미국 |
| Google LLC | Google 로그인 인증, Google Play 결제 확인, 결제 상태 알림 | 미국 |

6항 첫 문장 "Supabase와 Kakao 모두 국내에서 데이터를 처리합니다."는 "국외에서 처리하는 업체는 제7항에도 적었습니다."로 바꿔요. Kakao 줄은 그대로 두되 "로그인 정보 제공"으로 성격을 적을지는 전문가 확인 항목이에요.

영어: Oracle Corporation — hosting of the service servers (backend API, web), Japan (Tokyo). Anthropic PBC — AI analysis of saved content, only with consent, United States. Google LLC — Google sign-in, Google Play purchase checks and payment status notices, United States.

### 10-2. 7항 국외이전 표에 "이전받는 자 연락처" 줄 추가

| 이전받는 자 | 연락처 |
|---|---|
| Anthropic PBC | privacy@anthropic.com (개인정보보호책임자 dpo@anthropic.com), 548 Market St, PMB 90375, San Francisco, CA 94104, USA |
| Oracle Corporation | Oracle 개인정보 문의 양식 https://www.oracle.com/legal/data-privacy-inquiry-form/ [게시 전 링크 확인] |
| Google LLC | https://support.google.com/policies?p=privpol_privts |

Supabase(6항, 서울 리전)도 같은 형식으로 적어 두면 좋아요: privacy@supabase.com.

### 10-3. 10항에 열람 기한 추가

"열람 요청은 받은 날부터 10일 안에 처리하고, 그 안에 할 수 없으면 이유와 가능한 날짜를 알려 드립니다."

영어: "We respond to a request to see your data within 10 days of receiving it; if we can't, we tell you why and when we can."

### 10-4. 13항 보호책임자

- 성명: 최솔잎
- 직책: 대표
- 이메일: cortex@itssophie.dev

영어: Name: Choi Solip, Role: owner (individual developer), Email: cortex@itssophie.dev

### 10-5. 새 항목 "권익침해 구제 방법" (13항 뒤)

"개인정보 침해에 대한 신고나 상담이 필요하면 아래 기관에 문의할 수 있습니다.
- 개인정보분쟁조정위원회: (국번 없이) 1833-6972, www.kopico.go.kr
- 개인정보침해신고센터: (국번 없이) 118, privacy.kisa.or.kr
- 대검찰청: (국번 없이) 1301, www.spo.go.kr
- 경찰청: (국번 없이) 182, ecrm.police.go.kr"

영어: "If you need to report or get advice about a privacy violation, you can contact: Personal Information Dispute Mediation Committee (+82) 1833-6972, www.kopico.go.kr; Personal Information Infringement Report Center 118, privacy.kisa.or.kr; Supreme Prosecutors' Office 1301, www.spo.go.kr; Korean National Police Agency 182, ecrm.police.go.kr."

## 11. 계정 삭제 안내 "남는 데이터" (법무 리뷰 L-4, `legal/delete-account.html`)

추가: "AI 분석에 동의했다면, AI 업체(Anthropic)에 보낸 사본은 탈퇴와 관계없이 최대 30일 뒤 자동 삭제됩니다(이용 정책 위반 조사가 필요한 경우 더 오래 보관될 수 있음)."

영어: "If you agreed to AI analysis, the copies sent to the AI provider (Anthropic) are deleted automatically within 30 days regardless of account deletion (longer if a usage policy investigation requires it)."

## 12. 이용 연령 (결정 L6 = A, 2026-11-05)

- 약관 제5조에 4항 추가: "서비스는 만 18세 이상만 이용할 수 있습니다. 만 18세 미만임이 확인되면 운영자는 이용계약을 해지하고 계정과 콘텐츠를 삭제할 수 있습니다."
  - 영어: "You must be 18 or older to use the Service. If we learn that a user is under 18, we may end the agreement and delete the account and its content."
- 방침 10항 "이 서비스는 만 14세 미만 아동을 대상으로 하지 않으며…" → "이 서비스는 만 18세 이상만 이용할 수 있으며, 만 18세 미만의 개인정보를 알고 수집하지 않습니다. 만 18세 미만의 정보가 수집된 것을 알게 되면 지체 없이 삭제합니다."
  - 영어: "The Service is only for people 18 or older, and we do not knowingly collect personal data of anyone under 18. If we learn that we have, we delete it without delay."
- Play Console › 앱 콘텐츠 › 타깃층: 18세 이상만 (Sophie가 바꿈)
- 이용자에게 불리할 수 있는 변경이라 시행 30일 전 공지 대상인지 게시 전에 확인

## 13. 일본 사용자 국외 제공 안내 (결정 L3 = A, 2026-11-05)

- 앱: 일본어 AI 동의 화면에 "米国の個人情報保護制度とAnthropicの保護措置" 링크 줄 추가 (코드 반영)
- 일본어 방침·약관: 7항 번역 계획에서 일본어를 먼저, 출시 전에 게시. 국외이전 항목에 이전 국가(미국)의 개인정보 제도 요약 링크(PPC 외국 제도 조사)와 Anthropic의 보호 조치(상용 약관상 학습 미사용, 30일 삭제, 암호화 전송)를 적음

## 14. 불법 콘텐츠 금지와 조치 (Sophie, 2026-11-07)

Cortex는 저장된 사진을 미리 검사하지 않아요(비공개 보관이라 열람하지 않음). 대신 금지와 신고·삭제 절차를 약관에 적어 두는 것이 방어장치예요.

- 약관 제8조에 5항 추가: "이용자는 불법촬영물, 아동·청소년성착취물, 그 밖에 법령에서 제작·소지·유통을 금지한 정보를 저장해서는 안 됩니다. 운영자는 신고나 수사기관 등의 적법한 요청으로 이를 알게 되면 해당 콘텐츠를 삭제하거나 접근을 막고, 이용계약을 해지할 수 있으며, 법령에 따라 관계 기관에 협조합니다."
  - 영어: "You must not store non-consensual intimate images, child sexual abuse material, or any other content that the law prohibits making, possessing or distributing. If we learn of such content through a report or a lawful request from authorities, we may delete it or block access to it, end the agreement, and cooperate with the relevant authorities as the law requires."
- 5항(권리 침해 신고) 메일 신고 문장을 "권리 침해 또는 불법 콘텐츠"로 넓힘.
- 기록: 이런 신고·조치는 `docs/legal-drafts/requests-log.md`에 같은 형식으로 남김(요청 종류 "불법 콘텐츠").
- 사진 자동 검사는 넣지 않음: 비용, 그리고 비공개 사진을 들여다보는 부담이 더 큼. 공유 기능이 생기면 다시 판단.

## 15. 반영 현황 (2026-11-08)

- 방침(한·영) 게시 2026-11-07, 시행 11-14: 6항(18세 제외), 9·10항, 보호책임자 최솔잎.
- 약관(한·영) 개정 준비 2026-11-08, 시행 11-15: 3·4·5·8항, 14항(불법 콘텐츠). 배포 전.
- 일본어 방침 `legal/privacy-ja.html`(13항 L3 포함). 일본어 약관은 아직(앱은 영어 약관을 엶).
- 남음: 1·2항 판매자 정보, 12항 18세(불리한 변경이라 30일 전 공지, Play 타깃 연령 변경과 같이), 7항 중국어 번역.

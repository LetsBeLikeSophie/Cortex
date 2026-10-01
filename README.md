# Cortex

링크, 텍스트, 스크린샷으로 저장한 것들을 Claude가 자동으로 분류해주는 개인 아카이브 앱. "제2의 두뇌"처럼 목적 상관없이(맛집, 쇼핑, 덕질, 할 일 메모 등) 뭐든 던져 넣고 태그로 다시 찾을 수 있게 만드는 걸 목표로 함.

- 웹: https://itssophie.dev/cortex/
- 백엔드 API: https://itssophie.dev/cortex-api/
- 안드로이드 APK: https://itssophie.dev/cortex-apk/cortex.apk

## 저장소 구조

```
backend/   Fastify + TypeScript API 서버
mobile/    Expo(React Native) 앱 -- 웹/안드로이드 동시 빌드
```

## 핵심 기능

- 공유시트(카카오톡/인스타 등에서 공유), 클립보드 붙여넣기, 최근 스크린샷 여러 장 선택으로 저장
- Claude가 저장할 때마다 자동으로 분류:
  - **카테고리**: 의도 기반 6종 -- 가볼 곳 / 살 것 / 배울 것 / 볼 것 / 기억할 것 / 기타
  - **태그**: 자유 형식 키워드 (AI가 붙인 태그와 직접 추가한 태그는 구분되고, 둘 다 삭제 가능)
- 카카오 로그인 또는 게스트(익명) 로그인
- 태그 기반 검색, 즐겨찾기, 휴지통(소프트 삭제)
- 저장 현황 통계 화면

## 기술 스택

- **Mobile**: Expo SDK 57 (React Native 0.86, React 19), React Navigation
- **Backend**: Node.js + TypeScript + Fastify
- **DB / Storage / Auth**: Supabase (Postgres + Storage + Auth, 카카오 OAuth + 익명 로그인)
- **분류 AI**: Anthropic Claude API (텍스트는 claude.messages, 스크린샷은 vision)
- **배포**: Oracle Cloud VM(Tokyo, Always Free 티어) + nginx + systemd, 안드로이드 APK는 자체 도메인에서 직접 배포

## 로컬 개발 환경

### 백엔드

```bash
cd backend
npm install
cp .env.example .env   # ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 채우기
npm run dev             # http://localhost:8787
```

Supabase 프로젝트를 새로 만들었다면 `backend/db/schema.sql`을 SQL 에디터에서 한 번 실행하고, `item-screenshots`라는 이름의 Storage 버킷(private)을 만들어야 함.

### 모바일

```bash
cd mobile
npm install
```

`mobile/.env`에 백엔드 주소를 지정해야 함 (빌드 타임에 번들에 박히므로 반드시 필요):

```
EXPO_PUBLIC_API_URL=http://<내 PC의 LAN IP>:8787
```

```bash
npx expo start --web   # 웹에서 확인
# 또는
npx expo start         # Expo Go / 에뮬레이터
```

Expo SDK가 자주 바뀌므로 코드를 건드리기 전에 `mobile/AGENTS.md`에 적힌 버전별 공식 문서를 먼저 확인할 것.

## 주요 API 엔드포인트 (backend)

- `POST /items` -- 링크/텍스트/스크린샷 저장 (`src/lib/pipeline.ts`가 Claude 분류까지 처리)
- `GET /items`, `GET /items/search`, `GET /items/stats`
- `GET /items/trash`, `POST /items/:id/restore`, `DELETE /items/:id`, `DELETE /items/:id/permanent`
- `POST /items/:id/tags`, `DELETE /items/:id/tags/:tag` (사용자 태그), `DELETE /items/:id/tags/ai/:tag` (AI 태그)
- `POST /auth/kakao`, `DELETE /auth/me`, `POST /auth/seed-sample`

## 배포 메모

- 백엔드는 Oracle VM에서 systemd 서비스(`cortex-backend`)로 상시 구동, nginx가 `/cortex-api/`로 리버스 프록시.
- 웹 빌드(`expo export -p web`)는 `/var/www/cortex-app/`에 정적 배포.
- 안드로이드 릴리스는 `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a`로 arm64 전용 빌드 후 `/var/www/cortex-apk/cortex.apk`에 덮어쓰는 방식 (버전별로 파일명을 따로 두지 않고 같은 URL을 계속 갱신).
- 이용약관/개인정보처리방침은 `/cortex/legal/terms.html`, `/cortex/legal/privacy.html`에 별도 정적 파일로 호스팅 (앱 재배포와 무관하게 유지).

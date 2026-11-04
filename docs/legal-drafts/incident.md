# 유출 대응 (한 장)

근거: 개인정보보호법 34조, 시행령 39·40조. 법 해석이 필요한 판단(신고 대상인지 등)은 개인정보위 유출신고 안내(https://pipc.go.kr/np/default/page.do?mCode=D030040000) 또는 118에 물어 확인해요.

## 1. 알아챈 시각 적기

- 알아챈 날짜·시각(한국 시간)과 무엇을 보고 알았는지. 72시간은 이 시각부터 세요.

## 2. 범위 확인

- 무엇이 새었나: 키(Supabase service role, Anthropic, Google 서비스 계정, 카카오 Admin Key, RTDN 비밀값), DB 행, 저장소 파일, 서버 로그
- 누구의 것: 계정 수, 게스트 포함 여부
- 민감한 내용 가능성: 저장한 사진·메모에는 무엇이든 있을 수 있으니 "있을 수 있음"으로 봐요

## 3. 막기

- 새었거나 의심되는 키를 모두 새로 발급하고 서버 `.env`를 바꾼 뒤 재시작(Sophie가 함)
- 필요하면 서버를 잠시 멈춤
- VM이 의심되면 SSH 키도 교체

## 4. 72시간 안에 판단

| 할 일 | 언제 | 기준 |
|---|---|---|
| 이용자에게 알림 | 알게 된 뒤 72시간 안 | 인원과 관계없이 새어 나간 사람에게 |
| 개인정보위·KISA 신고 | 72시간 안 | 1천 명 이상, 민감정보·고유식별정보, 외부 침입(해킹) 중 하나라도 해당 |

다 확인되지 않았어도 72시간 안에 아는 만큼 먼저 알리고, 나머지는 확인되는 대로 덧붙여요.

## 5. 알림 문구

이메일(Google 로그인)과 앱 안 공지로 보내요.

**한국어**

> [Cortex] 개인정보 유출 안내
>
> [날짜]에 [무엇이] 외부에 노출된 사실을 알게 되었습니다.
> - 노출된 항목: [항목]
> - 노출 시점과 경위: [시점, 경위]
> - 저희가 한 조치: [키 교체, 차단 등]
> - 피해를 줄이기 위해 하실 수 있는 일: [예: Cortex를 사칭한 메일·메시지 주의]
> - 문의: cortex@itssophie.dev
> - 피해 구제: 개인정보침해신고센터 118, 개인정보분쟁조정위원회 1833-6972
>
> 불편과 걱정을 드려 죄송합니다.

**English**

> [Cortex] Notice of a personal data leak
>
> On [date] we learned that [what] was exposed.
> - What was exposed: [items]
> - When and how: [time, cause]
> - What we have done: [key rotation, blocking, etc.]
> - What you can do: [e.g. watch for mail or messages pretending to be Cortex]
> - Contact: cortex@itssophie.dev
>
> We're sorry for the worry this causes.

## 6. 기록

- 이 파일 아래에 날짜별로 무엇을 언제 했는지 적어요(알아챈 시각, 막은 시각, 알림·신고 시각).

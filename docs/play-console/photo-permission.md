# Play Console: 사진 권한(READ_MEDIA_IMAGES) 신고서 준비 (2026-10-23)

> **지난 기록이에요.** 1.0.1(2026-10-24)에서 사진첩 권한을 뺐어요. 지금은 사진 선택 화면과 공유하기로만 받아서 신고서가 필요 없어요. 아래 파일 경로도 그때 기준이에요.

## 1. 알아 둘 것

- **휴대폰의 "사진 접근 허용"(안드로이드 권한)과 Google Play 정책은 별개예요.**
  사용자가 허용하면 앱은 사진을 볼 수 있어요. 그런데 Google Play는 2025년 5월 28일부터 그 권한을 *요청할 수 있는 앱*을 제한해요. 앱이 권한을 쓰겠다고 신고서를 내면, Google이 "사진 선택기로 충분하지 않은가"를 심사해요.
- **허용되는 경우:** 사진첩 전체를 관리·유지하는 것이 핵심 기능인 앱이에요(대표 예: 갤러리 앱). Google 문서에 다른 예시는 거의 없어요.
- **거절되는 대표 경우:** 프로필 사진 올리기처럼 "가끔 한 장 고르는" 용도예요.
- **Cortex의 위치(솔직한 판단):** 경계선이에요. 최근 스크린샷 12장을 보여 주는 줄과, 저장 뒤 원본을 지우는 기능은 "선택기로는 안 되는 기능"이에요. 하지만 Google이 "핵심 기능이 아니라 편의 기능"으로 볼 가능성도 꽤 있어요. **거절될 수 있다고 보고 대안(4번)까지 준비해 두는 게 안전해요.**
- 권한을 주지 않은 사용자도 쓸 수 있어야 해요. 이 조건은 충족해요. "앨범에서 고르기"(안드로이드 기본 사진 선택기)와 다른 앱의 "공유하기"로 저장할 수 있어요.

## 2. 앱이 실제로 하는 일 (신고서에 쓰는 사실, 코드로 확인함)

| 기능 | 권한이 필요한 이유 | 코드 |
|---|---|---|
| 저장 화면의 "최근 스크린샷" 줄 | 기기의 스크린샷 앨범에서 최근 12장을 *기기 안에서* 보여 줌. 서버로 보내지 않음 | `mobile/src/hooks/useRecentScreenshots.ts` |
| 여러 장 저장 후 "원본 지우기" | 저장에 성공한 사진만, 안드로이드의 삭제 확인 창을 거쳐 기기에서 지움. 사진 선택기로 받은 사진은 지울 수 없음 | `SaveSheetScreen.tsx` `deleteOriginalScreenshots` |
| 권한 범위 | 사진만 요청(`granularPermissions: ['photo']`). 동영상·오디오 권한은 매니페스트에서 제거함 | `app.json` `blockedPermissions` |
| 권한 요청 시점 | 저장 화면을 열 때만. 앱 시작 때 요청하지 않음 | `useRecentScreenshots.ts` |
| 거부한 사용자 | "앨범에서 고르기"(시스템 사진 선택기), 다른 앱의 공유하기로 저장 가능 | `SaveSheetScreen.tsx` `pickFromLibrary` |

## 3. 신고서에 붙여 넣을 문구

Play Console › 정책 및 프로그램 › 앱 콘텐츠 › "사진 및 동영상 권한"에 넣어요. Play Console 언어에 맞춰 영어본이나 한국어본을 쓰면 돼요.

### READ_MEDIA_IMAGES: 영어 (권장)

> Cortex is a personal archive for screenshots. Its core workflow is turning the screenshots that pile up in the device's Screenshots album into an organized archive, then clearing them from the gallery.
>
> 1. On the save screen, Cortex shows the most recent screenshots from the device's Screenshots album so the user can archive several in one tap. This list is rendered on the device only and is never uploaded; only the screenshots the user selects are uploaded.
> 2. After the selected screenshots are archived, Cortex offers to delete those originals from the device (through the system's delete confirmation), so the gallery doesn't keep duplicates. Only files that were archived successfully are deleted.
>
> The Android Photo Picker cannot support this: it cannot list the Screenshots album proactively, and the items it returns cannot be deleted from the user's media library, so the archive-then-clean-up workflow is impossible with it.
>
> We request images only (READ_MEDIA_IMAGES; video and audio permissions are removed). The permission is requested only when the user opens the save screen. Users who decline (or grant "selected photos only") can still save through the system Photo Picker ("pick from album") or through Android's share sheet, with no loss of the app's other features.

### READ_MEDIA_IMAGES: 한국어

> Cortex는 스크린샷을 위한 개인 아카이브 앱입니다. 핵심 기능은 기기 스크린샷 앨범에 쌓인 스크린샷을 정리된 아카이브로 옮기고, 갤러리에서 비우는 것입니다.
>
> 1. 저장 화면에 기기 스크린샷 앨범의 최근 스크린샷을 보여 주어, 여러 장을 한 번에 보관할 수 있게 합니다. 이 목록은 기기 안에서만 표시되며 업로드되지 않습니다. 사용자가 고른 스크린샷만 업로드됩니다.
> 2. 보관이 끝나면, 보관에 성공한 원본만 시스템 삭제 확인을 거쳐 기기에서 지울 수 있게 합니다. 갤러리에 중복이 남지 않습니다.
>
> Android 사진 선택기로는 이 기능을 제공할 수 없습니다. 선택기는 스크린샷 앨범을 먼저 보여 줄 수 없고, 선택기로 받은 사진은 사용자의 미디어 라이브러리에서 삭제할 수 없어 "보관 후 정리" 흐름이 불가능합니다.
>
> 이미지 권한만 요청하며(동영상·오디오 권한은 제거), 저장 화면을 열 때만 요청합니다. 거부하거나 "선택한 사진만 허용"한 사용자도 시스템 사진 선택기("앨범에서 고르기")나 안드로이드 공유하기로 저장할 수 있고, 다른 기능에는 제한이 없습니다.

### READ_MEDIA_VIDEO

해당 없음이에요. 이 권한은 요청하지 않아요(매니페스트에서 제거). 만약 묻는다면 "This app does not request READ_MEDIA_VIDEO."

### 시연 영상 (요청받을 때를 대비)

30초 이내 화면 녹화로 준비해요.
1. 홈 → + → 저장 화면에서 사진 권한 요청이 뜨고 허용해요.
2. 최근 스크린샷 줄이 보이면 3장을 골라 저장해요.
3. "원본 지우기"를 누르고 시스템 삭제 확인에서 허용해요.
4. 갤러리에서 3장이 사라진 걸 보여 줘요.
5. (선택) 권한을 거부한 상태에서 "앨범에서 고르기"로도 저장되는 걸 보여 줘요.

## 4. 거절되면 대안 (미리 정해 둘 것)

1. 매니페스트에서 `READ_MEDIA_IMAGES`·`READ_MEDIA_VISUAL_USER_SELECTED`를 제거해요(`app.json` `blockedPermissions`에 추가).
2. 저장 화면의 "최근 스크린샷" 줄을 없애고, 사진은 "앨범에서 고르기"(사진 선택기, 여러 장 가능)로만 받아요.
3. "원본 지우기"를 없애요. 원본 정리는 **Mehh**(사진 정리 앱)가 맡아요. Mehh에서 Cortex로 공유하고, 저장되면 Mehh가 원본을 정리하는 흐름이 이미 있어요.
4. 개인정보처리방침의 "기기 사진첩 접근" 항목을 그에 맞게 고쳐요.

작업량은 반나절 정도예요. 심사 결과를 보고 진행하면 돼요.

## 5. 함께 내야 하는 "데이터 보안" 양식 (Play Console › 앱 콘텐츠 › 데이터 보안)

개인정보처리방침(2026-10-30 시행본)과 똑같이 답해야 해요. 다르면 거절 사유가 돼요.

| 질문 | 답 |
|---|---|
| 데이터를 수집하나요? | 예 |
| 전송 중 암호화하나요? | 예 (HTTPS) |
| 사용자가 데이터 삭제를 요청할 수 있나요? | 예 (앱 내 탈퇴. 웹 삭제 요청 주소도 필요하므로 개인정보처리방침 URL과 문의 이메일을 적어요) |
| 사진 및 동영상 › 사진 | 수집함 · 앱 기능 · 선택 항목(사용자가 고른 것만) |
| 앱 활동 › 기타 사용자 생성 콘텐츠(글·링크·메모·태그) | 수집함 · 앱 기능 |
| 개인 정보 › 이름(카카오 닉네임), 사용자 ID | 수집함 · 계정 관리 |
| 금융 정보 › 구매 내역 | 수집함 · 앱 기능(Pro 확인) |
| 앱 정보 및 성능 / 기기 ID | 수집 안 함 (광고 ID 없음, 접속 로그는 보안용 14일) |
| 오디오 | 수집 안 함 (음성은 기기에서 글자로 바뀌고, 운영자는 녹음을 받지 않음) |
| "공유"하나요? | 아니요. Anthropic·Supabase·Oracle·Google은 운영자 대신 처리하는 **서비스 제공업체**라서, Play 정의상 "공유"가 아니에요. 단, 개인정보처리방침에는 국외이전으로 모두 적어 두었어요. |

> 주의: Play의 "공유" 정의에서 서비스 제공업체 예외를 쓰려면 그 업체가 운영자 지시대로만 처리해야 해요. Anthropic 상용 약관은 "고객 콘텐츠로 학습하지 않음"을 명시하니 해당돼요.

## 출처
- Google Play 사진·동영상 권한 정책: https://support.google.com/googleplay/android-developer/answer/14115180
- 민감한 권한·API 신고: https://support.google.com/googleplay/android-developer/answer/16558241
- 거절 사례(Bubble 포럼): https://forum.bubble.io/t/google-play-rejection-due-to-read-media-images-read-media-video/381736
- 거절 경험담(ProAndroidDev): https://proandroiddev.com/beware-of-read-media-images-not-just-a-feeling-of-rejection-aa1ddacaff5d
- Anthropic 상용 약관(학습 미사용): https://www.anthropic.com/legal/commercial-terms
- Anthropic 데이터 보관 30일: https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-data

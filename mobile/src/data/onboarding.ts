import AsyncStorage from '@react-native-async-storage/async-storage';

// Client half of the first-run use-case picker -- just what's shown on the
// sheet. Which tags/examples each one seeds lives server-side
// (backend/src/lib/onboarding.ts); keys must match USE_CASES there. `tabs`
// is repeated here only as a preview of what will be pinned.
export type UseCaseKey = 'fandom' | 'food' | 'shopping' | 'study';

export const USE_CASE_OPTIONS: { key: UseCaseKey; label: string; note: string; tabs: string[] }[] = [
  { key: 'fandom', label: '덕질', note: '포토카드, 직캠, 공지를 한곳에', tabs: ['포토카드', '직캠', '공지'] },
  { key: 'food', label: '맛집 · 여행', note: '가고 싶은 곳, 카페, 여행 코스', tabs: ['맛집', '카페', '여행'] },
  { key: 'shopping', label: '쇼핑', note: '위시리스트, 할인 링크, 선물 후보', tabs: ['위시리스트', '할인', '선물'] },
  { key: 'study', label: '공부 · 레시피', note: '레시피, 공부 자료, 생활 꿀팁', tabs: ['레시피', '공부', '꿀팁'] },
];

// Per-device "already seen the picker" flag. Home only ever opens the
// picker for an account that's basically empty (the guide item at most),
// so an existing user updating the app never gets it.
const ONBOARDED_KEY = 'cortex:onboarded';

export async function isOnboarded(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
  } catch {
    return true; // storage unavailable -- never nag
  }
}

export async function markOnboarded(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
  } catch {
    // Non-fatal -- worst case the picker shows once more.
  }
}

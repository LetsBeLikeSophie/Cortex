import AsyncStorage from '@react-native-async-storage/async-storage';

// App language: the device's, unless the person picks one in the profile.
// It decides both the menus (Korean, English, Japanese, Chinese
// Simplified/Traditional -- any other language gets English menus) and the
// language AI memos are written in (any language when on "device").
//
// Strings live next to the code that shows them:
//
//   const S = strings({
//     ko: { save: '저장', left: (n: number) => `${n}회 남음` },
//     en: { save: 'Save', left: (n: number) => `${n} left` },
//     ja: { ... }, 'zh-Hans': { ... }, 'zh-Hant': { ... },
//   });
//   <Text>{S.save}</Text>
//
// Korean is the source: the other languages must have the same keys and
// shapes (TypeScript checks it). S is read at render time, so a language
// change shows on the next render -- never copy S.x into a module-level
// constant.

export type Lang = 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant';
// 'device' = follow the phone's setting.
export type LangPref = 'device' | Lang;

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    return 'en';
  }
}

export function langFromLocale(locale: string): Lang {
  const l = locale.toLowerCase();
  if (l.startsWith('ko')) return 'ko';
  if (l.startsWith('ja')) return 'ja';
  if (l.startsWith('zh')) {
    return /hant|-tw|-hk|-mo/.test(l) ? 'zh-Hant' : 'zh-Hans';
  }
  return 'en';
}

const DEVICE = deviceLocale();
const LEGAL_BASE = 'https://itssophie.dev/cortex/legal/';
export const TOKUSHOHO_URL = LEGAL_BASE + 'tokushoho.html';

// Live bindings: reassigned by setLanguage, read where they're used.
// DEVICE_LOCALE is what the server writes AI output in (a full locale such
// as "ja-JP" on "device", so languages the menus don't cover still work).
export let LANG: Lang = langFromLocale(DEVICE);
export let DEVICE_LOCALE = DEVICE;
export let LANG_PREF: LangPref = 'device';
export let PRIVACY_URL = '';
export let TERMS_URL = '';

function apply(pref: LangPref) {
  LANG_PREF = pref;
  LANG = pref === 'device' ? langFromLocale(DEVICE) : pref;
  DEVICE_LOCALE = pref === 'device' ? DEVICE : pref;
  PRIVACY_URL = LEGAL_BASE + (LANG === 'ko' ? 'privacy.html' : 'privacy-en.html');
  TERMS_URL = LEGAL_BASE + (LANG === 'ko' ? 'terms.html' : 'terms-en.html');
}
apply('device');

const KEY = 'cortex.language';
const listeners = new Set<() => void>();

// Read the saved choice before the first screen renders (App waits on it).
export async function loadLanguage(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === 'device' || v === 'ko' || v === 'en' || v === 'ja' || v === 'zh-Hans' || v === 'zh-Hant') apply(v);
  } catch {
    // keep the device language
  }
}

export function setLanguage(pref: LangPref): void {
  apply(pref);
  AsyncStorage.setItem(KEY, pref).catch(() => {});
  listeners.forEach((fn) => fn());
}

// App re-renders its whole tree when the language changes.
export function onLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => Widen<R>
    : T extends readonly (infer U)[]
      ? readonly Widen<U>[]
      : T extends object
        ? { [K in keyof T]: Widen<T[K]> }
        : T;

export function strings<T extends object>(table: { ko: T } & Record<Exclude<Lang, 'ko'>, Widen<T>>): Widen<T> {
  // Resolved per access, so it follows the current language.
  return new Proxy({} as Widen<T>, {
    get: (_target, key) => ((table[LANG] ?? table.en) as Record<string | symbol, unknown>)[key],
  });
}

// Names shown in the picker, each in its own language.
export const LANGUAGE_NAMES: Record<Lang, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
};

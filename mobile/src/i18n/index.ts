// App UI language: picked once at startup from the device setting.
// Supported: Korean, English, Japanese, Chinese (Simplified / Traditional).
// Any other device language gets English. Changing the phone's language
// takes effect the next time the app starts.
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
// shapes (TypeScript checks it).

export type Lang = 'ko' | 'en' | 'ja' | 'zh-Hans' | 'zh-Hant';

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

// The device's full locale (e.g. "ja-JP"), sent to the server so AI output
// is written in it -- even for languages the UI itself doesn't cover.
export const DEVICE_LOCALE = deviceLocale();
export const LANG: Lang = langFromLocale(DEVICE_LOCALE);

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
  return (table[LANG] ?? table.en) as Widen<T>;
}

// The privacy policy / terms pages: Korean, or the English translation.
const LEGAL_BASE = 'https://itssophie.dev/cortex/legal/';
export const PRIVACY_URL = LEGAL_BASE + (LANG === 'ko' ? 'privacy.html' : 'privacy-en.html');
export const TERMS_URL = LEGAL_BASE + (LANG === 'ko' ? 'terms.html' : 'terms-en.html');

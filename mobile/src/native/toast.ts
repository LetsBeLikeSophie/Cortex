import { Alert, Platform, ToastAndroid } from 'react-native';
import { strings } from '../i18n';

const S = strings({
  ko: {
    needed: (what: string) => `${what} 권한이 필요해요`,
    inSettings: (what: string) => `설정에서 ${what} 권한을 허용해 주세요`,
  },
  en: {
    needed: (what: string) => `${what} permission is needed`,
    inSettings: (what: string) => `Allow ${what} permission in Settings`,
  },
  ja: {
    needed: (what: string) => `${what}の許可が必要です`,
    inSettings: (what: string) => `設定で${what}を許可してください`,
  },
  'zh-Hans': {
    needed: (what: string) => `需要${what}权限`,
    inSettings: (what: string) => `请在设置中允许${what}权限`,
  },
  'zh-Hant': {
    needed: (what: string) => `需要${what}權限`,
    inSettings: (what: string) => `請在設定中允許${what}權限`,
  },
});

// A short message that goes away on its own -- for things like "카메라 권한이
// 필요해요" that don't need to stay pinned in the layout or offer a link
// (tapping the same button again just asks for the permission again).
// Android has a native toast; elsewhere (web/iOS) a plain alert stands in,
// since this app ships Android-first.
export function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

// Shared wording for a denied runtime permission: while Android will still
// show its prompt, just say what's needed; once it won't ("don't ask
// again"), say where to turn it on instead -- no link, the toast is enough.
export function permissionToast(what: string, canAskAgain: boolean) {
  showToast(canAskAgain ? S.needed(what) : S.inSettings(what));
}

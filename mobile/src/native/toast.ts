import { Alert, Platform, ToastAndroid } from 'react-native';

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
  showToast(canAskAgain ? `${what} 권한이 필요해요` : `설정에서 ${what} 권한을 허용해 주세요`);
}

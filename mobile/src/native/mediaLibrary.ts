import { Platform } from 'react-native';

// expo-media-library's class-based API (Album/Asset/Query) extends a native
// module class directly, so merely *importing* the package -- without
// calling anything -- throws on web (no native module behind it there) and
// takes the whole bundle down with it. Every file that needs this library
// should import the default export from here instead of 'expo-media-library'
// directly, so the require only ever runs on native.
const MediaLibrary: typeof import('expo-media-library') | null =
  Platform.OS === 'web' ? null : require('expo-media-library');

export default MediaLibrary;

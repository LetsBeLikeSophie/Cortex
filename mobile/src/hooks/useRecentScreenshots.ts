// A photo in the save sheet's multi-photo batch (an album multi-pick or a
// multi-share). Cortex reads no photo library itself: photos come in only
// through the system photo picker or the share sheet.
export interface RecentScreenshot {
  id: string;
  uri: string;
  // Already-read image data, when the picker handed it over. Bulk save uses
  // it as-is instead of re-reading the file -- re-reading via
  // expo-file-system doesn't work on web.
  base64?: string;
}

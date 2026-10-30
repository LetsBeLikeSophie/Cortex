import AsyncStorage from '@react-native-async-storage/async-storage';
import { forgetReminders } from '../native/reminders';

// What one account leaves on the phone that the next one signed in here
// must not see: the save screen's unsent draft, the AI's tag-merge
// suggestion, and the planned reminders (the weekly one names memos).
export const SAVE_DRAFT_KEY = 'cortex.saveDraft';
export const TAG_SUGGESTION_KEY = 'cortex.tagCleanupSuggestion';

// Run on sign-out and account deletion of a real account. A guest's
// "로그아웃" (pauseGuest) only hides the same account, so it keeps these.
export async function clearAccountTraces(): Promise<void> {
  await forgetReminders();
  await AsyncStorage.multiRemove([SAVE_DRAFT_KEY, TAG_SUGGESTION_KEY]).catch(() => {});
}

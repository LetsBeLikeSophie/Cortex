import AsyncStorage from '@react-native-async-storage/async-storage';
import { forgetReminders } from '../native/reminders';

// What one account leaves on the phone that the next one signed in here
// must not see: the save screen's unsent draft, the AI's tag-merge
// suggestion, and the planned reminders (the weekly one names memos).
export const SAVE_DRAFT_KEY = 'cortex.saveDraft';
export const TAG_SUGGESTION_KEY = 'cortex.tagCleanupSuggestion';
export const TRIAL_NOTICE_KEY = 'cortex.trialNoticeSeen';

// An account has been used on this phone, so the login screen offers that
// instead of a guest. Stays through a sign-out; goes with the account.
const HAD_ACCOUNT_KEY = 'cortex.hadAccount';

export const rememberAccountOnPhone = () => AsyncStorage.setItem(HAD_ACCOUNT_KEY, '1').catch(() => {});
export const forgetAccountOnPhone = () => AsyncStorage.removeItem(HAD_ACCOUNT_KEY).catch(() => {});
export const accountWasOnPhone = async () => !!(await AsyncStorage.getItem(HAD_ACCOUNT_KEY).catch(() => null));

// Run on sign-out and account deletion of a real account. A guest's
// "로그아웃" (pauseGuest) only hides the same account, so it keeps these.
export async function clearAccountTraces(): Promise<void> {
  await forgetReminders();
  await AsyncStorage.multiRemove([SAVE_DRAFT_KEY, TAG_SUGGESTION_KEY, TRIAL_NOTICE_KEY]).catch(() => {});
}

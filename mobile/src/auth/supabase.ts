import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// The publishable/anon key is meant to ship in client bundles -- it only
// grants what the project's RLS policies allow (see backend/db/schema.sql),
// unlike the service-role key the backend uses.
const SUPABASE_URL = 'https://brzxggvawcyuiteleelm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_atRCHo4-v3BopG2-_ow14A_IQHl8ehI';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Only the web build gets redirected back with the session in the URL
    // (?code=... after Kakao); native goes through WebBrowser + a deep link
    // instead (see kakaoLogin.ts), so it never needs this parsed.
    detectSessionInUrl: Platform.OS === 'web',
  },
});

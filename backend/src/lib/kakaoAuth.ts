import { createClient } from "@supabase/supabase-js";
import { required } from "../config.js";
import { deleteUserAccount, logAnalyticsEvent } from "./supabase.js";

interface KakaoTokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string;
  expires_in: number;
}

interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
}

async function exchangeKakaoCode(code: string, redirectUri: string): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: required("KAKAO_REST_API_KEY"),
    redirect_uri: redirectUri,
    code,
  });
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (clientSecret) params.set("client_secret", clientSecret);

  const res = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`kakao token exchange failed: ${await res.text()}`);
  const data = (await res.json()) as KakaoTokenResponse;
  return data.access_token;
}

async function fetchKakaoUser(kakaoAccessToken: string): Promise<KakaoUserResponse> {
  const res = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { Authorization: `Bearer ${kakaoAccessToken}` },
  });
  if (!res.ok) throw new Error(`kakao user fetch failed: ${await res.text()}`);
  return (await res.json()) as KakaoUserResponse;
}

export interface KakaoLoginResult {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email: string | null };
}

// Bridges Kakao's OAuth flow into a real Supabase session by hand, instead
// of using Supabase's built-in Kakao provider. That provider unconditionally
// adds the account_email scope to every request on top of whatever scopes
// we ask for, and Kakao rejects the whole login (KOE205) unless that scope
// is an approved consent item -- which needs a Kakao review we're skipping
// since the app doesn't need email at all. Doing the token exchange
// ourselves means only profile_nickname + profile_image ever get requested
// (see mobile's kakaoLogin.ts, which builds the authorize URL directly).
export async function loginWithKakaoCode(code: string, redirectUri: string): Promise<KakaoLoginResult> {
  const kakaoAccessToken = await exchangeKakaoCode(code, redirectUri);
  const kakaoUser = await fetchKakaoUser(kakaoAccessToken);

  const nickname = kakaoUser.kakao_account?.profile?.nickname ?? null;
  const avatarUrl = kakaoUser.kakao_account?.profile?.profile_image_url ?? null;

  // Kakao gives us no email by design (see above), but Supabase Auth still
  // wants a unique identifier per user. A synthetic, never-delivered email
  // keyed off the stable Kakao user id works fine as one -- it's a primary
  // key here, not a contact address.
  const syntheticEmail = `kakao-${kakaoUser.id}@users.cortex.app`;

  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));
  const metadata = { provider: "kakao", kakao_id: kakaoUser.id, nickname, avatar_url: avatarUrl };

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (createError) {
    if (!/already/i.test(createError.message)) {
      throw new Error(`failed to create user: ${createError.message}`);
    }
    // Existing user logging in again -- refresh their profile instead of
    // leaving whatever nickname/photo they had at signup permanently
    // stale. generateLink below still targets them by email either way,
    // so this lookup only exists for the update.
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = userList?.users.find((u) => u.email === syntheticEmail);
    if (existing) {
      await admin.auth.admin.updateUserById(existing.id, { user_metadata: metadata });
    }
  } else if (createData.user) {
    await logAnalyticsEvent({ eventType: "account_created", userId: createData.user.id });
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: syntheticEmail,
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) throw new Error(`failed to generate session link: ${linkError?.message}`);

  // generateLink's hashed_token is verified via the `token_hash` field, not
  // `token` -- `token` is for the separate numeric-OTP flow (email/sms
  // codes). Passing it as `token` silently fails auth ("Token has expired
  // or is invalid") regardless of how fresh it actually is.
  const { data: verified, error: verifyError } = await admin.auth.verifyOtp({
    token_hash: hashedToken,
    type: "magiclink",
  });
  if (verifyError || !verified.session) throw new Error(`failed to verify session: ${verifyError?.message}`);

  return {
    access_token: verified.session.access_token,
    refresh_token: verified.session.refresh_token,
    expires_at: verified.session.expires_at ?? 0,
    user: { id: verified.session.user.id, email: verified.session.user.email ?? null },
  };
}

// Deletes the account entirely -- Kakao login is the only way in, so
// there's no lesser "unlink but keep the account" state that makes sense
// here. Calling Kakao's own unlink API (rather than just deleting our
// side) also means Kakao's "연결된 서비스" list stops showing Cortex as
// attached; per Kakao's docs, a service-initiated unlink like this does
// *not* re-trigger the unlink webhook, so this and webhooks.ts's handler
// (the reverse direction -- Kakao telling us they unlinked) don't race.
export async function deleteAccount(userId: string): Promise<void> {
  const admin = createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const kakaoId = userData?.user?.user_metadata?.kakao_id;
  const adminKey = process.env.KAKAO_ADMIN_KEY;

  if (kakaoId && adminKey) {
    // Best-effort: if this fails (already unlinked, Kakao hiccup, etc.)
    // the more important half -- deleting the local account/items -- still
    // goes ahead below.
    await fetch("https://kapi.kakao.com/v1/user/unlink", {
      method: "POST",
      headers: {
        Authorization: `KakaoAK ${adminKey}`,
        "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
      },
      body: new URLSearchParams({ target_id_type: "user_id", target_id: String(kakaoId) }).toString(),
    }).catch(() => {});
  }

  await logAnalyticsEvent({ eventType: "account_deleted", userId });
  await deleteUserAccount(userId);
}

import { createClient } from "@supabase/supabase-js";
import { required } from "../config.js";

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

  const { error: createError } = await admin.auth.admin.createUser({
    email: syntheticEmail,
    email_confirm: true,
    user_metadata: { provider: "kakao", kakao_id: kakaoUser.id, nickname, avatar_url: avatarUrl },
  });
  // Ignore "this email is already registered" -- generateLink below targets
  // the existing user by email either way. Anything else is a real failure.
  if (createError && !/already/i.test(createError.message)) {
    throw new Error(`failed to create user: ${createError.message}`);
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: syntheticEmail,
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) throw new Error(`failed to generate session link: ${linkError?.message}`);

  const { data: verified, error: verifyError } = await admin.auth.verifyOtp({
    email: syntheticEmail,
    token: hashedToken,
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

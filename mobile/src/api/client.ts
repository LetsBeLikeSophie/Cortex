import { DEVICE_LOCALE, strings } from '../i18n';
import { Platform } from 'react-native';
import { supabase } from '../auth/supabase';

export type ItemSource = 'instagram' | 'kakaotalk' | 'safari' | 'youtube' | 'memo' | 'other';
export type ItemCategory = '가볼 곳' | '살 것' | '배울 것' | '볼 것' | '기억할 것' | '기타';

// 'pending' -> just saved, classification still running server-side (title/
// category/tags below are a placeholder, not the real result yet).
// 'done' -> classification finished normally. 'failed' -> it errored out;
// the placeholder stays, but nothing further will update it on its own.
// 'unclassified' -> saved past this month's AI classification quota; no
// AI ran. It waits in 미분류함 until classified (classifyBacklog).
export type ClassificationStatus = 'pending' | 'done' | 'failed' | 'unclassified';

export type Tier = 'free' | 'trial' | 'pro';

// GET /me/plan -- mirrors Entitlement in backend/src/lib/plans.ts.
export interface Plan {
  tier: Tier;
  // Sending saved content to the AI abroad: asked once (null = not yet).
  aiConsent?: 'agreed' | 'declined' | null;
  trialEndsAt: string;
  proUntil: string | null;
  classify: { used: number; limit: number };
  search: { used: number; limit: number };
  // "모아서 만들기" this month (optional: older servers didn't send it).
  compose?: { used: number; limit: number };
  // "태그 정리하기" this month (optional: older servers didn't send it).
  tag_cleanup?: { used: number; limit: number };
  // Pro's monthly ceilings (optional: older servers didn't send it).
  proLimits?: { classify: number; search: number; compose?: number; tag_cleanup?: number };
  resetsAt: string;
  unclassifiedCount: number;
}

export interface ApiItem {
  id: string;
  source: ItemSource;
  capture_type: 'link' | 'text' | 'screenshot';
  raw_url: string | null;
  raw_text: string | null;
  thumbnail_url: string | null; // external preview image, set for capture_type 'link' when the site published one
  title: string | null;
  snippet: string | null;
  category: ItemCategory;
  tags: string[]; // AI-assigned, read-only
  user_tags: string[]; // user-added, freely add/removable
  // Why it waits in 미분류함 (null/absent: not waiting, or saved before
  // the server recorded it).
  unclassified_reason?: 'quota' | 'failed' | 'consent' | null;
  // A 모아서 만들기 memo: the items it was made from.
  composed_from?: string[] | null;
  // Opens only with the device PIN; left out of AI search and compose.
  locked?: boolean;
  user_note: string | null; // optional "why I saved this", set at save time
  classification_status: ClassificationStatus;
  shared_at: string;
  deleted_at: string | null; // non-null means it's in the trash
}

// Web preview runs on the same host as the backend (localhost during dev),
// so reuse the page's hostname. Native builds have no "page" to read from --
// point EXPO_PUBLIC_API_URL at the dev machine's LAN IP for those
// (e.g. http://192.168.0.8:8787), since "localhost" on a device means the
// device itself, not this machine.
function resolveBaseUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:8787`;
  }

  return 'http://localhost:8787';
}

export const API_BASE_URL = resolveBaseUrl();

// A frontend-only deploy (no backend behind it) would otherwise hang on the
// browser's default connect timeout -- often 60s+ -- before the read/search
// screens fall back to demo data. Fail fast instead -- but not so fast that
// a real-but-slow round trip (session-token refresh + a 1 OCPU box's own
// processing time, both before the request even reaches the network) gets
// mistaken for a dead backend; 8s was tight enough to abort ordinary loads
// in practice.
const REQUEST_TIMEOUT_MS = 20000;

// Screenshot saves go through compression + a Storage upload server-side,
// on a 1 OCPU box -- the Claude vision call used to be in this same
// request too (routinely well past 8s on its own), but classification now
// runs in the background after the row's already saved, so this only
// needs to cover compress+upload.
const SCREENSHOT_TIMEOUT_MS = 15000;

// Carries the HTTP status and parsed JSON body alongside the same message
// callers already show, so a screen can tell e.g. a 402 quota response
// apart from a real failure.
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) {
    super(message);
  }
}

// What a 402 from a metered route says (see POST /items/search/ask).
export interface QuotaError {
  error: 'quota';
  kind: 'classify' | 'search' | 'compose' | 'tag_cleanup';
  limit: number;
  tier: Tier;
  resetsAt: string;
}

const ERR = strings({
  ko: {
    aiConsent: 'AI 분석 동의가 필요해요.',
    aiUnavailable: 'AI가 잠시 쉬고 있어요. 잠시 후 다시 시도해 주세요.',
    quota: '이번 달 사용량을 다 썼어요.',
    tooMany: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    signedOut: '로그인이 풀렸어요. 다시 로그인해 주세요.',
    tooLarge: '사진이 너무 커요.',
    server: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    generic: '요청을 처리하지 못했어요.',
    timeout: '응답이 늦어요. 연결을 확인하고 다시 시도해 주세요.',
    offline: '인터넷 연결을 확인해 주세요.',
  },
  en: {
    aiConsent: 'AI analysis consent is needed.',
    aiUnavailable: 'AI is taking a short break. Please try again shortly.',
    quota: "You've used up this month's limit.",
    tooMany: 'Too many requests. Please try again shortly.',
    signedOut: "You've been logged out. Please log in again.",
    tooLarge: 'The photo is too large.',
    server: 'Something went wrong on our server. Please try again shortly.',
    generic: "Couldn't process the request.",
    timeout: 'Taking too long. Check your connection and try again.',
    offline: 'Please check your internet connection.',
  },
  ja: {
    aiConsent: 'AI分析への同意が必要です。',
    aiUnavailable: 'AIが一時的に休止中です。しばらくしてからもう一度お試しください。',
    quota: '今月の利用回数を使い切りました。',
    tooMany: 'リクエストが多すぎます。しばらくしてからもう一度お試しください。',
    signedOut: 'ログインが切れました。もう一度ログインしてください。',
    tooLarge: '写真が大きすぎます。',
    server: 'サーバーで問題が発生しました。しばらくしてからもう一度お試しください。',
    generic: 'リクエストを処理できませんでした。',
    timeout: '応答が遅れています。接続を確認してもう一度お試しください。',
    offline: 'インターネット接続を確認してください。',
  },
  'zh-Hans': {
    aiConsent: '需要先同意 AI 分析。',
    aiUnavailable: 'AI 暂时休息中，请稍后再试。',
    quota: '本月用量已用完。',
    tooMany: '请求太多，请稍后再试。',
    signedOut: '登录已失效，请重新登录。',
    tooLarge: '照片太大了。',
    server: '服务器出了点问题，请稍后再试。',
    generic: '无法处理请求。',
    timeout: '响应太慢，请检查网络后重试。',
    offline: '请检查网络连接。',
  },
  'zh-Hant': {
    aiConsent: '需要先同意 AI 分析。',
    aiUnavailable: 'AI 暫時休息中，請稍後再試。',
    quota: '本月用量已用完。',
    tooMany: '請求太多，請稍後再試。',
    signedOut: '登入已失效，請重新登入。',
    tooLarge: '照片太大了。',
    server: '伺服器出了點問題，請稍後再試。',
    generic: '無法處理請求。',
    timeout: '回應太慢，請檢查網路後重試。',
    offline: '請檢查網路連線。',
  },
});

// One readable sentence for any failure, instead of the raw
// "GET /items failed (503): {...}" text (which still goes to the console).
export function friendlyError(err: unknown): string {
  console.warn(err);
  if (err instanceof ApiError) {
    const code = (err.body as { error?: string } | null)?.error;
    if (err.status === 403 && code === 'ai_consent') return ERR.aiConsent;
    if (err.status === 503 && code === 'ai_unavailable') return ERR.aiUnavailable;
    if (err.status === 402) return ERR.quota;
    if (err.status === 429) return ERR.tooMany;
    if (err.status === 401) return ERR.signedOut;
    if (err.status === 413) return ERR.tooLarge;
    if (err.status >= 500) return ERR.server;
    return ERR.generic;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/abort/i.test(message)) return ERR.timeout;
  if (/network|failed to fetch/i.test(message)) return ERR.offline;
  return message;
}

export function asQuotaError(err: unknown): QuotaError | null {
  if (err instanceof ApiError && err.status === 402 && (err.body as QuotaError | null)?.error === 'quota') {
    return err.body as QuotaError;
  }
  return null;
}

// A 401 usually just means the access token went stale -- refresh once and
// retry. Only when the refresh itself is rejected by the auth server (4xx:
// the account no longer exists, e.g. deleted elsewhere) is the session
// dropped, which sends the app back to the login screen instead of leaving
// it stuck on "invalid or expired access token". A network failure during
// the refresh (no status) never signs anyone out -- for a guest that
// session is the only way back into their data.
async function recoverFrom401(): Promise<boolean> {
  const { error } = await supabase.auth.refreshSession();
  if (!error) return true;
  const status = (error as { status?: number }).status;
  if (status !== undefined && status >= 400 && status < 500) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }
  return false;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS, retried = false): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // getSession() reads the in-memory/stored session -- no network round
    // trip unless the SDK's own refresh timer just kicked in -- so this
    // stays cheap to call on every request rather than threading the token
    // through every call site.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        // Only set for requests that actually have a body -- Fastify's
        // JSON parser rejects a declared-but-empty JSON body (e.g. a
        // bodyless DELETE), which is exactly what every no-body call here
        // was sending before this check existed.
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // AI output follows the device language (see i18n DEVICE_LOCALE).
        'X-Cortex-Lang': DEVICE_LOCALE,
      },
      signal: controller.signal,
      ...init,
    });
    if (res.status === 401 && token && !retried && (await recoverFrom401())) {
      return request<T>(path, init, timeoutMs, true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        // not JSON -- keep the raw text in the message only
      }
      // An AI feature used without consent: the app opens the consent sheet.
      if (res.status === 403 && (parsed as { error?: string } | null)?.error === 'ai_consent') consentRequired?.();
      throw new ApiError(`${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`, res.status, parsed);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let consentRequired: (() => void) | null = null;
export function onAiConsentRequired(fn: (() => void) | null) {
  consentRequired = fn;
}

export function setAiConsent(agree: boolean) {
  return request<Plan>('/me/ai-consent', { method: 'POST', body: JSON.stringify({ agree }) });
}

export function fetchPlan() {
  return request<Plan>('/me/plan');
}

// "AI로 정리": classifies as much of 미분류함 as this month's quota allows.
export function classifyBacklog() {
  return request<{ started: number; left: number }>('/items/classify-backlog', { method: 'POST' });
}

// weekCount: saved in the last 7 days, across the whole archive (the list
// itself is only the newest `limit`). Optional: older servers didn't send it.
export function fetchRecentItems(limit = 50) {
  return request<{ items: ApiItem[]; total: number; weekCount?: number | null }>(`/items?limit=${limit}`);
}

// The 미분류 tab's items, newest first (the order 'AI로 정리' takes them).
export function fetchUnclassifiedItems(limit = 100) {
  return request<{ items: ApiItem[]; total: number }>(`/items?status=unclassified&limit=${limit}`);
}

// One home tag tab's items from the whole archive (newest first, up to 100)
// -- filtering the recent 50 hid older memos with that tag.
export function fetchItemsWithTag(tag: string, limit = 100) {
  return request<{ items: ApiItem[]; total: number }>(`/items?tag=${encodeURIComponent(tag)}&limit=${limit}`);
}

// `include` terms are AND'd together, `exclude` terms are NOT'd -- see the
// search screen's tag-chip input (space/enter turns a word into a chip,
// tapping it toggles include/exclude, × removes it).
// `tags` / `excludeTags`: the tag chips, matched exactly by the server (an
// older server ignores them -- the search screen filters exactly too).
export function searchItems(include: string[], exclude: string[], limit = 30, tags: string[] = [], excludeTags: string[] = []) {
  const params = new URLSearchParams();
  if (include.length) params.set('include', include.join(','));
  if (exclude.length) params.set('exclude', exclude.join(','));
  if (tags.length) params.set('tags', tags.join(','));
  if (excludeTags.length) params.set('excludeTags', excludeTags.join(','));
  params.set('limit', String(limit));
  return request<{ items: ApiItem[] }>(`/items/search?${params.toString()}`);
}

// What the server's LLM made of a search sentence (mirrors
// SearchInterpretationSchema in backend/src/lib/anthropic.ts). Filters
// narrow hard; keywords (each with synonyms) only rank. Shown back to the
// user as chips, and re-sent as-is through smartSearch when they edit one.
export interface SearchInterpretation {
  keywords: { term: string; synonyms: string[] }[];
  exclude: string[];
  source: ItemSource | null;
  captureType: ApiItem['capture_type'] | null;
  category: ItemCategory | null;
  dateFrom: string | null; // YYYY-MM-DD, Korea time
  dateTo: string | null;
  sort?: 'oldest' | 'newest' | null;
}

export type SmartHit = ApiItem & { matched_count: number };

export interface SmartSearchResponse {
  items: SmartHit[];
  // Set only when filters left nothing -- how many the same keywords find
  // with every filter dropped.
  relaxed_count: number | null;
}

// Sentence search -- one Claude call server-side, so it's rate limited
// there (no monthly quota).
export function askSearch(query: string) {
  return request<SmartSearchResponse & { interpretation: SearchInterpretation }>('/items/search/ask', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

// Re-runs an edited interpretation -- no Claude call.
export function smartSearch(interpretation: SearchInterpretation) {
  return request<SmartSearchResponse>('/items/search/smart', {
    method: 'POST',
    body: JSON.stringify({ interpretation }),
  });
}

// `note` is the optional one-line "why I saved this" memo -- stored as-is
// (user_note), separate from the AI-assigned title/snippet/tags, and fed
// into search the same way a tag is.
// requestId (all three saves): the app's id for this one save, the same on
// every retry of it -- a retry after a timeout gets back the item the first
// try already made instead of a second one (newRequestId).
export function saveTextItem(source: ItemSource, text: string, note?: string, requestId?: string) {
  return request<ApiItem>('/items', {
    method: 'POST',
    body: JSON.stringify({ captureType: 'text', source, text, note, requestId }),
  });
}

export function newRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Goes through the backend's og:tags/oEmbed metadata fetch instead of
// storing the bare URL as unstructured text -- worth using whenever we
// actually have a clean link (e.g. the OS share sheet's webUrl), which
// saveTextItem alone had no path to before this.
export function saveLinkItem(source: ItemSource, url: string, note?: string, requestId?: string) {
  return request<ApiItem>('/items', {
    method: 'POST',
    body: JSON.stringify({ captureType: 'link', source, url, note, requestId }),
  });
}

// expo-image-picker's base64 output is always re-encoded as JPEG regardless
// of the original file's format, so mediaType is always 'image/jpeg' here.
export function saveScreenshotItem(source: ItemSource, imageBase64: string, note?: string, requestId?: string) {
  return request<ApiItem>(
    '/items',
    {
      method: 'POST',
      body: JSON.stringify({ captureType: 'screenshot', source, imageBase64, mediaType: 'image/jpeg', note, requestId }),
    },
    SCREENSHOT_TIMEOUT_MS
  );
}

export interface ItemStats {
  total: number;
  byCategory: { category: ItemCategory; count: number }[];
  // Most-used tags, top 6 (optional: older servers didn't send it).
  byTag?: { tag: string; count: number }[];
  bySource: { source: ItemSource; count: number }[];
  byMonth: { month: string; count: number }[];
  heatmap: { weekday: number; band: number; count: number }[];
}

export function fetchStats() {
  return request<ItemStats>('/items/stats');
}

export function deleteAccount() {
  return request<{ ok: true }>('/auth/me', { method: 'DELETE' });
}

// Kakao signup gets a sample item server-side (kakaoAuth.ts); guest signup
// happens entirely client-side via supabase.auth.signInAnonymously(), so
// LoginScreen calls this right after to get the same starting point.
// A guest who just signed in with Kakao/Google: move the guest's saves to
// this account (guestToken = the guest session's access token, kept from
// before the switch).
export function claimGuest(guestToken: string) {
  return request<{ ok: true; moved: number }>('/auth/claim-guest', { method: 'POST', body: JSON.stringify({ guestToken }) });
}

export function seedSampleItem() {
  return request<{ ok: true }>('/auth/seed-sample', { method: 'POST' });
}

// The server signs these for 5 minutes; caching client-side for a bit less
// than that means reopening the same item shortly after doesn't pay for a
// fresh sign + re-download -- same URL means the browser's own HTTP cache
// serves the image bytes too, instead of every open being a cache miss by
// construction (a fresh signature makes a "new" URL every time otherwise).
const SCREENSHOT_URL_TTL_MS = 4 * 60 * 1000;
const screenshotUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getScreenshotUrl(itemId: string): Promise<{ url: string }> {
  const cached = screenshotUrlCache.get(itemId);
  if (cached && cached.expiresAt > Date.now()) return { url: cached.url };

  const result = await request<{ url: string }>(`/items/${encodeURIComponent(itemId)}/screenshot-url`);
  screenshotUrlCache.set(itemId, { url: result.url, expiresAt: Date.now() + SCREENSHOT_URL_TTL_MS });
  return result;
}

// Soft delete -- moves the item to the trash, doesn't remove it.
export function deleteItem(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

export function fetchItem(itemId: string) {
  return request<ApiItem>(`/items/${encodeURIComponent(itemId)}`);
}

// The person's own edits from the detail screen. An empty string clears the
// field. rawText is the body of a text memo only.
// category/tags: only sent by undo after an AI re-organize (puts back what
// the AI replaced).
export function updateItem(
  itemId: string,
  patch: { title?: string; snippet?: string; rawText?: string; userNote?: string; category?: ApiItem['category']; tags?: string[] }
) {
  return request<ApiItem>(`/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body: JSON.stringify(patch) });
}

// What the paywall can sell: whether store billing is set up on the
// server, the Play product ids, and how many lifetime passes are left.
export interface Offers {
  enabled: boolean;
  subscriptionId: string;
  lifetimeId: string;
  lifetimeRemaining: number;
}
export function fetchOffers() {
  return request<Offers>('/billing/offers');
}

// A finished Play purchase -> the server checks it with Google and turns Pro
// on. Returns the new plan.
export function verifyGooglePurchase(productId: string, purchaseToken: string) {
  return request<Plan>('/billing/google/verify', { method: 'POST', body: JSON.stringify({ productId, purchaseToken }) });
}

export type ComposeFormat = 'auto' | 'course' | 'list' | 'summary';

// "모아서 만들기": a tag's items (or the picked itemIds) -> one memo, saved
// right away (the use is counted, so the result is kept even if the app
// closes while it runs). retryOf = a composed memo to remake in place
// (free the first time). 402 (asQuotaError) when none are left.
export function composeMemo(tag: string, format: ComposeFormat, opts: { itemIds?: string[]; retryOf?: string; instruction?: string } = {}) {
  return request<{ item: ApiItem; sourceCount: number; freeRemake: boolean }>(
    '/items/compose',
    { method: 'POST', body: JSON.stringify({ tag, format, ...opts }) },
    120_000
  );
}

// The items a composed memo was made from (those still in the archive).
export function fetchComposeSources(itemId: string) {
  return request<{ items: ApiItem[] }>(`/items/${encodeURIComponent(itemId)}/sources`);
}

// "AI로 다시 정리": re-runs classification with the current title/memo as a
// hint. Uses one AI classification; 402 (asQuotaError) when none are left.
export function reorganizeItem(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}/reorganize`, { method: 'POST', body: '{}' });
}

export function fetchTrash() {
  return request<{ items: ApiItem[] }>('/items/trash');
}

export function setItemLocked(itemId: string, locked: boolean) {
  return request<{ ok: true; locked: boolean }>(`/items/${encodeURIComponent(itemId)}/lock`, { method: 'POST', body: JSON.stringify({ locked }) });
}

// Turning the memo lock off opens every locked memo.
export function unlockAllItems() {
  return request<{ ok: true; changed: number }>('/items/unlock-all', { method: 'POST' });
}

export interface TagMergeGroup {
  keep: string;
  merge: string[];
  counts: Record<string, number>;
}

export function suggestTagCleanup() {
  return request<{ groups: TagMergeGroup[]; left: number }>('/tags/cleanup/suggest', { method: 'POST' });
}

export function applyTagCleanup(groups: { keep: string; merge: string[] }[]) {
  return request<{ ok: true; changed: number }>('/tags/cleanup/apply', { method: 'POST', body: JSON.stringify({ groups }) });
}

// Flags what the AI wrote for this item ("AI 결과 신고").
export function reportAiOutput(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}/report`, { method: 'POST' });
}

export function restoreItem(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}/restore`, { method: 'POST' });
}

export function permanentlyDeleteItem(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}/permanent`, { method: 'DELETE' });
}

// Cleans up one spoken sentence (already transcribed on-device) into a
// single short tag via a small Claude call server-side -- a raw transcript
// almost never reads as a clean tag on its own. Returns just the cleaned
// tag string; call addTag with it separately to actually attach it.
export function tagFromVoice(text: string) {
  return request<{ tag: string }>('/items/tags/from-voice', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
}

// Both only ever touch user_tags -- adding a *new* tag always goes through
// here, never the AI-assigned column, so "Cortex guessed this" and "I
// added this" stay distinguishable.
export function addTag(itemId: string, tag: string) {
  return request<ApiItem>(`/items/${encodeURIComponent(itemId)}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tag }),
  });
}

export function removeTag(itemId: string, tag: string) {
  return request<ApiItem>(`/items/${encodeURIComponent(itemId)}/tags/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
  });
}

// The one write path onto the AI-assigned tags -- removal only, for
// correcting a wrong auto-classification.
export function removeAiTag(itemId: string, tag: string) {
  return request<ApiItem>(`/items/${encodeURIComponent(itemId)}/tags/ai/${encodeURIComponent(tag)}`, {
    method: 'DELETE',
  });
}

export function fetchTags() {
  return request<{ tags: string[] }>('/items/tags');
}

import { Platform } from 'react-native';
import { supabase } from '../auth/supabase';

export type ItemSource = 'instagram' | 'kakaotalk' | 'safari' | 'youtube' | 'memo' | 'other';
export type ItemCategory = '맛집' | '여행' | '레시피' | '쇼핑' | '읽을거리' | '기타';

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
// screens fall back to demo data. Fail fast instead.
const REQUEST_TIMEOUT_MS = 8000;

// Screenshot saves go through compression + a Claude vision call + a
// Storage upload server-side, on a 1 OCPU box -- routinely well past 8s.
// The short default above exists to fail fast when there's no backend at
// all, which doesn't apply here.
const SCREENSHOT_TIMEOUT_MS = 45000;

async function request<T>(path: string, init?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
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
      },
      signal: controller.signal,
      ...init,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`${init?.method ?? 'GET'} ${path} failed (${res.status}): ${body}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchRecentItems(limit = 50) {
  return request<{ items: ApiItem[]; total: number }>(`/items?limit=${limit}`);
}

export function searchItems(query: string, limit = 30) {
  return request<{ items: ApiItem[] }>(`/items/search?q=${encodeURIComponent(query)}&limit=${limit}`);
}

export function saveTextItem(source: ItemSource, text: string) {
  return request<ApiItem>('/items', {
    method: 'POST',
    body: JSON.stringify({ captureType: 'text', source, text }),
  });
}

// Goes through the backend's og:tags/oEmbed metadata fetch instead of
// storing the bare URL as unstructured text -- worth using whenever we
// actually have a clean link (e.g. the OS share sheet's webUrl), which
// saveTextItem alone had no path to before this.
export function saveLinkItem(source: ItemSource, url: string) {
  return request<ApiItem>('/items', {
    method: 'POST',
    body: JSON.stringify({ captureType: 'link', source, url }),
  });
}

// expo-image-picker's base64 output is always re-encoded as JPEG regardless
// of the original file's format, so mediaType is always 'image/jpeg' here.
export function saveScreenshotItem(source: ItemSource, imageBase64: string) {
  return request<ApiItem>(
    '/items',
    {
      method: 'POST',
      body: JSON.stringify({ captureType: 'screenshot', source, imageBase64, mediaType: 'image/jpeg' }),
    },
    SCREENSHOT_TIMEOUT_MS
  );
}

export interface ItemStats {
  total: number;
  byCategory: { category: ItemCategory; count: number }[];
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

export function fetchTrash() {
  return request<{ items: ApiItem[] }>('/items/trash');
}

export function restoreItem(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}/restore`, { method: 'POST' });
}

export function permanentlyDeleteItem(itemId: string) {
  return request<{ ok: true }>(`/items/${encodeURIComponent(itemId)}/permanent`, { method: 'DELETE' });
}

// Both only ever touch user_tags -- there's no route that can change the
// AI-assigned tags.
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

export function fetchTags() {
  return request<{ tags: string[] }>('/items/tags');
}

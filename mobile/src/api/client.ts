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
  title: string | null;
  snippet: string | null;
  category: ItemCategory;
  tags: string[];
  shared_at: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // getSession() reads the in-memory/stored session -- no network round
    // trip unless the SDK's own refresh timer just kicked in -- so this
    // stays cheap to call on every request rather than threading the token
    // through every call site.
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
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

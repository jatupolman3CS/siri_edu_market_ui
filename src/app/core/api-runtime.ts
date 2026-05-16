import type { CreateClientConfig } from './api/client.gen';
import { finishLoading, startLoading } from './services/loading';

/** Set by `provideSdkAuthBridge` at app init — returns current access token per-request. */
let _tokenGetter: (() => string | null) | null = null;

/** Set by `provideSdkAuthBridge` — called when the SDK fetch receives a 401 response. */
let _unauthorizedHandler: (() => void) | null = null;

/** Called once by `sdk-auth-bridge` so the custom fetch can attach Bearer headers. */
export function setAuthTokenGetter(getter: () => string | null): void {
  _tokenGetter = getter;
}

/** Called once by `sdk-auth-bridge` to register the 401 → redirect callback. */
export function setUnauthorizedHandler(handler: () => void): void {
  _unauthorizedHandler = handler;
}

const PATH_BASE = '/SIRIEDUMARKET.Api';
const R2_BUCKET_PATH = '/siriedumarket/';
/** Stream file bytes through the API (works in <img> without R2 CORS / expiring presigns). */
const FILE_DOWNLOAD_PATH = '/api/files/download/';
const PRESIGNED_FILE_PATH = '/api/files/presigned/';

function defaultApiBaseUrl(): string {
  // Priority:
  // 1) window override (useful for dev/prod without rebuild)
  // 2) same-origin hosting under IIS virtual directory
  // 3) local dev backend default (Program.cs uses UsePathBase)
  const w = globalThis as unknown as { __SIRIEDU_API_BASE_URL__?: unknown } & {
    location?: Location;
  };
  const override = typeof w.__SIRIEDU_API_BASE_URL__ === 'string' ? w.__SIRIEDU_API_BASE_URL__ : '';
  if (override.trim()) return override.trim().replace(/\/+$/, '');

  const origin = w.location?.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      // When the UI is served from a dev server (e.g. :4200) but the API is hosted
      // under IIS at `http://localhost/SIRIEDUMARKET.Api`, we must not inherit the UI port.
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return `http://localhost${PATH_BASE}`;
      }
    } catch {
      /* ignore */
    }
    return `${origin}${PATH_BASE}`;
  }

  // Fallback when `window.location` is unavailable (SSR/tests).
  // Prefer IIS-style default the user requested.
  return `http://localhost${PATH_BASE}`;
}

export const API_BASE_URL = defaultApiBaseUrl();

/**
 * Resolve a relative API path to an absolute URL.
 * Example: `/api/library/123/reviews` -> `http://localhost/SIRIEDUMARKET.Api/api/library/123/reviews`
 */
export function resolveApiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function encodeObjectKeyForPath(key: string): string {
  const normalizedKey = safeDecode(key).replace(/^\/+/, '');
  return normalizedKey
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/** Public display URLs should hit the API download action (anonymous GET, streams from R2). */
function buildBackendDownloadAssetUrl(key: string): string {
  return `${API_BASE_URL}${FILE_DOWNLOAD_PATH}${encodeObjectKeyForPath(key)}`;
}

/**
 * Absolute URL to stream the object via `GET /api/files/download/{key}` (works in `<img>` for private R2).
 * Prefer persisting this (or a path `resolvePublicUrl` understands) over `UploadResponse.publicUrl`.
 */
export function downloadUrlForStorageKey(key: string): string {
  return buildBackendDownloadAssetUrl(key);
}

function resolveR2AssetUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    const path = parsed.pathname;
    if (
      path.includes(FILE_DOWNLOAD_PATH) ||
      path.includes(`${PATH_BASE}${FILE_DOWNLOAD_PATH}`) ||
      path.startsWith(PRESIGNED_FILE_PATH) ||
      path.includes(`${PATH_BASE}${PRESIGNED_FILE_PATH}`)
    ) {
      return null;
    }

    const bucketIndex = path.indexOf(R2_BUCKET_PATH);
    if (bucketIndex < 0) return null;

    const key = path.slice(bucketIndex + R2_BUCKET_PATH.length);
    if (!key) return null;

    return buildBackendDownloadAssetUrl(key);
  } catch {
    const bucketIndex = raw.indexOf(R2_BUCKET_PATH);
    if (bucketIndex < 0) return null;

    const keyWithMaybeQuery = raw.slice(bucketIndex + R2_BUCKET_PATH.length);
    const key = keyWithMaybeQuery.split(/[?#]/, 1)[0];
    if (!key) return null;

    return buildBackendDownloadAssetUrl(key);
  }
}

/**
 * Backend may return relative URLs (e.g. `/api/files/download/...`) while the API
 * itself is hosted under a path base (e.g. `/SIRIEDUMARKET.Api`). This helper
 * turns any returned URL into an absolute URL that the browser can resolve.
 */
export function resolvePublicUrl(url: string | null | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';

  const r2AssetUrl = resolveR2AssetUrl(raw);
  if (r2AssetUrl) return r2AssetUrl;

  if (/^https?:\/\//i.test(raw)) return raw;

  // If backend returns an absolute path including the PathBase, only prefix origin.
  if (raw.startsWith(`${PATH_BASE}/`)) {
    try {
      const base = new URL(API_BASE_URL);
      return `${base.origin}${raw}`;
    } catch {
      return raw;
    }
  }

  // Common case: `/api/...` or `api/...`
  if (raw.startsWith('/')) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: API_BASE_URL,
  fetch: async (request: Request) => {
    startLoading();
    try {
      const token = _tokenGetter?.();
      if (token) {
        const headers = new Headers(request.headers);
        headers.set('Authorization', `Bearer ${token}`);
        const response = await fetch(new Request(request, { headers }));
        if (response.status === 401) {
          _unauthorizedHandler?.();
        }
        return response;
      }
      const response = await fetch(request);
      if (response.status === 401) {
        _unauthorizedHandler?.();
      }
      return response;
    } finally {
      finishLoading();
    }
  },
});


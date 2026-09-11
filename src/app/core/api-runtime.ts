import type { CreateClientConfig } from './api/client.gen';
import { environment } from '../../environments/environment';
import { finishLoading, startLoading } from './services/loading';

/** Set by `provideSdkAuthBridge` at app init — returns current access token per-request. */
let _tokenGetter: (() => string | null) | null = null;

/** Set by `provideSdkAuthBridge` — called when a 401 could not be recovered by refreshing. */
let _unauthorizedHandler: (() => void) | null = null;

/**
 * Set by `provideSdkAuthBridge` — exchanges the refresh token for a new access token.
 * Resolves to the new token, or null when the session is genuinely over.
 */
let _tokenRefresher: (() => Promise<string | null>) | null = null;

/** Called once by `sdk-auth-bridge` so the custom fetch can attach Bearer headers. */
export function setAuthTokenGetter(getter: () => string | null): void {
  _tokenGetter = getter;
}

/** Called once by `sdk-auth-bridge` to register the 401 → redirect callback. */
export function setUnauthorizedHandler(handler: () => void): void {
  _unauthorizedHandler = handler;
}

/** Called once by `sdk-auth-bridge` to register the silent-refresh callback. */
export function setTokenRefresher(refresher: () => Promise<string | null>): void {
  _tokenRefresher = refresher;
}

/**
 * DEV-BYPASS: set by `provideDevAuthBypass` so every SDK call carries the role the dev switcher
 * is currently on. The API's development bypass scheme reads it to decide which seeded account
 * the request runs as; in a normal build nothing registers a getter and no header is sent.
 */
let _devRoleGetter: (() => string | null) | null = null;

export function setDevRoleGetter(getter: () => string | null): void {
  _devRoleGetter = getter;
}

const R2_BUCKET_PATH = '/siriedumarket/';
/** Stream file bytes through the API (works in <img> without R2 CORS / expiring presigns). */
const FILE_DOWNLOAD_PATH = '/api/files/download/';
const PRESIGNED_FILE_PATH = '/api/files/presigned/';

/**
 * B-05: every API call resolves through here, so this is the only place that decides the host.
 *
 * Priority:
 * 1) `window.__SIRIEDU_API_BASE_URL__` — retarget a built bundle without rebuilding it
 * 2) `environment.apiUrl` — the build-time setting (`src/environments/*`); absolute in
 *    development so `ng serve` reaches `dotnet run` on :5282, empty in production
 * 3) same origin as the app — nginx proxies `/api/` through to the backend container
 *
 * The API answers at the origin root (`{origin}/api/...`): there is no path base any more
 * (`docs/contracts/remove-api-path-base.md`), so nothing is appended to the resolved origin.
 *
 * A localhost UI used to be pinned to a port-80 host whatever the settings said, which is why
 * `ng serve` + `dotnet run` answered 502: the API is on :5282. `src/proxy.conf.json` could not
 * help — these URLs are absolute and cross-origin, so they never entered the dev server's
 * proxy — and it is gone rather than left looking load-bearing.
 */
function defaultApiBaseUrl(): string {
  const w = globalThis as unknown as { __SIRIEDU_API_BASE_URL__?: unknown } & {
    location?: Location;
  };
  const override = typeof w.__SIRIEDU_API_BASE_URL__ === 'string' ? w.__SIRIEDU_API_BASE_URL__ : '';
  if (override.trim()) return override.trim().replace(/\/+$/, '');

  const configured = environment.apiUrl.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const origin = w.location?.origin;
  if (origin) return origin;

  // `window.location` is unavailable (SSR / unit tests).
  return 'http://localhost';
}

export const API_BASE_URL = defaultApiBaseUrl();

/**
 * Resolve a relative API path to an absolute URL.
 * Example: `/api/library/123/reviews` -> `http://localhost:5282/api/library/123/reviews`
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
    // `includes` (not `startsWith`) so legacy rows whose stored URL still carries the
    // path-base prefix that used to sit in front of these paths are recognised as API paths too.
    if (path.includes(FILE_DOWNLOAD_PATH) || path.includes(PRESIGNED_FILE_PATH)) {
      return null;
    }

    let key: string | null = null;
    const bucketIndex = path.indexOf(R2_BUCKET_PATH);
    if (bucketIndex >= 0) {
      key = path.slice(bucketIndex + R2_BUCKET_PATH.length);
    } else if (parsed.hostname.includes('r2.cloudflarestorage.com') || parsed.hostname.includes('.r2.dev')) {
      const parts = path.split('/').filter(Boolean);
      key = parts.length > 1 ? parts.slice(1).join('/') : parts.join('/');
    }

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
 * Backend may return relative URLs (e.g. `/api/files/download/...`) or absolute ones.
 * This helper turns any returned URL into an absolute URL that the browser can resolve.
 */
export function resolvePublicUrl(url: string | null | undefined): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';

  const r2AssetUrl = resolveR2AssetUrl(raw);
  if (r2AssetUrl) return r2AssetUrl;

  if (/^https?:\/\//i.test(raw)) return raw;

  // Common case: `/api/...` or `api/...`
  if (raw.startsWith('/')) return `${API_BASE_URL}${raw}`;
  return `${API_BASE_URL}/${raw}`;
}

/**
 * Resolves a downloadable file URL:
 * - Converts raw R2 URLs to backend API download URLs
 * - Resolves relative paths to absolute API base URLs
 * - Appends authentication token query param (?token=...) when provided so window.open()
 *   authenticates with ASP.NET Core
 * - Appends optional filename query param (?filename=...) to set Content-Disposition
 */
export function resolveDownloadUrl(
  url: string | null | undefined,
  token?: string | null,
  filename?: string | null,
  inline?: boolean,
): string {
  const resolved = resolvePublicUrl(url);
  if (!resolved) return '';

  const devRole = _devRoleGetter?.();

  try {
    const parsed = new URL(resolved, typeof window !== 'undefined' ? window.location?.origin : undefined);
    if (token && !parsed.searchParams.has('token') && !parsed.searchParams.has('access_token')) {
      parsed.searchParams.set('token', token);
    }
    if (filename && !parsed.searchParams.has('filename')) {
      parsed.searchParams.set('filename', filename);
    }
    if (inline && !parsed.searchParams.has('inline')) {
      parsed.searchParams.set('inline', 'true');
    }
    if (devRole && !parsed.searchParams.has('devRole')) {
      parsed.searchParams.set('devRole', devRole);
    }
    return parsed.toString();
  } catch {
    let result = resolved;
    const params: string[] = [];
    if (token && !result.includes('token=')) {
      params.push(`token=${encodeURIComponent(token)}`);
    }
    if (filename && !result.includes('filename=')) {
      params.push(`filename=${encodeURIComponent(filename)}`);
    }
    if (inline && !result.includes('inline=')) {
      params.push('inline=true');
    }
    if (devRole && !result.includes('devRole=')) {
      params.push(`devRole=${encodeURIComponent(devRole)}`);
    }
    if (params.length > 0) {
      result += (result.includes('?') ? '&' : '?') + params.join('&');
    }
    return result;
  }
}

/**
 * Requests that must never trigger a refresh-and-retry: a 401 from them is the answer,
 * not a stale token, and retrying `/auth/refresh` on its own failure would loop.
 */
function isAuthEndpoint(input: RequestInfo | URL): boolean {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/verify-email') ||
    url.includes('/api/auth/external/')
  );
}

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  baseUrl: API_BASE_URL,
  /**
   * F-30-1: the generated client only throws on a non-2xx when this is set; otherwise it
   * returns `{ data: undefined, error }` and carries on. Sixteen call sites across seven
   * services awaited a call and relied on a `catch` that could therefore never run — a failed
   * register, password reset, wishlist write, follow, or document delete all reported success
   * to the user. Calls that go through `unwrapSdkResult` were already fine, because that
   * throws on missing data; this makes the rest behave the same way.
   *
   * Several call sites still pass `throwOnError: true` explicitly. That is now redundant but
   * harmless, and it documents intent at the call.
   */
  throwOnError: true,
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    startLoading();
    try {
      const send = (token: string | null) => {
        // Rebuild from the original input/init each time so the body is still readable
        // on the retry — a consumed Request cannot be sent twice.
        //
        // credentials: 'include' so the browser sends/stores the HttpOnly `siriedu_anon`
        // cookie the backend uses to scope anonymous cart/wishlist sessions
        // (docs/contracts/anonymous-cart-wishlist-scoping.md) — without it the cookie never
        // leaves the browser in dev (`ng serve` :4200 ↔ `dotnet run` :5282 are cross-origin),
        // even though prod is same-origin via the nginx proxy already.
        const request = new Request(input, { ...init, credentials: 'include' });
        const devRole = _devRoleGetter?.() ?? null;

        const headers = new Headers(request.headers);
        if (token) headers.set('Authorization', `Bearer ${token}`);
        if (devRole) headers.set('X-Dev-Role', devRole);
        if (!headers.has('Accept-Language')) {
          try {
            const lang = typeof window !== 'undefined' ? window.localStorage?.getItem('siriedu_lang') : null;
            headers.set('Accept-Language', lang === 'en' ? 'en-US,en;q=0.9' : 'th-TH,th;q=0.9');
          } catch {
            headers.set('Accept-Language', 'th-TH,th;q=0.9');
          }
        }
        return fetch(new Request(request, { headers, credentials: 'include' }));
      };

      const tokenSent = _tokenGetter?.() ?? null;
      const response = await send(tokenSent);
      if (response.status !== 401) return response;

      // D-11: a visitor who never signed in has no session to lose. The app asks for /api/cart
      // and /api/wishlist while bootstrapping every page, both answer 401 for an anonymous
      // visitor, and this handler read that as "your session ended" and sent them to the login
      // page. The whole public marketplace — home, catalogue, categories, a document, a bundle,
      // the free list, a seller's shop — was unreachable without an account, even though all of
      // its own data had already loaded with 200s.
      //
      // With no token attached there is nothing to refresh and nothing to sign out of, so the 401
      // is simply the answer to the question: return it and let the caller decide.
      if (!tokenSent) return response;

      // BUG-04: a 401 used to sign the user straight out, so every session died when the
      // 15-minute access token expired — mid-upload, mid-checkout, mid-anything. Refresh
      // once and replay the request; only a failed refresh ends the session.
      if (isAuthEndpoint(input) || !_tokenRefresher) {
        _unauthorizedHandler?.();
        return response;
      }

      const refreshedToken = await _tokenRefresher();
      if (!refreshedToken) {
        _unauthorizedHandler?.();
        return response;
      }

      const retried = await send(refreshedToken);
      if (retried.status === 401) {
        _unauthorizedHandler?.();
      }
      return retried;
    } finally {
      finishLoading();
    }
  },
});


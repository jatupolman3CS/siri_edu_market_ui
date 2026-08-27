import { Injectable } from '@angular/core';
import { getApiAuthOauthClients } from '../api/sdk.gen';
import { environment } from '../../../environments/environment';
import { unwrapSdkResult } from './api-result';

/**
 * Loads public Google Web Client ID from the API (`GET /api/auth/oauth-clients`),
 * with fallback to `environment.googleOAuthClientId` (e.g. local dev without API).
 */
@Injectable({ providedIn: 'root' })
export class GoogleOauthConfigService {
  private loaded = false;
  private inflight: Promise<void> | null = null;
  /** Trimmed client id returned by the API (may be empty). */
  private fromApi = '';
  /**
   * D-08b: did the API actually answer? An empty client id from a server that replied is an
   * answer — "Google is not configured here" — and must not be papered over by the environment
   * fallback. Only a failed call falls back.
   */
  private apiAnswered = false;

  /**
   * Fetches OAuth client metadata once (deduped). Safe to call multiple times.
   */
  ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return Promise.resolve();
    }
    if (this.inflight) {
      return this.inflight;
    }
    this.inflight = (async () => {
      try {
        const result = await getApiAuthOauthClients();
        const data = unwrapSdkResult(result);
        this.fromApi = (data.googleClientId ?? '').trim();
        this.apiAnswered = true;
      } catch {
        /* the API could not be reached — only then is the environment fallback meaningful */
      } finally {
        this.loaded = true;
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /**
   * Resolved client id: whatever the API said, and the environment fallback only when the API
   * could not be reached at all.
   *
   * D-08b: this used to fall back whenever the API's value was empty, and
   * `environment.development.ts` carries a real-looking client id. So with the server reporting no
   * Google configuration — which is the state of this wave — the sign-in button still looked ready
   * and stayed enabled, and the D-08 "(ยังไม่ได้ตั้งค่า)" label never appeared. Pressing it starts
   * a flow the server cannot finish. The server is the only thing that knows whether the exchange
   * can succeed, so its answer wins, including when that answer is "nothing configured".
   */
  getClientId(): string {
    if (this.apiAnswered) {
      return this.fromApi;
    }
    return (environment.googleOAuthClientId ?? '').trim();
  }
}

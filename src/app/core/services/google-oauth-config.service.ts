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
      } catch {
        /* keep fromApi empty — fallback to environment */
      } finally {
        this.loaded = true;
        this.inflight = null;
      }
    })();
    return this.inflight;
  }

  /** Resolved client id: API value if non-empty, else environment fallback. */
  getClientId(): string {
    if (this.fromApi) {
      return this.fromApi;
    }
    return (environment.googleOAuthClientId ?? '').trim();
  }
}

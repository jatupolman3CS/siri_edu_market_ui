import { Injectable, signal } from '@angular/core';
import { getApiAuthOauthClients } from '../api/sdk.gen';
import type { PublicOAuthClientsResponse } from '../api/types.gen';
import { unwrapSdkResult } from './api-result';

/**
 * external-login-and-mail-config v1 §3.1/§4.1 — single owner of `GET /api/auth/oauth-clients`.
 *
 * The endpoint answers which external sign-in providers this server can actually finish a token
 * exchange for: an empty string means "not usable here". That decision belongs to the server and
 * only to the server (AC-7) — the browser cannot know whether the matching client secret is
 * configured, so nothing in the UI may infer availability from its own environment.
 *
 * `GoogleOauthConfigService` delegates here so both providers come from one request; the
 * Google-only `environment.googleOAuthClientId` fallback stays over there (§4.1) and is
 * deliberately *not* mirrored for LINE — a channel id without a server-side channel secret would
 * just produce a button that fails at the callback.
 */
@Injectable({ providedIn: 'root' })
export class OauthClientsService {
  private loaded = false;
  private inflight: Promise<void> | null = null;

  private readonly _googleClientId = signal('');
  private readonly _lineLoginChannelId = signal('');
  /**
   * D-08b (carried over from `GoogleOauthConfigService`): did the API actually answer? An empty
   * client id from a server that replied is an answer — "this provider is not configured here" —
   * and must not be papered over by an environment fallback. Only a failed call may fall back.
   */
  private readonly _apiAnswered = signal(false);

  /** Google Web Client ID exactly as the server reported it (`''` = Google sign-in unavailable). */
  readonly googleClientId = this._googleClientId.asReadonly();
  /** LINE **Login** channel id as the server reported it (`''` = LINE sign-in unavailable). */
  readonly lineLoginChannelId = this._lineLoginChannelId.asReadonly();
  /** `false` while the request is still pending, and after a failed one. */
  readonly apiAnswered = this._apiAnswered.asReadonly();

  /**
   * Fetches the OAuth client metadata once (deduped through the in-flight promise). Safe to call
   * from every caller on every page — the login page, the register page and `social-buttons` all
   * do, and together they must still produce exactly one HTTP request.
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
        const data: PublicOAuthClientsResponse = unwrapSdkResult(result);
        this._googleClientId.set((data.googleClientId ?? '').trim());
        this._lineLoginChannelId.set((data.lineLoginChannelId ?? '').trim());
        this._apiAnswered.set(true);
      } catch {
        /* the API could not be reached — only then is Google's environment fallback meaningful */
      } finally {
        this.loaded = true;
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}

import { Injectable, signal } from '@angular/core';
import { getApiAuthOauthClients } from '../api/sdk.gen';
import type { PublicOAuthClientsResponse } from '../api/types.gen';
import { unwrapSdkResult } from './api-result';

/**
 * oauth-scopes-from-env v1 AC-14 — a provider is only usable when the server reported **both** its
 * client id and its scopes; if either is empty, both collapse to `''` so an older backend that
 * does not send scopes hides the button instead of showing one that cannot open a consent page.
 */
function pairOrEmpty(
  id: string | null | undefined,
  scopes: string | null | undefined,
): [string, string] {
  const trimmedId = (id ?? '').trim();
  const trimmedScopes = (scopes ?? '').trim();
  return trimmedId && trimmedScopes ? [trimmedId, trimmedScopes] : ['', ''];
}

/**
 * external-login-and-mail-config v1 §3.1/§4.1 — single owner of `GET /api/auth/oauth-clients`.
 *
 * The endpoint answers which external sign-in providers this server can actually finish a token
 * exchange for: an empty string means "not usable here". That decision belongs to the server and
 * only to the server (AC-7) — the browser cannot know whether the matching client secret is
 * configured, so nothing in the UI may infer availability from its own environment.
 *
 * `GoogleOauthConfigService` delegates here so both providers come from one request. Neither
 * provider has an environment fallback (oauth-scopes-from-env v1 AC-18): the OAuth scopes live on
 * the server only, so a client id the browser supplied on its own could not open a consent page.
 */
@Injectable({ providedIn: 'root' })
export class OauthClientsService {
  private loaded = false;
  private inflight: Promise<void> | null = null;

  private readonly _googleClientId = signal('');
  private readonly _googleScopes = signal('');
  private readonly _lineLoginChannelId = signal('');
  private readonly _lineLoginScopes = signal('');
  /**
   * D-08b (carried over from `GoogleOauthConfigService`): did the API actually answer? An empty
   * client id from a server that replied is an answer — "this provider is not configured here".
   */
  private readonly _apiAnswered = signal(false);

  /** Google Web Client ID exactly as the server reported it (`''` = Google sign-in unavailable). */
  readonly googleClientId = this._googleClientId.asReadonly();
  /** Space-separated Google scopes from the server, handed to GIS verbatim (`''` ⇔ no client id). */
  readonly googleScopes = this._googleScopes.asReadonly();
  /** LINE **Login** channel id as the server reported it (`''` = LINE sign-in unavailable). */
  readonly lineLoginChannelId = this._lineLoginChannelId.asReadonly();
  /** Space-separated LINE Login scopes from the server (`''` ⇔ no channel id). */
  readonly lineLoginScopes = this._lineLoginScopes.asReadonly();
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
        const [googleId, googleScopes] = pairOrEmpty(data.googleClientId, data.googleScopes);
        const [lineId, lineScopes] = pairOrEmpty(data.lineLoginChannelId, data.lineLoginScopes);
        this._googleClientId.set(googleId);
        this._googleScopes.set(googleScopes);
        this._lineLoginChannelId.set(lineId);
        this._lineLoginScopes.set(lineScopes);
        this._apiAnswered.set(true);
      } catch {
        /* the API could not be reached — every provider stays '' and its button stays hidden */
      } finally {
        this.loaded = true;
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}

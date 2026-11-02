import { Injectable, inject } from '@angular/core';
import { OauthClientsService } from './oauth-clients.service';

/**
 * Resolves the public Google Web Client ID and scopes — from the server only.
 *
 * external-login-and-mail-config v1 §4.1: the HTTP call itself moved to
 * {@link OauthClientsService} so Google and LINE share one `GET /api/auth/oauth-clients`
 * request. The public API here (`ensureLoaded()`, `getClientId()`) is unchanged on purpose —
 * `AuthService`, `GoogleOauthService` and `social-buttons` all depend on it.
 *
 * oauth-scopes-from-env v1 AC-18: the old `environment` client-id fallback is gone — the scopes
 * now come from the server as well, so a client id without them could not open a popup anyway.
 */
@Injectable({ providedIn: 'root' })
export class GoogleOauthConfigService {
  private readonly oauthClients = inject(OauthClientsService);

  /**
   * Fetches OAuth client metadata once (deduped). Safe to call multiple times.
   */
  ensureLoaded(): Promise<void> {
    return this.oauthClients.ensureLoaded();
  }

  /**
   * The client id exactly as the server reported it — `''` while loading, after a failed request,
   * or when the server says Google is not usable here; the button stays hidden in all three cases.
   *
   * D-08b: the server is the only thing that knows whether the exchange can succeed, so its answer
   * wins, including when that answer is "nothing configured".
   */
  getClientId(): string {
    return this.oauthClients.googleClientId()?.trim() ?? '';
  }

  /** Space-separated scopes from the server, verbatim — no default (oauth-scopes-from-env AC-15). */
  getScopes(): string {
    return this.oauthClients.googleScopes()?.trim() ?? '';
  }
}

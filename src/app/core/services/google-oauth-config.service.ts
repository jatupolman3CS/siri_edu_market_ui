import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { OauthClientsService } from './oauth-clients.service';

/**
 * Resolves the public Google Web Client ID, with a fallback to
 * `environment.googleOAuthClientId` (e.g. local dev without API).
 *
 * external-login-and-mail-config v1 §4.1: the HTTP call itself moved to
 * {@link OauthClientsService} so Google and LINE share one `GET /api/auth/oauth-clients`
 * request. The public API here (`ensureLoaded()`, `getClientId()`) is unchanged on purpose —
 * `AuthService`, `GoogleOauthService` and `social-buttons` all depend on it — and so is the
 * D-08b fallback rule below, which stays Google-only.
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
    if (this.oauthClients.apiAnswered()) {
      return this.oauthClients.googleClientId();
    }
    return (environment.googleOAuthClientId ?? '').trim();
  }
}

import { Injectable, inject } from '@angular/core';
import { GoogleOauthConfigService } from './google-oauth-config.service';

/** Minimal GIS types — loaded via https://accounts.google.com/gsi/client */
interface GoogleCodeClientResponse {
  readonly error?: string;
  readonly error_description?: string;
  readonly code?: string;
}

interface GoogleAccountsOauth2 {
  initCodeClient(config: {
    client_id: string;
    scope: string;
    ux_mode: 'popup' | 'redirect';
    callback: (resp: GoogleCodeClientResponse) => void;
  }): { requestCode: () => void };
}

interface GoogleAccounts {
  oauth2: GoogleAccountsOauth2;
}

interface WindowWithGoogle extends Window {
  google?: { accounts: GoogleAccounts };
}

@Injectable({ providedIn: 'root' })
export class GoogleOauthService {
  private readonly oauthConfig = inject(GoogleOauthConfigService);

  /**
   * Opens the Google consent popup (GIS code client) and resolves with the
   * authorization code plus redirect URI (SPA origin) for backend token exchange.
   */
  async requestAuthorizationCode(): Promise<{ code: string; redirectUri: string }> {
    await this.oauthConfig.ensureLoaded();
    const clientId = this.oauthConfig.getClientId();
    if (!clientId) {
      throw new Error('Google OAuth client id is not configured.');
    }

    if (typeof window === 'undefined') {
      throw new Error('Google login is only available in a browser.');
    }

    const w = window as unknown as WindowWithGoogle;
    const origin = typeof w.location?.origin === 'string' ? w.location.origin : '';
    if (!origin) {
      throw new Error('Cannot resolve window origin for Google redirect.');
    }

    const google = w.google;
    if (!google?.accounts?.oauth2) {
      throw new Error('Google Identity Services script is not loaded (gsi/client).');
    }

    return await new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
      const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'openid email profile',
        ux_mode: 'popup',
        callback: (resp: GoogleCodeClientResponse) => {
          if (resp.error) {
            reject(new Error(resp.error_description ?? resp.error));
            return;
          }
          if (!resp.code) {
            reject(new Error('Google did not return an authorization code.'));
            return;
          }
          resolve({ code: resp.code, redirectUri: origin });
        },
      });
      try {
        client.requestCode();
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }
}

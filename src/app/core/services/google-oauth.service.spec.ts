import { TestBed } from '@angular/core/testing';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';

/**
 * oauth-scopes-from-env v1 AC-15 — the scope handed to GIS `initCodeClient` is exactly what the
 * server reported; with no scope from the server the popup is never initialised.
 */

interface CodeClientConfig {
  client_id: string;
  scope: string;
  ux_mode: 'popup' | 'redirect';
  callback: (resp: { error?: string; error_description?: string; code?: string }) => void;
}

type WindowWithGoogleStub = Window & {
  google?: { accounts: { oauth2: { initCodeClient: (config: CodeClientConfig) => unknown } } };
};

let initCodeClient: ReturnType<typeof vi.fn<(config: CodeClientConfig) => { requestCode: () => void }>>;

function build(clientId: string, scopes: string): GoogleOauthService {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: GoogleOauthConfigService,
        useValue: {
          ensureLoaded: vi.fn().mockResolvedValue(undefined),
          getClientId: () => clientId,
          getScopes: () => scopes,
        },
      },
    ],
  });
  return TestBed.inject(GoogleOauthService);
}

beforeEach(() => {
  initCodeClient = vi.fn<(config: CodeClientConfig) => { requestCode: () => void }>((config) => ({
    requestCode: () => config.callback({ code: 'auth-code' }),
  }));
  (window as WindowWithGoogleStub).google = { accounts: { oauth2: { initCodeClient } } };
});

afterEach(() => {
  delete (window as WindowWithGoogleStub).google;
  TestBed.resetTestingModule();
});

describe('GoogleOauthService.requestAuthorizationCode', () => {
  it('passes the server scopes to initCodeClient verbatim', async () => {
    const service = build('client-1.apps.googleusercontent.com', 'openid email');

    const result = await service.requestAuthorizationCode();

    expect(initCodeClient).toHaveBeenCalledTimes(1);
    const config = initCodeClient.mock.calls[0][0];
    expect(config.scope).toBe('openid email');
    expect(config.client_id).toBe('client-1.apps.googleusercontent.com');
    expect(result).toEqual({ code: 'auth-code', redirectUri: window.location.origin });
  });

  it('uses whatever other value the server sends, untouched', async () => {
    const service = build('client-1.apps.googleusercontent.com', 'openid email profile');

    await service.requestAuthorizationCode();

    expect(initCodeClient.mock.calls[0][0].scope).toBe('openid email profile');
  });

  it('rejects without calling initCodeClient when the server sent no scopes', async () => {
    const service = build('client-1.apps.googleusercontent.com', '');

    await expect(service.requestAuthorizationCode()).rejects.toThrow(
      'Google OAuth scopes are not configured.',
    );
    expect(initCodeClient).not.toHaveBeenCalled();
  });

  it('rejects without calling initCodeClient when there is no client id', async () => {
    const service = build('', 'openid email');

    await expect(service.requestAuthorizationCode()).rejects.toThrow(
      'Google OAuth client id is not configured.',
    );
    expect(initCodeClient).not.toHaveBeenCalled();
  });
});

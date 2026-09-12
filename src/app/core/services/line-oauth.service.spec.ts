import { TestBed } from '@angular/core/testing';
import { LineOauthService } from './line-oauth.service';
import { OauthClientsService } from './oauth-clients.service';

/**
 * external-login-and-mail-config v1 §4.1/§4.2 — the browser half of LINE Login: build the
 * authorize URL exactly as the contract pins it, and make the pending request single-use and
 * short-lived so a callback URL cannot be replayed.
 */

const STORAGE_KEY = 'siriedu_line_oauth';

function build(channelId = '2001234567'): LineOauthService {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: OauthClientsService,
        useValue: {
          ensureLoaded: vi.fn().mockResolvedValue(undefined),
          lineLoginChannelId: () => channelId,
        },
      },
    ],
  });
  return TestBed.inject(LineOauthService);
}

beforeEach(() => sessionStorage.clear());

afterEach(() => {
  sessionStorage.clear();
  TestBed.resetTestingModule();
});

describe('LineOauthService.startSignIn', () => {
  it('redirects to LINE with the authorize URL from §4.2 and remembers the pending request', () => {
    const service = build();
    const redirect = vi.spyOn(service, 'redirectTo').mockImplementation(() => undefined);

    const started = service.startSignIn('/library');

    expect(started).toBe(true);
    const url = redirect.mock.calls[0][0];
    const expectedRedirectUri = `${window.location.origin}/auth/line/callback`;
    expect(url.startsWith('https://access.line.me/oauth2/v2.1/authorize?')).toBe(true);
    expect(url).toContain('response_type=code');
    expect(url).toContain('client_id=2001234567');
    expect(url).toContain(`redirect_uri=${encodeURIComponent(expectedRedirectUri)}`);
    // The contract pins `%20` separators — `URLSearchParams` would have written `+` here.
    expect(url).toContain('scope=openid%20profile%20email');

    const record = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
    expect(record.returnUrl).toBe('/library');
    expect(record.redirectUri).toBe(expectedRedirectUri);
    expect(typeof record.state).toBe('string');
    expect(record.state.length).toBeGreaterThan(0);
    expect(url).toContain(`state=${encodeURIComponent(record.state)}`);
  });

  it('does not navigate anywhere when the server reported no LINE login channel', () => {
    const service = build('');
    const redirect = vi.spyOn(service, 'redirectTo').mockImplementation(() => undefined);

    const started = service.startSignIn('/library');

    expect(started).toBe(false);
    expect(redirect).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe('LineOauthService.consumeState', () => {
  function beginAndReadState(service: LineOauthService): string {
    vi.spyOn(service, 'redirectTo').mockImplementation(() => undefined);
    service.startSignIn('/orders/abc');
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}').state as string;
  }

  it('returns the pending request once and never again', () => {
    const service = build();
    const state = beginAndReadState(service);

    const first = service.consumeState(state);
    expect(first?.returnUrl).toBe('/orders/abc');
    expect(first?.redirectUri).toBe(`${window.location.origin}/auth/line/callback`);

    expect(service.consumeState(state)).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects a state that does not match the stored one', () => {
    const service = build();
    beginAndReadState(service);

    expect(service.consumeState('not-the-state')).toBeNull();
  });

  it('rejects a pending request older than 10 minutes', () => {
    const service = build();
    const state = beginAndReadState(service);
    const record = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}');
    record.createdAt = Date.now() - 10 * 60 * 1000 - 1;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));

    expect(service.consumeState(state)).toBeNull();
  });

  it('returns null when there is no pending request at all', () => {
    const service = build();

    expect(service.consumeState('anything')).toBeNull();
  });
});

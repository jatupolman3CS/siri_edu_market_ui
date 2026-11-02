import { TestBed } from '@angular/core/testing';
import { SocialButtonsComponent } from './social-buttons.component';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';
import { OauthClientsService } from '../../../core/services/oauth-clients.service';

/**
 * QA bug #5: "เข้าสู่ระบบด้วย Google" was shown (disabled, with a "(ยังไม่ได้ตั้งค่า)" caption)
 * to every visitor even though Google OAuth isn't wired up — a non-functional auth option in
 * front of every user. The button + caption must not render at all until
 * `GoogleOauthConfigService` confirms a real client id.
 *
 * external-login-and-mail-config v1 AC-7 applies the same rule to LINE, with `OauthClientsService`
 * (i.e. the server's `lineLoginChannelId`) as the only source of truth.
 */
function render(
  clientId: string | Promise<never> = '',
  lineChannelId: string | Promise<never> = '',
) {
  const pending = clientId instanceof Promise || lineChannelId instanceof Promise;
  const stall = clientId instanceof Promise ? clientId : (lineChannelId as Promise<never>);
  const config = {
    ensureLoaded: () => (pending ? stall : Promise.resolve()),
    getClientId: () => (clientId instanceof Promise ? '' : clientId),
  };
  // oauth-scopes-from-env v1 AC-14: the real service only ever exposes a non-empty id together with
  // non-empty scopes, so the mock mirrors that pairing.
  const oauthClients = {
    ensureLoaded: () => (pending ? stall : Promise.resolve()),
    lineLoginChannelId: () => (lineChannelId instanceof Promise ? '' : lineChannelId),
    lineLoginScopes: () =>
      lineChannelId instanceof Promise || !lineChannelId ? '' : 'openid profile email',
    googleClientId: () => (clientId instanceof Promise ? '' : clientId),
    googleScopes: () => (clientId instanceof Promise || !clientId ? '' : 'openid email profile'),
  };
  TestBed.configureTestingModule({
    imports: [SocialButtonsComponent],
    providers: [
      { provide: GoogleOauthConfigService, useValue: config },
      { provide: OauthClientsService, useValue: oauthClients },
    ],
  });
  return TestBed.createComponent(SocialButtonsComponent);
}

function buttonWithText(el: HTMLElement, text: string): HTMLButtonElement | null {
  return (
    [...el.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(text)) ?? null
  );
}

afterEach(() => TestBed.resetTestingModule());

describe('SocialButtonsComponent — Google button hidden until configured (bug #5)', () => {
  it('does not render the Google button (or its caption) before the config check resolves', () => {
    const fixture = render(new Promise(() => {})); // never resolves
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).not.toContain('ยังไม่ได้ตั้งค่า');
  });

  it('does not render the Google button when no client id is configured', async () => {
    const fixture = render('');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('button')).toBeNull();
    expect(el.textContent).not.toContain('ยังไม่ได้ตั้งค่า');
  });

  it('renders the Google button once a real client id is confirmed', async () => {
    const fixture = render('real-client-id.apps.googleusercontent.com');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const button = el.querySelector('button');
    expect(button).toBeTruthy();
    expect(button?.textContent).toContain('เข้าสู่ระบบด้วย Google');
  });
});

describe('SocialButtonsComponent — LINE button follows the server (AC-7)', () => {
  it('does not render the LINE button before the config check resolves', () => {
    const fixture = render('', new Promise(() => {})); // never resolves
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeNull();
  });

  it('does not render the LINE button when the server reports an empty channel id', async () => {
    const fixture = render('', '');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeNull();
  });

  it('renders the LINE button once the server reports a real channel id', async () => {
    const fixture = render('', '2001234567');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeTruthy();
  });

  it('emits select("line") when the LINE button is pressed', async () => {
    const fixture = render('', '2001234567');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const selected: string[] = [];
    fixture.componentInstance.select.subscribe((p) => selected.push(p));
    buttonWithText(fixture.nativeElement as HTMLElement, 'เข้าสู่ระบบด้วย LINE')?.click();

    expect(selected).toEqual(['line']);
  });

  it('shows both buttons when the server has Google and LINE configured', async () => {
    const fixture = render('real-client-id.apps.googleusercontent.com', '2001234567');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย Google')).toBeTruthy();
    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeTruthy();
  });
});

/**
 * oauth-scopes-from-env v1 AC-19 — the real `OauthClientsService` + `GoogleOauthConfigService`
 * over a stubbed `GET /api/auth/oauth-clients`: a button is shown only when the server sent both
 * the id and the scopes for that provider (the pair invariant of AC-14 hides it otherwise).
 */
describe('SocialButtonsComponent — buttons need both id and scopes from the server (AC-19)', () => {
  let realFetch: typeof globalThis.fetch;

  function renderWithServer(body: Record<string, string>) {
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ) as typeof globalThis.fetch;
    TestBed.configureTestingModule({ imports: [SocialButtonsComponent] });
    return TestBed.createComponent(SocialButtonsComponent);
  }

  async function settleFixture(fixture: ReturnType<typeof renderWithServer>): Promise<HTMLElement> {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('shows both buttons when the server sends ids and scopes', async () => {
    const el = await settleFixture(
      renderWithServer({
        googleClientId: 'real-client-id.apps.googleusercontent.com',
        googleScopes: 'openid email profile',
        lineLoginChannelId: '2001234567',
        lineLoginScopes: 'openid profile email',
      }),
    );

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย Google')).toBeTruthy();
    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeTruthy();
  });

  it('hides both buttons when ids are present but scopes are empty', async () => {
    const el = await settleFixture(
      renderWithServer({
        googleClientId: 'real-client-id.apps.googleusercontent.com',
        googleScopes: '',
        lineLoginChannelId: '2001234567',
        lineLoginScopes: '',
      }),
    );

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย Google')).toBeNull();
    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeNull();
  });

  it('hides both buttons for an older backend that sends no scope fields', async () => {
    const el = await settleFixture(
      renderWithServer({
        googleClientId: 'real-client-id.apps.googleusercontent.com',
        lineLoginChannelId: '2001234567',
      }),
    );

    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย Google')).toBeNull();
    expect(buttonWithText(el, 'เข้าสู่ระบบด้วย LINE')).toBeNull();
  });
});

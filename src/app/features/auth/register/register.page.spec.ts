import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthRegisterPage } from './register.page';
import { AuthService, PlatformStatsService } from '../../../core/services';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';
import { OauthClientsService } from '../../../core/services/oauth-clients.service';

/**
 * QA bugs #3/#4 on the register form:
 *  - #3: every text field had `required` but the Terms/Privacy checkbox did not — a user could
 *    submit without agreeing to it on a page that itself cites PDPA compliance.
 *  - #4: the "เงื่อนไขการใช้งาน"/"นโยบายความเป็นส่วนตัว" copy were dead `href="#"` links (no
 *    ToS/Privacy page exists in this app yet).
 */
function render() {
  TestBed.configureTestingModule({
    imports: [AuthRegisterPage],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { register: vi.fn(), signInWithProvider: vi.fn() } },
      {
        provide: GoogleOauthConfigService,
        useValue: { ensureLoaded: () => Promise.resolve(), getClientId: () => '' },
      },
      {
        // external-login-and-mail-config v1 §4.1: `social-buttons` now also asks the shared
        // OAuth-clients service about LINE — stubbed so this page spec makes no HTTP call.
        provide: OauthClientsService,
        useValue: { ensureLoaded: () => Promise.resolve(), lineLoginChannelId: () => '' },
      },
      // AuthLayoutComponent reads this — stub so no real network call fires in this spec.
      { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AuthRegisterPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AuthRegisterPage — Terms/Privacy checkbox (bug #3/#4)', () => {
  it('marks the Terms/Privacy checkbox as required', () => {
    const el = render().nativeElement as HTMLElement;
    const checkbox = el.querySelector('input[name="acceptTerms"]') as HTMLInputElement;

    expect(checkbox).toBeTruthy();
    expect(checkbox.required).toBe(true);
  });

  it('does not render the ToS/Privacy copy as dead `href="#"` links', () => {
    const el = render().nativeElement as HTMLElement;
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(hrefs).not.toContain('#');
    const text = el.textContent ?? '';
    expect(text).toContain('เงื่อนไขการใช้งาน');
    expect(text).toContain('นโยบายความเป็นส่วนตัว');
  });

  it('disables the submit button while the Terms/Privacy checkbox is unchecked', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    expect(fixture.componentInstance.acceptTerms()).toBe(false);
    expect(button.disabled).toBe(true);
  });

  it('enables the submit button once the Terms/Privacy checkbox is checked', () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button[type="submit"]') as HTMLButtonElement;

    fixture.componentInstance.acceptTerms.set(true);
    fixture.detectChanges();

    expect(button.disabled).toBe(false);
  });

  it('redirects via resolvePostAuthRedirect when onSocial succeeds', async () => {
    const resolvePostAuthRedirect = vi.fn().mockReturnValue('/onboarding/role');
    const signInWithProvider = vi.fn().mockResolvedValue({ ok: true });
    TestBed.configureTestingModule({
      imports: [AuthRegisterPage],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { register: vi.fn(), signInWithProvider, resolvePostAuthRedirect },
        },
        {
          provide: GoogleOauthConfigService,
          useValue: { ensureLoaded: () => Promise.resolve(), getClientId: () => 'client-id' },
        },
        {
          // external-login-and-mail-config v1 §4.1 — see the note in render() above.
          provide: OauthClientsService,
          useValue: { ensureLoaded: () => Promise.resolve(), lineLoginChannelId: () => '' },
        },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AuthRegisterPage);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance;

    component.onSocial('google');
    await new Promise((r) => setTimeout(r, 20));

    // external-login-and-mail-config v1 §4.1: the page now forwards where the user wanted to
    // go, because a redirect-based provider (LINE) loses this component before it comes back.
    expect(signInWithProvider).toHaveBeenCalledWith('google', { returnUrl: '/' });
    expect(resolvePostAuthRedirect).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/onboarding/role');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthRegisterPage } from './register.page';
import { AuthService, PlatformStatsService } from '../../../core/services';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';

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
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AuthRegisterPage);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const component = fixture.componentInstance;

    component.onSocial('google');
    await new Promise((r) => setTimeout(r, 20));

    expect(signInWithProvider).toHaveBeenCalledWith('google');
    expect(resolvePostAuthRedirect).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/onboarding/role');
  });
});

import { TestBed } from '@angular/core/testing';
import { SocialButtonsComponent } from './social-buttons.component';
import { GoogleOauthConfigService } from '../../../core/services/google-oauth-config.service';

/**
 * QA bug #5: "เข้าสู่ระบบด้วย Google" was shown (disabled, with a "(ยังไม่ได้ตั้งค่า)" caption)
 * to every visitor even though Google OAuth isn't wired up — a non-functional auth option in
 * front of every user. The button + caption must not render at all until
 * `GoogleOauthConfigService` confirms a real client id.
 */
function render(clientId: string | Promise<never> = '') {
  const config = {
    ensureLoaded: () =>
      clientId instanceof Promise ? clientId : Promise.resolve(),
    getClientId: () => (clientId instanceof Promise ? '' : clientId),
  };
  TestBed.configureTestingModule({
    imports: [SocialButtonsComponent],
    providers: [{ provide: GoogleOauthConfigService, useValue: config }],
  });
  return TestBed.createComponent(SocialButtonsComponent);
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

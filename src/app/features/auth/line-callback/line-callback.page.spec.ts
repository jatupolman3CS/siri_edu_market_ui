import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthLineCallbackPage } from './line-callback.page';
import { AuthService } from '../../../core/services';
import { PlatformStatsService } from '../../../core/services/platform-stats.service';

/**
 * external-login-and-mail-config v1 §1.3/§4.3 — the four ways a user can land back here from
 * LINE. Each failure gets its own Thai sentence: somebody who pressed "ยกเลิก" on LINE's consent
 * screen is not in the same situation as somebody whose request expired, and the backend already
 * writes its 4xx `detail` for the end user, so that one is shown verbatim.
 */

type AuthMock = {
  completeLineSignIn: ReturnType<typeof vi.fn>;
  resolvePostAuthRedirect: ReturnType<typeof vi.fn>;
};

let auth: AuthMock;
let router: Router;

function render(query: Record<string, string>): ComponentFixture<AuthLineCallbackPage> {
  TestBed.configureTestingModule({
    imports: [AuthLineCallbackPage],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: auth },
      { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of(new Map(Object.entries(query))) },
      },
    ],
  });
  router = TestBed.inject(Router);
  vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(AuthLineCallbackPage);
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => {
  auth = {
    completeLineSignIn: vi.fn().mockResolvedValue({ ok: true, returnUrl: '/' }),
    resolvePostAuthRedirect: vi.fn().mockImplementation((url: string) => url),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('AuthLineCallbackPage', () => {
  it('shows the waiting copy while the exchange is in flight', () => {
    auth.completeLineSignIn.mockReturnValue(new Promise(() => {}));
    const fixture = render({ code: 'line-code', state: 'state-1' });

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'กำลังเข้าสู่ระบบด้วย LINE...',
    );
  });

  it('exchanges the code and navigates to the resolved returnUrl on success', async () => {
    auth.completeLineSignIn.mockResolvedValue({ ok: true, returnUrl: '/library' });
    const fixture = render({ code: 'line-code', state: 'state-1' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.completeLineSignIn).toHaveBeenCalledWith({ code: 'line-code', state: 'state-1' });
    expect(auth.resolvePostAuthRedirect).toHaveBeenCalledWith('/library');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/library');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('ไม่สำเร็จ');
  });

  it('reports a cancelled consent screen without calling the API', async () => {
    const fixture = render({ error: 'access_denied', error_description: 'user denied' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(auth.completeLineSignIn).not.toHaveBeenCalled();
    expect(el.textContent).toContain('คุณยกเลิกการเข้าสู่ระบบด้วย LINE');
    expect(el.textContent).toContain('กลับไปหน้าเข้าสู่ระบบ');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('reports an invalid/expired request when the state no longer matches', async () => {
    auth.completeLineSignIn.mockResolvedValue({
      ok: false,
      error: 'คำขอเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่อีกครั้ง',
    });
    const fixture = render({ code: 'line-code', state: 'stale-state' });
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('คำขอเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่อีกครั้ง');
    expect(el.textContent).toContain('กลับไปหน้าเข้าสู่ระบบ');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('never calls the API when LINE came back without code/state at all', async () => {
    const fixture = render({});
    await fixture.whenStable();
    fixture.detectChanges();

    expect(auth.completeLineSignIn).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'คำขอเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่อีกครั้ง',
    );
  });

  it('shows the backend detail verbatim when the API answers 4xx', async () => {
    const detail =
      'บัญชี LINE นี้ไม่ได้ให้สิทธิ์เข้าถึงอีเมล จึงยังเข้าสู่ระบบด้วย LINE ไม่ได้ กรุณาเข้าสู่ระบบด้วยอีเมลแทน';
    auth.completeLineSignIn.mockResolvedValue({ ok: false, error: detail });
    const fixture = render({ code: 'line-code', state: 'state-1' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(detail);
  });
});

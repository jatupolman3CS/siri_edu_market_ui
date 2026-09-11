import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthVerifyEmailPage } from './verify-email.page';
import { AuthService } from '../../../core/services';
import { PlatformStatsService } from '../../../core/services/platform-stats.service';

describe('AuthVerifyEmailPage', () => {
  let fixture: ComponentFixture<AuthVerifyEmailPage>;
  let component: AuthVerifyEmailPage;
  let mockAuthService: {
    verifyEmail: ReturnType<typeof vi.fn>;
    verifyOtp: ReturnType<typeof vi.fn>;
    sendOtp: ReturnType<typeof vi.fn>;
    resendCode: ReturnType<typeof vi.fn>;
    pending: ReturnType<typeof vi.fn>;
    isPendingVerification: ReturnType<typeof vi.fn>;
    verificationNotice: ReturnType<typeof vi.fn>;
    resolvePostAuthRedirect: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(() => {
    mockAuthService = {
      verifyEmail: vi.fn().mockResolvedValue({ ok: true }),
      verifyOtp: vi.fn().mockResolvedValue({ ok: true }),
      sendOtp: vi.fn().mockResolvedValue({ ok: true, message: 'ส่งรหัส OTP แล้ว' }),
      resendCode: vi.fn().mockResolvedValue({ ok: true, message: 'ส่งรหัส OTP แล้ว' }),
      pending: vi.fn().mockReturnValue({ email: 'test@example.com', name: 'Tester', provider: 'email', expiresAt: '' }),
      isPendingVerification: vi.fn().mockReturnValue(true),
      verificationNotice: vi.fn().mockReturnValue(''),
      resolvePostAuthRedirect: vi.fn().mockReturnValue('/'),
    };

    TestBed.configureTestingModule({
      imports: [AuthVerifyEmailPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: PlatformStatsService, useValue: { stats: () => undefined, loadStats: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(new Map([['returnUrl', '/']])),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(AuthVerifyEmailPage);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders 6 OTP input boxes and target email', () => {
    const el = fixture.nativeElement as HTMLElement;
    const inputs = el.querySelectorAll('input[id^=otp-input-]');
    expect(inputs.length).toBe(6);
    expect(el.textContent).toContain('test@example.com');
  });

  it('calls auth.verifyOtp when submitOtp is invoked with 6 digits', async () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    component.otpDigits.set(['1', '2', '3', '4', '5', '6']);
    
    await component.submitOtp();

    expect(mockAuthService.verifyOtp).toHaveBeenCalledWith('123456', 'test@example.com');
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('displays error message if OTP is not 6 digits', async () => {
    component.otpDigits.set(['1', '2', '3', '', '', '']);
    
    await component.submitOtp();

    expect(component.error()).toContain('6 หลัก');
    expect(mockAuthService.verifyOtp).not.toHaveBeenCalled();
  });

  it('resend calls auth.sendOtp and starts cooldown timer', async () => {
    await component.resend();

    expect(mockAuthService.sendOtp).toHaveBeenCalledWith('test@example.com');
    expect(component.cooldown()).toBe(60);
  });
});

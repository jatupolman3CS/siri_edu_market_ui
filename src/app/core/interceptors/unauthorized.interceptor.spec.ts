import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { of, throwError, firstValueFrom } from 'rxjs';
import { unauthorizedInterceptor } from './unauthorized.interceptor';
import { AuthService } from '../services/auth.service';
import { ApiFailureReporter } from '../services/api-failure-reporter.service';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';

/**
 * `document.service.ts` (multipart uploads) is the only caller left on Angular's `HttpClient`,
 * so this interceptor is the second of the app's two 403 detection points — the SDK fetch in
 * `core/api-runtime.ts` covers everything else (admin-user-management §4.6 (ข)(ค)).
 *
 * The reporter here is the **real** one (AC-18): a stubbed `formatDetail` would happily return a
 * Thai string even if the interceptor handed it the `HttpErrorResponse` wrapper, which is exactly
 * the bug being guarded against — the real one would answer
 * "Http failure response for /api/cart: 403 Forbidden" instead.
 */
describe('unauthorizedInterceptor', () => {
  let mockAuth: any;
  let mockRouter: any;

  beforeEach(() => {
    mockAuth = {
      refreshSession: vi.fn(),
      redirectToLoginAfterUnauthorized: vi.fn(),
      redirectToLoginAfterAccountRestricted: vi.fn(),
    };
    mockRouter = { url: '/cart' };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        ApiFailureReporter,
        {
          provide: NzMessageService,
          useValue: { error: vi.fn(), warning: vi.fn(), success: vi.fn() },
        },
      ],
    });
  });

  it('handles 403 account_banned: calls redirectToLoginAfterAccountRestricted and does NOT refresh', async () => {
    const req = new HttpRequest('GET', '/api/cart');
    const errorResponse = new HttpErrorResponse({
      status: 403,
      error: { code: 'account_banned', detail: 'บัญชีถูกแบน' },
      url: '/api/cart',
    });
    const next = vi.fn().mockReturnValue(throwError(() => errorResponse));

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => unauthorizedInterceptor(req, next))),
    ).rejects.toThrow();

    expect(mockAuth.redirectToLoginAfterAccountRestricted).toHaveBeenCalledWith('บัญชีถูกแบน');
    expect(mockAuth.refreshSession).not.toHaveBeenCalled();
  });

  it('handles 403 account_suspended: calls redirectToLoginAfterAccountRestricted and does NOT refresh', async () => {
    const req = new HttpRequest('GET', '/api/cart');
    const errorResponse = new HttpErrorResponse({
      status: 403,
      error: { code: 'account_suspended', detail: 'บัญชีถูกระงับ' },
      url: '/api/cart',
    });
    const next = vi.fn().mockReturnValue(throwError(() => errorResponse));

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => unauthorizedInterceptor(req, next))),
    ).rejects.toThrow();

    expect(mockAuth.redirectToLoginAfterAccountRestricted).toHaveBeenCalledWith('บัญชีถูกระงับ');
    expect(mockAuth.refreshSession).not.toHaveBeenCalled();
  });

  it('handles regular 401: tries refreshSession', async () => {
    mockAuth.refreshSession.mockResolvedValue('new-token');
    const req = new HttpRequest('GET', '/api/cart');
    const errorResponse = new HttpErrorResponse({
      status: 401,
      url: '/api/cart',
    });
    let callCount = 0;
    const next = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return throwError(() => errorResponse);
      return of(new HttpResponse({ status: 200 }));
    });

    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() => unauthorizedInterceptor(req, next)),
    );
    expect(result).toBeTruthy();
    expect(mockAuth.refreshSession).toHaveBeenCalled();
  });

  it('leaves an ordinary 403 alone: no redirect, no refresh, error reaches the caller', async () => {
    const req = new HttpRequest('GET', '/api/documents/upload');
    const errorResponse = new HttpErrorResponse({
      status: 403,
      // Forbidden for this resource, but the session itself is fine — signing the user out here
      // would throw perfectly valid users out of the app.
      error: { code: 'seller_profile_required', detail: 'ต้องเปิดร้านก่อน' },
      url: '/api/documents/upload',
    });
    const next = vi.fn().mockReturnValue(throwError(() => errorResponse));

    await expect(
      firstValueFrom(TestBed.runInInjectionContext(() => unauthorizedInterceptor(req, next))),
    ).rejects.toBe(errorResponse);

    expect(mockAuth.redirectToLoginAfterAccountRestricted).not.toHaveBeenCalled();
    expect(mockAuth.refreshSession).not.toHaveBeenCalled();
  });
});

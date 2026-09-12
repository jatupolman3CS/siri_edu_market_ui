import { TestBed } from '@angular/core/testing';
import { HttpRequest, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { of, throwError, firstValueFrom } from 'rxjs';
import { unauthorizedInterceptor } from './unauthorized.interceptor';
import { AuthService } from '../services/auth.service';
import { ApiFailureReporter } from '../services/api-failure-reporter.service';
import { Router } from '@angular/router';

describe('unauthorizedInterceptor', () => {
  let mockAuth: any;
  let mockRouter: any;
  let mockApiFail: any;

  beforeEach(() => {
    mockAuth = {
      refreshSession: vi.fn(),
      redirectToLoginAfterUnauthorized: vi.fn(),
      redirectToLoginAfterAccountRestricted: vi.fn(),
    };
    mockRouter = { url: '/cart' };
    mockApiFail = {
      formatDetail: vi.fn((err: any) => err.error?.detail || 'Restricted'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: mockAuth },
        { provide: Router, useValue: mockRouter },
        { provide: ApiFailureReporter, useValue: mockApiFail },
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
});

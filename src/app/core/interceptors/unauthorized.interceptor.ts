import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { extractErrorCode } from '../services/api-result';
import { ApiFailureReporter } from '../services/api-failure-reporter.service';

function isAuthUrl(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/verify-email') ||
    url.includes('/api/auth/external/')
  );
}

/**
 * BUG-04: a 401 used to sign the user out on the spot, which ended every session the
 * moment the 15-minute access token expired. Refresh once and replay the request; only a
 * failed refresh sends the user to login.
 * admin-user-management v1 §4.6: a 403 with account_suspended / account_banned terminates
 * the restricted session immediately without attempting refresh.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const apiFail = inject(ApiFailureReporter);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        const code = extractErrorCode(err);
        if (code === 'account_suspended' || code === 'account_banned') {
          auth.redirectToLoginAfterAccountRestricted(apiFail.formatDetail(err));
          return throwError(() => err);
        }
      }

      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      const url = err.url ?? req.url;

      // Let the caller surface login/registration failures itself.
      if (isAuthUrl(url)) {
        return throwError(() => err);
      }

      // Concurrent 401s share one in-flight refresh inside AuthService.
      return from(auth.refreshSession()).pipe(
        switchMap((token) => {
          if (!token) {
            auth.redirectToLoginAfterUnauthorized(router.url);
            return throwError(() => err);
          }

          return next(
            req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
          );
        }),
      );
    }),
  );
};

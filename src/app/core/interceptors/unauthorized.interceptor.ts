import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

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
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
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

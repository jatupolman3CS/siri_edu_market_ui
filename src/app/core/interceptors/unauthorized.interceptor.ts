import {
  HttpErrorResponse,
  HttpInterceptorFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

function isAuthUrl(url: string): boolean {
  return (
    url.includes('/api/auth/login') ||
    url.includes('/api/auth/refresh') ||
    url.includes('/api/auth/register') ||
    url.includes('/api/auth/verify-email')
  );
}

export const unauthorizedInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      const url = err.url ?? req.url;

      // Don't redirect for auth endpoints — let the caller handle login errors
      if (isAuthUrl(url)) {
        return throwError(() => err);
      }

      // Redirect to login immediately on 401
      auth.redirectToLoginAfterUnauthorized(router.url);
      return throwError(() => err);
    }),
  );
};

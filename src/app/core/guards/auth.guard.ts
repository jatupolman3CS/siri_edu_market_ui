import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../services';

/**
 * Guard that requires the user to be authenticated.
 * Redirects to /auth/login with `returnUrl` so we can come back after sign-in.
 */
export const authGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  if (auth.isAuthenticated()) return true;

  message.warning('กรุณาเข้าสู่ระบบเพื่อทำรายการต่อ');
  return router.createUrlTree(['/auth/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Guard that prevents authenticated users from seeing /auth/login etc.
 */
export const guestGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) return true;
  return router.createUrlTree(['/']);
};

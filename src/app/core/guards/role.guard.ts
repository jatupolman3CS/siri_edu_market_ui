import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../services';

/**
 * Guard that requires the active user to have the `admin` role.
 * Sends unauthenticated users to /auth/login (with returnUrl), and
 * sends authenticated-but-non-admin users back to home.
 */
export const adminGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  if (!auth.isAuthenticated() || !auth.accessToken()) {
    message.warning('กรุณาเข้าสู่ระบบเพื่อเข้าถึงส่วนนี้');
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (auth.role() !== 'admin') {
    message.error('คุณไม่มีสิทธิ์เข้าถึงส่วนนี้');
    return router.createUrlTree(['/']);
  }

  return true;
};

/**
 * Guard that requires the active user to have the `seller` role (admin allowed too).
 */
export const sellerGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const message = inject(NzMessageService);

  if (!auth.isAuthenticated() || !auth.accessToken()) {
    message.warning('กรุณาเข้าสู่ระบบเพื่อเข้าถึงส่วนนี้');
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  const role = auth.role();
  if (role !== 'seller' && role !== 'admin') {
    message.error('คุณต้องเป็นผู้ขายเพื่อเข้าถึงส่วนนี้');
    return router.createUrlTree(['/']);
  }

  return true;
};

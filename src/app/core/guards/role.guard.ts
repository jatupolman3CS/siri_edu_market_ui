import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../services';
import { SellerApplicationService } from '../services/seller-application.service';
import { TranslationService } from '../i18n/translation.service';

/**
 * Guard that requires the active user to have the `admin` role.
 * Sends unauthenticated users to /auth/login (with returnUrl), and
 * sends authenticated-but-non-admin users back to home.
 */
export const adminGuard: CanActivateFn = (_route, state): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const message = inject(NzMessageService);
  const translation = inject(TranslationService);

  if (!auth.isAuthenticated() || !auth.accessToken()) {
    message.warning(translation.t('roleGuard.loginRequiredToAccess'));
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  if (!auth.isAdmin()) {
    message.error(translation.t('roleGuard.noPermission'));
    return router.createUrlTree(['/']);
  }

  return true;
};

/**
 * F-03: why each redirect happens, in the user's words. Exported so the spec asserts the exact
 * copy a user sees instead of re-typing it (three different reasons, three different messages).
 */
export const SELLER_GUARD_MESSAGES = {
  notSeller: 'คุณต้องเป็นผู้ขายเพื่อเข้าถึงส่วนนี้',
  pending: 'ใบสมัครเปิดร้านของคุณกำลังรอทีมงานตรวจสอบ ยังเข้าใช้งานเมนูผู้ขายไม่ได้',
  rejected: 'ใบสมัครเปิดร้านของคุณไม่ผ่านการตรวจสอบ กรุณาแก้ไขข้อมูลแล้วส่งใหม่',
  none: 'คุณยังไม่ได้เปิดร้าน กรุณาสมัครเปิดร้านก่อนเข้าใช้งานเมนูผู้ขาย',
} as const;

/**
 * Guard that requires the active user to have an **approved store** (admins allowed too).
 *
 * F-03: the role flag in the JWT was the only check before, so an account whose application is
 * still pending — or was rejected, or never existed — could reach /seller and land on empty or
 * broken pages instead of being taken to /become-seller. The real status comes from
 * `GET /api/me/seller-application` through {@link SellerApplicationService}, which caches the
 * answer per account so moving between seller pages does not re-request it.
 *
 * The guard is async because that status is a network fact. Every decision that does not need it
 * (not signed in, admin) still short-circuits before the await, so only non-admin users pay for a
 * request, and only once per session.
 *
 * If the lookup fails (network/5xx) the guard deliberately keeps the **old** behaviour — role in
 * the token — rather than locking a real seller out of their own store during an outage; the
 * service already reported the failure through `ApiFailureReporter`.
 */
export const sellerGuard: CanActivateFn = async (
  _route,
  state,
): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const message = inject(NzMessageService);
  const applications = inject(SellerApplicationService);
  const translation = inject(TranslationService);

  if (!auth.isAuthenticated() || !auth.accessToken()) {
    message.warning(translation.t('roleGuard.loginRequiredToAccess'));
    return router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  // multi-role-permissions v1 §4/§1 (AC-15): an admin never holds the `seller` role and has no
  // store of their own — they moderate everyone's, so no application lookup applies to them.
  if (auth.isAdmin()) return true;

  const blockedFromSellerArea = (): UrlTree => {
    message.error(translation.t('roleGuard.notSellerYet'));
    return router.createUrlTree(['/']);
  };

  const status = await applications.resolveAccessStatus();

  switch (status) {
    case 'approved':
      if (auth.isSeller()) return true;
      // Stale token: role was granted since this session started. Refresh to pick up the new
      // Seller claim — refreshSession() now syncs _session.user.roles from the response.
      await auth.refreshSession();
      return auth.isSeller() ? true : blockedFromSellerArea();

    case 'unavailable':
      // Fallback: behave exactly as the guard did before F-03.
      return auth.isSeller() ? true : blockedFromSellerArea();

    case 'pending':
      message.warning(translation.t('roleGuard.sellerApplicationPending'));
      return router.createUrlTree(['/become-seller']);

    case 'rejected':
      message.error(translation.t('roleGuard.sellerApplicationRejected'));
      return router.createUrlTree(['/become-seller']);

    case 'none':
    default:
      // If the user already holds the seller role (e.g. seeded account, pre-existing seller,
      // or direct admin promotion), allow access rather than locking them out in a /become-seller loop.
      if (auth.isSeller()) return true;
      message.warning(translation.t('roleGuard.noShopYet'));
      return router.createUrlTree(['/become-seller']);
  }
};

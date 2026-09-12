import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { User, UserRole } from '../models';
import {
  postApiAuthChangePassword,
  postApiAuthLogin,
  postApiAuthExternalByProvider,
  postApiAuthForgotPassword,
  postApiAuthLogout,
  postApiAuthRefresh,
  postApiAuthRegister,
  postApiAuthResendVerification,
  postApiAuthResetPassword,
  postApiAuthVerifyEmail,
} from '../api';
import type { AuthSessionResponse, ChangePasswordRequest } from '../api/types.gen';
import { extractErrorCode, extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';
import { LineOauthService } from './line-oauth.service';
import { OauthClientsService } from './oauth-clients.service';
import { CartService } from './cart.service';
import { WishlistService } from './wishlist.service';

const STORAGE_KEY = 'siriedu.auth';
const PENDING_KEY = 'siriedu.auth.pending';
const ACCESS_TOKEN_KEY = 'siriedu.auth.token';
// AUD-007: refresh token must live separately from the access token so signOut/refresh
// can send the right field instead of accidentally sending the access token as a refresh token.
const REFRESH_TOKEN_KEY = 'siriedu.auth.refresh';

export type AuthProvider = 'email' | 'google' | 'facebook' | 'line';

export interface AuthSession {
  user: User;
  provider: AuthProvider;
  signedInAt: string;
}

export interface PendingAuth {
  email: string;
  name: string;
  provider: AuthProvider;
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly googleOauth = inject(GoogleOauthService);
  private readonly googleOauthConfig = inject(GoogleOauthConfigService);
  /**
   * external-login-and-mail-config v1 §4.1 — LINE sign-in availability comes from the server
   * (`GET /api/auth/oauth-clients`), and the redirect/state handling lives in `LineOauthService`.
   * Both are inert until called, so injecting them eagerly has no request side effect (unlike
   * `CartService`/`WishlistService` below).
   */
  private readonly oauthClients = inject(OauthClientsService);
  private readonly lineOauth = inject(LineOauthService);
  /**
   * anonymous-cart-wishlist-scoping: the backend merges an anonymous visitor's cart/wishlist
   * into their account transparently on sign-in, but `CartService`/`WishlistService` are
   * `providedIn: 'root'` singletons that already loaded their in-memory state while still
   * anonymous. Neither injects `AuthService`, so this direction is safe (no circular DI).
   *
   * BUG-CART-401-RACE: these used to be eager `inject()` fields, which meant *constructing*
   * `AuthService` (e.g. from `provideSdkAuthBridge`'s `APP_INITIALIZER`, before it has called
   * `setAuthTokenGetter`) had the side effect of constructing `CartService`/`WishlistService`
   * too — and both fire their first `GET /api/cart` / `GET /api/wishlist` synchronously from
   * their own constructors. That request left with no `Authorization` header (the token getter
   * wasn't wired up yet), got a 401, and — because it looked like an anonymous request — was
   * never retried after a refresh (see the D-11 comment in `api-runtime.ts`), surfacing a false
   * "เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ" toast for a signed-in user on nearly every page load. Resolving
   * these lazily through `Injector` at the point of use (post sign-in only) keeps `AuthService`'s
   * own construction free of that side effect.
   */
  private readonly injector = inject(Injector);

  private readonly _session = signal<AuthSession | null>(this.loadSession());
  private readonly _pending = signal<PendingAuth | null>(this.loadPending());
  /**
   * D-06: whatever the backend said about the verification email — sent, or not sent because the
   * server has no mail transport. Deliberately not persisted: it describes one request, and a
   * stale copy read back after a reload would be a guess.
   */
  private readonly _verificationNotice = signal<string>('');
  /** In-memory access token (null until a real JWT is issued by the backend). */
  private readonly _accessToken = signal<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(ACCESS_TOKEN_KEY) : null,
  );
  /** AUD-006/AUD-007: persisted refresh token used by `refreshSession()` and `signOut()`. */
  private readonly _refreshToken = signal<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(REFRESH_TOKEN_KEY) : null,
  );
  /** Guard: prevent multiple simultaneous 401 redirects from concurrent API calls. */
  private _redirectingToLogin = false;
  /**
   * admin-user-management v2 §4.6 (ก): sticky until the next successful sign-in — a concurrent
   * 401 must not overwrite the ban verdict. `_redirectingToLogin` alone cannot do this: it is
   * cleared once `navigate()` resolves, so the generic "กรุณาเข้าสู่ระบบ…" toast of an in-flight
   * 401 would land on top of the real reason the session ended.
   */
  private _accountRestricted = false;
  /**
   * DEV-BYPASS: set by `provideDevAuthBypass` while the development sign-in bypass is on.
   * There is no login page to come back through in that mode, so `signOut()` hands control here
   * to re-enter as the seeded account instead of leaving the app with no session at all.
   */
  private _devBypassReactivator: (() => void) | null = null;

  readonly session = this._session.asReadonly();
  readonly pending = this._pending.asReadonly();
  /** D-06: shown on the verify-email page, straight from the server. */
  readonly verificationNotice = this._verificationNotice.asReadonly();
  /** Exposes the JWT access token for the HTTP interceptor. */
  readonly accessToken = this._accessToken.asReadonly();
  readonly refreshToken = this._refreshToken.asReadonly();
  private inflightRefresh: Promise<string | null> | null = null;

  readonly user = computed(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly isPendingVerification = computed(() => this._pending() !== null);
  readonly role = computed<UserRole | null>(() => this._session()?.user.role ?? null);
  /**
   * multi-role-permissions v1 §4: every role the signed-in user actually holds — additive, not
   * exclusive (a seller keeps `'buyer'`, an admin does not automatically gain `'seller'`).
   */
  readonly roles = computed<UserRole[]>(() => this._session()?.user.roles ?? []);
  readonly isAdmin = computed(() => this.roles().includes('admin'));
  /**
   * multi-role-permissions v1 §4: intentionally **not** OR'd with `isAdmin()` here — every
   * existing caller already writes `isSeller() || isAdmin()` itself (guards, `become-seller.page`,
   * `app-header`), so keeping this exclusive to the `'seller'` flag preserves that behaviour.
   */
  readonly isSeller = computed(() => this.roles().includes('seller'));

  /**
   * registration-onboarding v1 §4.3: decides post-authentication destination based on
   * onboarding status and roles.
   */
  resolvePostAuthRedirect(returnUrl: string): string {
    const user = this._session()?.user;
    if (!user) return '/auth/login';
    if (!user.onboardingCompletedAt) return '/onboarding/role';
    if (returnUrl && returnUrl !== '/') return returnUrl;
    if (user.roles.includes('admin')) return '/admin/dashboard';
    if (user.roles.includes('seller')) return '/seller/dashboard';
    return '/';
  }

  constructor() {
    if (typeof localStorage === 'undefined') return;
    
    if (this._session() !== null && !this._accessToken()) {
      this._session.set(null);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * DEV-BYPASS: installs a session for the seeded account the API is impersonating, so guards,
   * the header and every role-aware page behave as if a real sign-in had happened. Only
   * `provideDevAuthBypass` calls this, and only when `environment.devAuth.bypass` is on.
   */
  applyDevBypassSession(user: User, accessToken: string): void {
    this.setAccessToken(accessToken);
    this.completeSignIn(user, 'email');
  }

  /** DEV-BYPASS: registers how to re-enter the app after `signOut()` while the bypass is on. */
  setDevBypassReactivator(reactivate: () => void): void {
    this._devBypassReactivator = reactivate;
  }

  /** Called by the API auth layer after a successful login/refresh to store the JWT. */
  setAccessToken(token: string | null): void {
    this._accessToken.set(token);
    if (typeof localStorage === 'undefined') return;
    if (token) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }

  /** AUD-007: persist refresh token alongside the access token. */
  setRefreshToken(token: string | null): void {
    this._refreshToken.set(token);
    if (typeof localStorage === 'undefined') return;
    if (token) {
      localStorage.setItem(REFRESH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  }

  /**
   * AUD-006: rotate access + refresh tokens via `POST /api/auth/refresh`.
   * Returns the new access token, or `null` if no refresh token is available
   * or the refresh attempt failed (callers should drop the session).
   * Concurrent calls share the same in-flight promise.
   */
  refreshSession(): Promise<string | null> {
    if (this.inflightRefresh) return this.inflightRefresh;
    const refreshToken = this._refreshToken();
    if (!refreshToken) return Promise.resolve(null);
    this.inflightRefresh = (async () => {
      try {
        const result = await postApiAuthRefresh({ body: { refreshToken } });
        const data = unwrapSdkResult(result);
        this.setAccessToken(data.accessToken ?? null);
        this.setRefreshToken(data.refreshToken ?? null);
        return data.accessToken ?? null;
      } catch (e) {
        // Drop session — caller decides whether to redirect to /auth/login.
        this.setAccessToken(null);
        this.setRefreshToken(null);
        this._session.set(null);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
        }
        // admin-user-management v2 §4.6 (จ): banned while the access token happened to expire.
        // The SDK throws the ProblemDetails payload itself, so `e` is the payload. Say why the
        // session ended instead of the generic 401 wording the caller would otherwise show.
        const code = extractErrorCode(e);
        if (code === 'account_suspended' || code === 'account_banned') {
          this.redirectToLoginAfterAccountRestricted(this.apiFail.formatDetail(e));
        }
        return null;
      } finally {
        this.inflightRefresh = null;
      }
    })();
    return this.inflightRefresh;
  }

  /**
   * After a 401 when refresh/retry failed: clear session and go to login with returnUrl.
   * Skips when already on an /auth/* route to avoid redirect loops.
   */
  redirectToLoginAfterUnauthorized(returnUrl: string): void {
    // The account was restricted: that verdict (and its message) owns the redirect.
    if (this._accountRestricted) return;
    if (returnUrl.startsWith('/auth')) return;
    if (this._redirectingToLogin) return;
    this._redirectingToLogin = true;
    this.signOut();
    this.message.warning('กรุณาเข้าสู่ระบบเพื่อทำรายการต่อ');
    void this.router.navigate(['/auth/login'], {
      queryParams: { returnUrl },
    }).then(() => {
      this._redirectingToLogin = false;
    });
  }

  /**
   * admin-user-management §4.6 (ก): after a 403 account_suspended / account_banned:
   * clear session and redirect to /auth/login with the warning message from server.
   *
   * This is the **only** owner of that effect in the app — both HTTP stacks (the SDK fetch in
   * `core/api-runtime.ts` and the `HttpClient` interceptor) funnel here, so the user is signed
   * out once and told why once, however many calls were in flight when the ban landed.
   */
  redirectToLoginAfterAccountRestricted(message: string): void {
    if (this._accountRestricted) return;
    if (this._redirectingToLogin) return;
    // Must be set *before* signOut(): it is what stops the DEV-BYPASS reactivator from walking
    // straight back in as the seeded account that was just banned (403 → signOut → re-enter …).
    this._accountRestricted = true;
    this._redirectingToLogin = true;
    this.signOut();
    this.message.warning(message || 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ');
    void this.router.navigate(['/auth/login']).then(() => {
      this._redirectingToLogin = false;
    });
  }

  // ========== Email / Password ==========

  /** Sign in with email + password — calls API, falls back to mock on failure */
  async signIn(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    if (!email || !password) {
      return { ok: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
    }
    try {
      const result = await postApiAuthLogin({ body: { email, password } });
      const res = unwrapSdkResult(result);
      this.setAccessToken(res.accessToken);
      this.setRefreshToken(res.refreshToken ?? null);
      const role = this.normalizeRole(res.user.role);
      const user: User = {
        id: res.user.id,
        name: res.user.displayName,
        email: res.user.email,
        avatar: '',
        role,
        roles: this.normalizeRoles(res.user.roles, role),
        onboardingCompletedAt: res.user.onboardingCompletedAt ?? null,
        joinedAt: new Date().toISOString(),
      };
      this.completeSignIn(user, 'email');
      this.reloadCartAndWishlistAfterSignIn();
      return { ok: true };
    } catch (e) {
      this.apiFail.report('เข้าสู่ระบบ', e);
      const code = extractErrorCode(e);
      if (code === 'account_suspended' || code === 'account_banned') {
        return { ok: false, error: this.apiFail.formatDetail(e) };
      }
      return { ok: false, error: 'เข้าสู่ระบบไม่สำเร็จ' };
    }
  }

  /** Register new account — calls API then redirects to verify-email page */
  async register(input: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    acceptTerms: boolean;
  }): Promise<{ ok: boolean; error?: string }> {
    if (!input.acceptTerms) {
      return { ok: false, error: 'กรุณายอมรับเงื่อนไขก่อนสมัคร' };
    }
    if (!input.name.trim()) {
      return { ok: false, error: 'กรุณากรอกชื่อ' };
    }
    if (!this.isValidEmail(input.email)) {
      return { ok: false, error: 'อีเมลไม่ถูกต้อง' };
    }
    const passwordPolicyPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
    if (input.password.length < 8 || !passwordPolicyPattern.test(input.password)) {
      return {
        ok: false,
        error:
          'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก และตัวเลขอย่างน้อยอย่างละ 1 ตัว',
      };
    }
    if (input.password !== input.confirmPassword) {
      return { ok: false, error: 'รหัสผ่านยืนยันไม่ตรงกัน' };
    }
    try {
      const result = await postApiAuthRegister({
        body: {
          email: input.email,
          password: input.password,
          confirmPassword: input.confirmPassword,
          displayName: input.name,
          acceptTerms: input.acceptTerms,
        },
      });
      // D-06: the backend now says whether the verification email actually went out. Registering
      // succeeds either way, so the page that comes next has to repeat what the server said
      // instead of promising an inbox nothing was sent to.
      this._verificationNotice.set(unwrapSdkResult(result).message ?? '');
    } catch (e) {
      this.apiFail.report('สมัครสมาชิก', e);
      return { ok: false, error: 'สมัครสมาชิกไม่สำเร็จ' };
    }
    const pending: PendingAuth = {
      email: input.email,
      name: input.name,
      provider: 'email',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    this._pending.set(pending);
    this.persistPending();
    return { ok: true };
  }

  /**
   * Verify email with opaque token from the verification email link, or the 6-digit OTP code.
   * On success stores JWT + session (same shape as login).
   */
  async verifyEmail(tokenOrCode: string, email?: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = (tokenOrCode ?? '').trim();
    if (!trimmed) {
      return { ok: false, error: 'กรุณากรอกรหัสยืนยัน' };
    }
    const targetEmail = email?.trim() || this._pending()?.email;
    try {
      const bodyPayload: { token: string; email?: string; otp?: string } = { token: trimmed };
      if (targetEmail) {
        bodyPayload.email = targetEmail;
        if (trimmed.length === 6 && /^\d{6}$/.test(trimmed)) {
          bodyPayload.otp = trimmed;
        }
      }
      const result = await postApiAuthVerifyEmail({ body: bodyPayload });
      const res = unwrapSdkResult(result);
      this.setAccessToken(res.accessToken);
      this.setRefreshToken(res.refreshToken ?? null);
      const role = this.normalizeRole(res.user.role);
      const user: User = {
        id: res.user.id ?? '',
        name: res.user.displayName ?? '',
        email: res.user.email ?? '',
        avatar: '',
        role,
        roles: this.normalizeRoles(res.user.roles, role),
        onboardingCompletedAt: res.user.onboardingCompletedAt ?? null,
        joinedAt: new Date().toISOString(),
      };
      this.completeSignIn(user, 'email');
      this.reloadCartAndWishlistAfterSignIn();
      this._pending.set(null);
      this.clearPending();
      return { ok: true };
    } catch {
      return {
        ok: false,
        error: 'รหัส OTP หรือลิงก์ยืนยันไม่ถูกต้อง หรือหมดอายุแล้ว',
      };
    }
  }

  /**
   * Verify email directly via 6-digit OTP code.
   */
  async verifyOtp(otp: string, email?: string): Promise<{ ok: boolean; error?: string }> {
    const trimmedOtp = (otp ?? '').trim();
    const targetEmail = email?.trim() || this._pending()?.email;
    if (!trimmedOtp || !/^\d{6}$/.test(trimmedOtp)) {
      return { ok: false, error: 'กรุณากรอกรหัส OTP 6 หลัก' };
    }
    if (!targetEmail) {
      return { ok: false, error: 'ไม่พบอีเมลสำหรับยืนยัน กรุณากรอกอีเมล' };
    }
    return this.verifyEmail(trimmedOtp, targetEmail);
  }

  /**
   * Request a new 6-digit OTP code sent to the email address.
   */
  async sendOtp(email?: string): Promise<{ ok: boolean; message?: string }> {
    const targetEmail = email?.trim() || this._pending()?.email;
    if (!targetEmail || !this.isValidEmail(targetEmail)) {
      return { ok: false, message: 'กรุณาระบุอีเมลที่ถูกต้อง' };
    }
    let message = '';
    try {
      const result = await postApiAuthResendVerification({ body: { email: targetEmail } });
      message = unwrapSdkResult(result).message ?? '';
      this._verificationNotice.set(message);
    } catch (e) {
      this.apiFail.report('ขอรหัส OTP อีกครั้ง', e);
      return { ok: false };
    }
    return { ok: true, message };
  }

  /** Resend verification email — calls API to re-send the real email link / OTP */
  async resendCode(email?: string): Promise<{ ok: boolean; message?: string }> {
    return this.sendOtp(email);
  }

  // ========== Social ==========

  /**
   * Google: GIS authorization code + backend token exchange (popup, resolves in place).
   * LINE: full-page redirect to LINE's consent page — see {@link completeLineSignIn} for the
   * other half (external-login-and-mail-config v1 §4.1).
   * Facebook is still not implemented and is rejected here (GAP-04).
   *
   * `options.returnUrl` is only meaningful for redirect-based providers: the page that started
   * the flow is gone by the time the user comes back, so the destination travels with the
   * pending request instead of living in component state.
   */
  async signInWithProvider(
    provider: Exclude<AuthProvider, 'email'>,
    options?: { returnUrl?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    if (provider === 'google') {
      try {
        await this.googleOauthConfig.ensureLoaded();
        if (!this.googleOauthConfig.getClientId()) {
          return { ok: false, error: 'ยังไม่ได้ตั้งค่า Google OAuth' };
        }
        const { code, redirectUri } = await this.googleOauth.requestAuthorizationCode();
        const result = await postApiAuthExternalByProvider({
          path: { provider: 'google' },
          body: { authorizationCode: code, redirectUri, acceptTerms: true },
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        this.applyExternalSession(unwrapSdkResult(result), 'google');
        return { ok: true };
      } catch (e) {
        this.apiFail.report('เข้าสู่ระบบด้วย Google', e);
        const msg = e instanceof Error ? e.message : '';
        return { ok: false, error: msg || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' };
      }
    }

    if (provider === 'line') {
      await this.oauthClients.ensureLoaded();
      // AC-7: the server decides. An empty channel id means it cannot finish the exchange, so
      // the flow stops here instead of sending the user to a consent screen that leads nowhere.
      if (!this.oauthClients.lineLoginChannelId()) {
        return { ok: false, error: 'ยังไม่เปิดให้เข้าสู่ระบบด้วย LINE' };
      }
      const started = this.lineOauth.startSignIn(options?.returnUrl ?? '/');
      if (!started) {
        return { ok: false, error: 'ยังไม่เปิดให้เข้าสู่ระบบด้วย LINE' };
      }
      // §4.1: the browser is on its way to access.line.me. Resolving here would let the caller
      // flash a "สำเร็จ" toast (or drop its loading state) over a page that is already leaving.
      return new Promise<{ ok: boolean; error?: string }>(() => {
        /* intentionally never settles — the navigation replaces this document */
      });
    }

    // GAP-04: Facebook is not wired up — the backend provider is a stub that returns 501, and
    // this used to send a fabricated `email:name` code with a hardcoded profile so the failure
    // looked like a real login attempt. The button stays hidden until the OAuth app exists.
    return {
      ok: false,
      error: 'ยังไม่เปิดให้เข้าสู่ระบบด้วยช่องทางนี้',
    };
  }

  /**
   * Second half of the LINE redirect flow, called by `/auth/line/callback` with the `code` and
   * `state` LINE appended to the callback URL (§3.2/§4.1).
   *
   * The pending request stored at redirect time is consumed here, which is what validates
   * `state` *and* yields the exact `redirect_uri` string the token exchange has to replay — LINE
   * compares it byte-for-byte. `returnUrl` travels back to the caller because the page that
   * started the flow no longer exists.
   *
   * No {@link ApiFailureReporter} call: every failure below is rendered by the callback page
   * itself, so reporting would stack a red toast on top of the message the user is already
   * reading (same split as `LineNotificationService`'s user-initiated actions).
   */
  async completeLineSignIn(input: {
    code: string;
    state: string;
  }): Promise<{ ok: boolean; error?: string; returnUrl?: string }> {
    if (!input.code) {
      return { ok: false, error: 'ไม่พบรหัสยืนยันจาก LINE กรุณาลองใหม่อีกครั้ง' };
    }
    const pending = this.lineOauth.consumeState(input.state);
    if (!pending) {
      return { ok: false, error: 'คำขอเข้าสู่ระบบไม่ถูกต้องหรือหมดอายุ กรุณาลองใหม่อีกครั้ง' };
    }
    try {
      const result = await postApiAuthExternalByProvider({
        path: { provider: 'line' },
        body: {
          authorizationCode: input.code,
          redirectUri: pending.redirectUri,
          acceptTerms: true,
        },
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      this.applyExternalSession(unwrapSdkResult(result), 'line');
      return { ok: true, returnUrl: pending.returnUrl };
    } catch (e) {
      return {
        ok: false,
        // §4.3: a 4xx from this endpoint is already a Thai sentence written for the end user
        // (§3.2's table), so it is shown verbatim rather than replaced by a generic line.
        error: AuthService.userFacingProblemDetail(e) ?? 'เข้าสู่ระบบด้วย LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
      };
    }
  }

  /** Sign out — calls API to revoke the refresh token (AUD-007). */
  signOut(): void {
    const refreshToken = this._refreshToken();
    if (refreshToken) {
      // Fire-and-forget logout API call (uses refresh token, not access token).
      void (async () => {
        try {
          await postApiAuthLogout({ body: { refreshToken } });
        } catch (e) {
          this.apiFail.report('ออกจากระบบ (เซิร์ฟเวอร์)', e);
        }
      })();
    }
    this.setAccessToken(null);
    this.setRefreshToken(null);
    this._session.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }

    // DEV-BYPASS: signing out of a build with no working login would strand the user on
    // /auth/login, so come straight back in as the seeded account — unless the account was just
    // restricted, where re-entering would loop 403 → signOut → re-enter on a banned seed user.
    if (!this._accountRestricted) this._devBypassReactivator?.();
  }

  // ========== Forgot password ==========

  /**
   * GAP-03: asks the API to email a reset link. This used to return a fake success with
   * no backend behind it, so nobody who forgot their password could ever recover.
   * The API replies identically whether or not the account exists, so neither can we.
   */
  async requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isValidEmail(email)) {
      return { ok: false, error: 'อีเมลไม่ถูกต้อง' };
    }
    try {
      await postApiAuthForgotPassword({ body: { email } });
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ขอลิงก์ตั้งรหัสผ่านใหม่', e);
      return { ok: false, error: 'ส่งลิงก์ไม่สำเร็จ กรุณาลองใหม่' };
    }
  }

  /** GAP-03: redeems the emailed token and sets the new password. */
  async resetPassword(
    token: string,
    password: string,
    confirmPassword: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (password.length < 8) {
      return { ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' };
    }
    if (password !== confirmPassword) {
      return { ok: false, error: 'รหัสผ่านยืนยันไม่ตรงกัน' };
    }
    try {
      await postApiAuthResetPassword({ body: { token, password, confirmPassword } });
      // Every session was revoked server-side; drop any local one too.
      this.setAccessToken(null);
      this.setRefreshToken(null);
      this._session.set(null);
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ตั้งรหัสผ่านใหม่', e);
      return {
        ok: false,
        error: 'ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว กรุณาขอลิงก์ใหม่',
      };
    }
  }

  /**
   * QA fix (stale header identity): `auth.user()` used to be frozen at whatever the login
   * response (or a session restored from `localStorage`) said, and nothing ever reconciled it
   * against the live, authoritative account the JWT actually resolves to server-side — so a
   * session left over from an earlier login in the same browser (a different seeded account,
   * multiple tabs, etc.) could keep showing that account's name/role in the header indefinitely,
   * even though every real API call was already correctly scoped to whoever the token belongs
   * to. `MeService.loadProfile()` already calls `GET /api/me/profile` on every authenticated
   * header/Studio page load — this reconciles `auth.user()` against that live result each time,
   * so the header self-heals to the actually-authenticated account instead of staying stale.
   */
  syncUserFromProfile(profile: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    roles?: string[] | null;
    onboardingCompletedAt?: string | null;
  }): void {
    const current = this._session();
    if (!current) return;

    const role = this.normalizeRole(profile.role);
    const nextUser: User = {
      ...current.user,
      id: profile.id || current.user.id,
      name: profile.name ?? current.user.name,
      email: profile.email || current.user.email,
      role,
      roles: this.normalizeRoles(profile.roles, role),
      onboardingCompletedAt:
        profile.onboardingCompletedAt !== undefined
          ? profile.onboardingCompletedAt
          : current.user.onboardingCompletedAt,
    };

    if (
      nextUser.id === current.user.id &&
      nextUser.name === current.user.name &&
      nextUser.email === current.user.email &&
      nextUser.role === current.user.role &&
      nextUser.roles.length === current.user.roles.length &&
      nextUser.roles.every((r) => current.user.roles.includes(r)) &&
      nextUser.onboardingCompletedAt === current.user.onboardingCompletedAt
    ) {
      return;
    }

    const nextSession: AuthSession = { ...current, user: nextUser };
    this._session.set(nextSession);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSession));
      } catch {
        /* ignore */
      }
    }
  }

  // ========== Internals ==========

  /**
   * anonymous-cart-wishlist-scoping AC-17: the backend already merged the anonymous
   * cart/wishlist into this account by the time sign-in responds — reload both so the UI
   * reflects the merged result instead of the stale pre-merge state the singletons loaded
   * while still anonymous.
   */
  private reloadCartAndWishlistAfterSignIn(): void {
    this.injector.get(CartService).loadCart();
    void this.injector.get(WishlistService).refresh();
  }

  /**
   * external-login-and-mail-config v1 §4.1: the tokens/user/cart-merge tail shared by every
   * external provider. Google and LINE differ only in how they obtain the authorization code —
   * what happens with `AuthSessionResponse` afterwards is identical, and duplicating it is how
   * the two flows would silently drift apart.
   */
  private applyExternalSession(res: AuthSessionResponse, provider: AuthProvider): void {
    this.setAccessToken(res.accessToken);
    this.setRefreshToken(res.refreshToken ?? null);
    const role = this.normalizeRole(res.user.role);
    const user: User = {
      id: res.user.id,
      name: res.user.displayName,
      email: res.user.email,
      avatar: '',
      role,
      roles: this.normalizeRoles(res.user.roles, role),
      onboardingCompletedAt: res.user.onboardingCompletedAt ?? null,
      joinedAt: new Date().toISOString(),
    };
    this.completeSignIn(user, provider);
    this.reloadCartAndWishlistAfterSignIn();
  }

  /**
   * The `detail` of a 4xx ProblemDetails — the backend writes those in Thai for the end user
   * (§3.2), so they are worth more than any generic sentence we could substitute. Deliberately
   * limited to 4xx: a 500 body is an internal message, and a native `Error` is a network failure
   * whose "Failed to fetch" must never be shown as if the server had said it.
   */
  private static userFacingProblemDetail(error: unknown): string | null {
    if (error == null || typeof error !== 'object' || error instanceof Error) return null;
    const status = extractErrorStatus(error);
    if (status === undefined || status < 400 || status >= 500) return null;
    const o = error as Record<string, unknown>;
    const detail = o['detail'];
    if (typeof detail === 'string' && detail.trim()) return detail;
    const message = o['message'];
    if (typeof message === 'string' && message.trim()) return message;
    return null;
  }

  private completeSignIn(user: User, provider: AuthProvider): void {
    // Every login flow (password, OAuth, verify-email) ends here, so this is the one place a
    // reinstated account clears the sticky restriction guard.
    this._accountRestricted = false;
    const session: AuthSession = {
      user,
      provider,
      signedInAt: new Date().toISOString(),
    };
    this._session.set(session);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      } catch {
        /* ignore */
      }
    }
  }

  private loadSession(): AuthSession | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      return null;
    }
  }

  private loadPending(): PendingAuth | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PendingAuth) : null;
    } catch {
      return null;
    }
  }

  private persistPending(): void {
    if (typeof localStorage === 'undefined') return;
    const p = this._pending();
    if (p) {
      localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    } else {
      localStorage.removeItem(PENDING_KEY);
    }
  }

  private clearPending(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PENDING_KEY);
    }
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private normalizeRole(raw: string | null | undefined): UserRole {
    const v = (raw ?? '').toLowerCase();
    if (v === 'admin' || v === 'seller' || v === 'buyer') return v;
    return 'buyer';
  }

  /**
   * multi-role-permissions v1 §4: parses `AuthUserResponse.roles`/`UserProfileResponse.roles`
   * (`string[]` on the generated SDK types). Accepts `unknown` (not just `string[]`) because
   * `syncUserFromProfile()` also feeds it a loosely-typed inline profile shape. Falls back to
   * `[fallbackRole]` — the already-normalized single `role` as a one-element array — so a response
   * missing `roles` (older backend build, or a session restored from `localStorage` before this
   * rollout) still resolves to something sane instead of an empty array or silently dropping back
   * to `'buyer'` for a known seller/admin.
   */
  private normalizeRoles(raw: unknown, fallbackRole: UserRole): UserRole[] {
    if (Array.isArray(raw)) {
      const normalized = raw
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.toLowerCase())
        .filter((v): v is UserRole => v === 'admin' || v === 'seller' || v === 'buyer');
      const deduped = Array.from(new Set(normalized));
      if (deduped.length > 0) return deduped;
    }
    return [fallbackRole];
  }

  /**
   * F-08 (N-04): change the password without leaving the session.
   *
   * The server revokes every refresh token on success — including this session's — because
   * somebody changing their password usually believes it leaked. So the local session is
   * cleared here too: leaving it in place would show a signed-in header backed by a refresh
   * token the server has already thrown away, and the first silent refresh would fail with no
   * explanation the user could connect to what they just did.
   */
  async changePassword(request: ChangePasswordRequest): Promise<void> {
    try {
      await postApiAuthChangePassword({ body: request, throwOnError: true });
    } catch (e) {
      this.apiFail.report('เปลี่ยนรหัสผ่าน', e);
      throw e;
    }

    this.signOut();
  }
}


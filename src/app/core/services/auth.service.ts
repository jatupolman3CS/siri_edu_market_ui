import { Injectable, computed, inject, signal } from '@angular/core';
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
import type { ChangePasswordRequest } from '../api/types.gen';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { GoogleOauthService } from './google-oauth.service';
import { GoogleOauthConfigService } from './google-oauth-config.service';

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
  readonly isAdmin = computed(() => this.role() === 'admin');
  readonly isSeller = computed(() => this.role() === 'seller');

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
      } catch {
        // Drop session — caller decides whether to redirect to /auth/login.
        this.setAccessToken(null);
        this.setRefreshToken(null);
        this._session.set(null);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY);
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
      const user: User = {
        id: res.user.id,
        name: res.user.displayName,
        email: res.user.email,
        avatar: '',
        role: this.normalizeRole((res.user as { role?: string }).role),
        joinedAt: new Date().toISOString(),
      };
      this.completeSignIn(user, 'email');
      return { ok: true };
    } catch (e) {
      this.apiFail.report('เข้าสู่ระบบ', e);
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
    if (input.password.length < 6) {
      return { ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
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
   * Verify email with opaque token from the verification email link, or the dev 6-digit code
   * if the backend accepts it. On success stores JWT + session (same shape as login).
   */
  async verifyEmail(tokenOrCode: string): Promise<{ ok: boolean; error?: string }> {
    const trimmed = (tokenOrCode ?? '').trim();
    if (!trimmed) {
      return { ok: false, error: 'กรุณากรอกรหัสยืนยัน' };
    }
    try {
      const result = await postApiAuthVerifyEmail({ body: { token: trimmed } });
      const res = unwrapSdkResult(result);
      this.setAccessToken(res.accessToken);
      this.setRefreshToken(res.refreshToken ?? null);
      const user: User = {
        id: res.user.id ?? '',
        name: res.user.displayName ?? '',
        email: res.user.email ?? '',
        avatar: '',
        role: this.normalizeRole((res.user as { role?: string }).role),
        joinedAt: new Date().toISOString(),
      };
      this.completeSignIn(user, 'email');
      this._pending.set(null);
      this.clearPending();
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ยืนยันอีเมล', e);
      return {
        ok: false,
        error: 'ยืนยันอีเมลไม่สำเร็จ — ใช้ลิงก์ในอีเมลหรือรหัสที่ถูกต้อง',
      };
    }
  }

  /** Resend verification email — calls API to re-send the real email link */
  async resendCode(): Promise<{ ok: boolean; message?: string }> {
    const p = this._pending();
    if (!p) return { ok: false };
    let message = '';
    try {
      const result = await postApiAuthResendVerification({ body: { email: p.email } });
      // D-06: same reason as register() — the request can succeed while the email does not.
      message = unwrapSdkResult(result).message ?? '';
      this._verificationNotice.set(message);
    } catch (e) {
      this.apiFail.report('ส่งอีเมลยืนยันอีกครั้ง', e);
      return { ok: false };
    }
    return { ok: true, message };
  }

  // ========== Social ==========

  /**
   * Google: GIS authorization code + backend token exchange.
   * Facebook and LINE are not implemented yet and are rejected here (GAP-04).
   */
  async signInWithProvider(provider: Exclude<AuthProvider, 'email'>): Promise<{ ok: boolean; error?: string }> {
    if (provider === 'google') {
      try {
        await this.googleOauthConfig.ensureLoaded();
        if (!this.googleOauthConfig.getClientId()) {
          return { ok: false, error: 'ยังไม่ได้ตั้งค่า Google OAuth' };
        }
        const { code, redirectUri } = await this.googleOauth.requestAuthorizationCode();
        const result = await postApiAuthExternalByProvider({
          path: { provider: 'google' },
          body: { authorizationCode: code, redirectUri },
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        const res = unwrapSdkResult(result);
        this.setAccessToken(res.accessToken);
        this.setRefreshToken(res.refreshToken ?? null);
        const user: User = {
          id: res.user.id,
          name: res.user.displayName,
          email: res.user.email,
          avatar: '',
          role: this.normalizeRole((res.user as { role?: string }).role),
          joinedAt: new Date().toISOString(),
        };
        this.completeSignIn(user, 'google');
        return { ok: true };
      } catch (e) {
        this.apiFail.report('เข้าสู่ระบบด้วย Google', e);
        const msg = e instanceof Error ? e.message : '';
        return { ok: false, error: msg || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' };
      }
    }

    // GAP-04: Facebook and LINE are not wired up — the backend providers are stubs that
    // return 501, and this used to send a fabricated `email:name` code with a hardcoded
    // profile so the failure looked like a real login attempt. The buttons stay hidden
    // until the OAuth apps exist.
    return {
      ok: false,
      error: 'ยังไม่เปิดให้เข้าสู่ระบบด้วยช่องทางนี้',
    };
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

  // ========== Internals ==========

  private completeSignIn(user: User, provider: AuthProvider): void {
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


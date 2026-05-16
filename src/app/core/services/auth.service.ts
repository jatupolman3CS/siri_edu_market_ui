import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { User, UserRole } from '../models';
import {
  postApiAuthLogin,
  postApiAuthExternalByProvider,
  postApiAuthLogout,
  postApiAuthRefresh,
  postApiAuthRegister,
  postApiAuthResendVerification,
  postApiAuthVerifyEmail,
} from '../api';
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
      await postApiAuthRegister({
        body: {
          email: input.email,
          password: input.password,
          confirmPassword: input.confirmPassword,
          displayName: input.name,
        },
      });
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
  async resendCode(): Promise<{ ok: boolean }> {
    const p = this._pending();
    if (!p) return { ok: false };
    try {
      await postApiAuthResendVerification({ body: { email: p.email } });
    } catch (e) {
      this.apiFail.report('ส่งอีเมลยืนยันอีกครั้ง', e);
      return { ok: false };
    }
    return { ok: true };
  }

  // ========== Social ==========

  /**
   * Google: GIS authorization code + backend token exchange.
   * Facebook/LINE: mock-style `email:name` code when API uses mock external providers.
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

    const mockProfiles: Record<'facebook' | 'line', Partial<User>> = {
      facebook: {
        name: 'Pichaya P. (FB)',
        email: 'pichaya.fb@example.com',
        avatar:
          'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
      },
      line: {
        name: 'Pichaya P. (LINE)',
        email: 'pichaya.line@example.com',
        avatar:
          'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop&crop=face',
      },
    };
    const p = mockProfiles[provider];
    const email = (p.email ?? 'mock@dev.local').trim();
    const name = (p.name ?? email.split('@')[0] ?? 'Mock User').trim();
    try {
      const result = await postApiAuthExternalByProvider({
        path: { provider },
        body: { authorizationCode: `${email}:${name}` },
      });
      const res = unwrapSdkResult(result);
      this.setAccessToken(res.accessToken);
      this.setRefreshToken(res.refreshToken ?? null);
      const user: User = {
        id: res.user.id,
        name: res.user.displayName,
        email: res.user.email,
        avatar: p.avatar ?? '',
        role: this.normalizeRole((res.user as { role?: string }).role),
        joinedAt: new Date().toISOString(),
      };
      this.completeSignIn(user, provider);
      return { ok: true };
    } catch (e) {
      this.apiFail.report('เข้าสู่ระบบด้วยผู้ให้บริการภายนอก', e);
      return { ok: false, error: 'เข้าสู่ระบบไม่สำเร็จ' };
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
  }

  // ========== Forgot password ==========
  // AUD-011: forgot-password is still mock — no backend endpoint exists.
  // Pretend-success so the UI flow can be exercised; mark the response so
  // callers can warn the user that nothing was actually sent.

  requestPasswordReset(email: string): { ok: boolean; mocked?: true; error?: string } {
    if (!this.isValidEmail(email)) {
      return { ok: false, error: 'อีเมลไม่ถูกต้อง' };
    }
    return { ok: true, mocked: true };
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
}


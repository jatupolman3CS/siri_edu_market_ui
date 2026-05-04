import { Injectable, computed, signal } from '@angular/core';
import { User } from '../models';
import { MOCK_USER } from '../mock/library.mock';

const STORAGE_KEY = 'siriedu.auth';
const PENDING_KEY = 'siriedu.auth.pending';

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
  code: string;          // mock verification code (real: sent via email)
  expiresAt: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _session = signal<AuthSession | null>(this.loadSession());
  private readonly _pending = signal<PendingAuth | null>(this.loadPending());

  readonly session = this._session.asReadonly();
  readonly pending = this._pending.asReadonly();

  readonly user = computed(() => this._session()?.user ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly isPendingVerification = computed(() => this._pending() !== null);

  // ========== Email / Password ==========

  /** Sign in with email + password (mock — accepts anything non-empty) */
  signIn(email: string, password: string): { ok: boolean; error?: string } {
    if (!email || !password) {
      return { ok: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' };
    }
    if (password.length < 6) {
      return { ok: false, error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' };
    }
    const user: User = { ...MOCK_USER, email };
    this.completeSignIn(user, 'email');
    return { ok: true };
  }

  /** Register new account → sends to verify-email page */
  register(input: {
    name: string;
    email: string;
    password: string;
    confirmPassword: string;
    acceptTerms: boolean;
  }): { ok: boolean; error?: string } {
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
    const code = this.generateCode();
    const pending: PendingAuth = {
      email: input.email,
      name: input.name,
      provider: 'email',
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    this._pending.set(pending);
    this.persistPending();
    // For demo only — log code to console so the user can read it
    console.info(
      `%c📧 [SIRIEDUMARKET] Mock verification code for ${input.email}: ${code}`,
      'background:#FFEAF1;color:#B83864;padding:4px 8px;border-radius:4px;font-weight:bold',
    );
    return { ok: true };
  }

  /** Verify the 6-digit code */
  verifyEmail(code: string): { ok: boolean; error?: string } {
    const p = this._pending();
    if (!p) {
      return { ok: false, error: 'ไม่พบข้อมูลการสมัคร — กรุณาลองใหม่' };
    }
    if (new Date(p.expiresAt).getTime() < Date.now()) {
      return { ok: false, error: 'รหัสยืนยันหมดอายุแล้ว — กรุณาขอรหัสใหม่' };
    }
    if (p.code !== code.trim()) {
      return { ok: false, error: 'รหัสยืนยันไม่ถูกต้อง' };
    }
    const user: User = {
      ...MOCK_USER,
      name: p.name,
      email: p.email,
    };
    this.completeSignIn(user, p.provider);
    this._pending.set(null);
    this.clearPending();
    return { ok: true };
  }

  /** Resend the verification code */
  resendCode(): { ok: boolean; code?: string } {
    const p = this._pending();
    if (!p) return { ok: false };
    const code = this.generateCode();
    const next: PendingAuth = {
      ...p,
      code,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };
    this._pending.set(next);
    this.persistPending();
    console.info(
      `%c📧 [SIRIEDUMARKET] New verification code for ${p.email}: ${code}`,
      'background:#FFEAF1;color:#B83864;padding:4px 8px;border-radius:4px;font-weight:bold',
    );
    return { ok: true, code };
  }

  /** Convenience: peek at the current mock code (for demo UI hint only) */
  peekCode(): string | undefined {
    return this._pending()?.code;
  }

  // ========== Social ==========

  /** Mock OAuth — instantly signs the user in with provider's profile */
  signInWithProvider(provider: AuthProvider): void {
    const profileByProvider: Record<AuthProvider, Partial<User>> = {
      email: { email: 'pichaya@example.com' },
      google: {
        name: 'Pichaya P. (Google)',
        email: 'pichaya@gmail.com',
        avatar:
          'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face',
      },
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
    const user: User = { ...MOCK_USER, ...profileByProvider[provider] };
    this.completeSignIn(user, provider);
  }

  /** Sign out */
  signOut(): void {
    this._session.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  // ========== Forgot password (mock) ==========

  requestPasswordReset(email: string): { ok: boolean; error?: string } {
    if (!this.isValidEmail(email)) {
      return { ok: false, error: 'อีเมลไม่ถูกต้อง' };
    }
    return { ok: true };
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

  private generateCode(): string {
    return String(Math.floor(100_000 + Math.random() * 900_000));
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}

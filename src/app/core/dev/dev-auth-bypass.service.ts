import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { getApiMeProfile } from '../api';
import { User, UserRole } from '../models';
import { AuthService } from '../services/auth.service';

/** Role stored across reloads so the switcher's choice survives a refresh. */
const DEV_ROLE_KEY = 'siriedu.dev.role';

/**
 * Placeholder access token. Deliberately not a JWT: the API's policy scheme forwards anything
 * shaped like `header.payload.signature` to real JWT validation and everything else to the
 * development bypass, so this value keeps the guards happy without pretending to be a token.
 */
const DEV_ACCESS_TOKEN = 'dev-bypass';

/**
 * DEV-BYPASS: signs the app in without a login screen while authentication is still being built.
 *
 * <p>
 * The API side (`Auth:DevBypass` in `appsettings.Development.json`) authenticates every request
 * as a seeded account and reads `X-Dev-Role` to decide which one. This service mirrors that
 * choice into the Angular session so route guards, the header and role-aware pages agree with
 * what the server is doing. It is inert unless `environment.devAuth.bypass` is on, which no
 * production build sets.
 * </p>
 */
@Injectable({ providedIn: 'root' })
export class DevAuthBypassService {
  private readonly auth = inject(AuthService);

  /** Whether this build asked for the bypass at all. */
  readonly enabled = environment.devAuth.bypass;

  private readonly _role = signal<UserRole>(this.loadRole());
  readonly role = this._role.asReadonly();

  /** Last profile the API confirmed, reused when `signOut()` asks to come back in. */
  private lastUser: User | null = null;

  /** Installs the session, then replaces the placeholder with the real seeded account. */
  async activate(): Promise<void> {
    if (!this.enabled) return;

    this.installSession(this.placeholderUser(this._role()));
    this.auth.setDevBypassReactivator(() => {
      this.installSession(this.lastUser ?? this.placeholderUser(this._role()));
    });

    await this.syncWithServer();
  }

  /**
   * Switches which seeded account the app runs as. Every page cached data for the previous
   * account, so this reloads rather than trying to invalidate a dozen services by hand.
   */
  setRole(role: UserRole): void {
    if (!this.enabled || role === this._role()) return;
    this._role.set(role);
    try {
      localStorage.setItem(DEV_ROLE_KEY, role);
    } catch {
      /* ignore — the reload below still applies the new role for this tab */
    }
    location.reload();
  }

  /** The role header every API call carries while the bypass is on. */
  currentRoleHeader(): string | null {
    return this.enabled ? this._role() : null;
  }

  /** Replaces the placeholder with the account the API actually impersonated. */
  private async syncWithServer(): Promise<void> {
    try {
      const profile = (await getApiMeProfile()).data;
      if (!profile) return;
      const role = this.normalizeRole(profile.role);
      this.installSession({
        id: profile.id ?? '',
        name: profile.name ?? '',
        email: profile.email ?? '',
        avatar: profile.avatarUrl ?? '',
        role,
        roles: this.normalizeRoles(profile.roles, role),
        joinedAt: profile.joinedAt ?? new Date().toISOString(),
      });
    } catch {
      // Backend down or not seeded — the placeholder session still opens every page.
    }
  }

  private installSession(user: User): void {
    this.lastUser = user;
    this.auth.applyDevBypassSession(user, DEV_ACCESS_TOKEN);
  }

  /**
   * Shown until `GET /api/me/profile` answers, so guards can run before the first response.
   * multi-role-permissions v1 §4: `roles: [role]` — a single-role placeholder is correct enough
   * for header/guard checks before `syncWithServer()` resolves the real `roles` array.
   */
  private placeholderUser(role: UserRole): User {
    return {
      id: '',
      name: `Dev ${role}`,
      email: `dev-${role}@localhost`,
      avatar: '',
      role,
      roles: [role],
      joinedAt: new Date().toISOString(),
    };
  }

  private loadRole(): UserRole {
    try {
      return this.normalizeRole(localStorage.getItem(DEV_ROLE_KEY));
    } catch {
      return environment.devAuth.role;
    }
  }

  private normalizeRole(raw: string | null | undefined): UserRole {
    const value = (raw ?? '').toLowerCase();
    return value === 'admin' || value === 'seller' || value === 'buyer'
      ? value
      : environment.devAuth.role;
  }

  /**
   * multi-role-permissions v1 §4: this file does not inject `AuthService` to reuse its
   * `normalizeRoles`, so it mirrors the same parsing logic locally (same reasoning as
   * `normalizeRole` above). Parses `UserProfileResponse.roles` (`string[]`), falling back to
   * `[fallbackRole]` when missing/unparseable.
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
}

import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { adminGuard, sellerGuard } from './role.guard';
import { AuthService } from '../services';

/**
 * multi-role-permissions v1 §4/§1 (AC-15): `sellerGuard` must keep allowing admins through even
 * though `roles` for an admin-only account never contains `'seller'` — the OR against
 * `isAdmin()` lives in the guard itself, not in `isSeller()`.
 */
function buildAuth(overrides: {
  isAuthenticated?: boolean;
  accessToken?: string | null;
  isAdmin?: boolean;
  isSeller?: boolean;
}): Pick<AuthService, 'isAuthenticated' | 'accessToken' | 'isAdmin' | 'isSeller'> {
  return {
    isAuthenticated: () => overrides.isAuthenticated ?? true,
    accessToken: () => (overrides.accessToken !== undefined ? overrides.accessToken : 'token-1'),
    isAdmin: () => overrides.isAdmin ?? false,
    isSeller: () => overrides.isSeller ?? false,
  } as Pick<AuthService, 'isAuthenticated' | 'accessToken' | 'isAdmin' | 'isSeller'>;
}

function setup(auth: Partial<AuthService>): { navigate: ReturnType<typeof vi.fn> } {
  const navigate = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: { navigate, createUrlTree: (commands: unknown[], extras?: unknown) => ({ commands, extras }) as unknown as UrlTree } },
      { provide: NzMessageService, useValue: { warning: vi.fn(), error: vi.fn(), success: vi.fn() } },
    ],
  });
  return { navigate };
}

describe('sellerGuard (multi-role-permissions v1 AC-15)', () => {
  it('allows a user whose roles include seller', () => {
    setup(buildAuth({ isSeller: true, isAdmin: false }));
    const result = TestBed.runInInjectionContext(() =>
      sellerGuard({} as never, { url: '/seller/dashboard' } as never),
    );
    expect(result).toBe(true);
  });

  it('allows an admin whose roles do NOT include seller (isSeller() false, isAdmin() true)', () => {
    setup(buildAuth({ isSeller: false, isAdmin: true }));
    const result = TestBed.runInInjectionContext(() =>
      sellerGuard({} as never, { url: '/seller/dashboard' } as never),
    );
    expect(result).toBe(true);
  });

  it('blocks a buyer with neither seller nor admin roles', () => {
    setup(buildAuth({ isSeller: false, isAdmin: false }));
    const result = TestBed.runInInjectionContext(() =>
      sellerGuard({} as never, { url: '/seller/dashboard' } as never),
    );
    expect(result).not.toBe(true);
  });

  it('redirects unauthenticated users to /auth/login', () => {
    setup(buildAuth({ isAuthenticated: false, accessToken: null }));
    const result = TestBed.runInInjectionContext(() =>
      sellerGuard({} as never, { url: '/seller/dashboard' } as never),
    );
    expect(result).not.toBe(true);
  });
});

describe('adminGuard (multi-role-permissions v1 AC-15)', () => {
  it('allows a user whose roles include admin', () => {
    setup(buildAuth({ isAdmin: true }));
    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as never, { url: '/admin' } as never),
    );
    expect(result).toBe(true);
  });

  it('blocks a seller (not admin)', () => {
    setup(buildAuth({ isAdmin: false, isSeller: true }));
    const result = TestBed.runInInjectionContext(() =>
      adminGuard({} as never, { url: '/admin' } as never),
    );
    expect(result).not.toBe(true);
  });
});

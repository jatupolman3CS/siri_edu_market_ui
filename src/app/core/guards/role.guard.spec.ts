import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SELLER_GUARD_MESSAGES, adminGuard, sellerGuard } from './role.guard';
import { AuthService } from '../services';
import {
  SellerAccessStatus,
  SellerApplicationService,
} from '../services/seller-application.service';

/**
 * multi-role-permissions v1 §4/§1 (AC-15): `sellerGuard` must keep allowing admins through even
 * though `roles` for an admin-only account never contains `'seller'` — the OR against
 * `isAdmin()` lives in the guard itself, not in `isSeller()`.
 *
 * F-03: `sellerGuard` is now async — it awaits the real store status from
 * `SellerApplicationService.resolveAccessStatus()` — so every `sellerGuard(...)` call below is
 * awaited. The pre-F-03 cases are unchanged in intent, only in shape.
 */
function buildAuth(overrides: {
  isAuthenticated?: boolean;
  accessToken?: string | null;
  isAdmin?: boolean;
  isSeller?: boolean;
  refreshSession?: () => Promise<string | null>;
}): Pick<AuthService, 'isAuthenticated' | 'accessToken' | 'isAdmin' | 'isSeller' | 'refreshSession'> {
  return {
    isAuthenticated: () => overrides.isAuthenticated ?? true,
    accessToken: () => (overrides.accessToken !== undefined ? overrides.accessToken : 'token-1'),
    isAdmin: () => overrides.isAdmin ?? false,
    isSeller: () => overrides.isSeller ?? false,
    refreshSession: overrides.refreshSession ?? (() => Promise.resolve(null)),
  } as Pick<AuthService, 'isAuthenticated' | 'accessToken' | 'isAdmin' | 'isSeller' | 'refreshSession'>;
}

type GuardHarness = {
  navigate: ReturnType<typeof vi.fn>;
  message: {
    warning: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
  };
  resolveAccessStatus: ReturnType<typeof vi.fn>;
};

/**
 * `status` is what `GET /api/me/seller-application` boils down to for the guard —
 * 'unavailable' stands for a failed lookup (network/5xx), which the service reports itself.
 */
function setup(auth: Partial<AuthService>, status: SellerAccessStatus = 'approved'): GuardHarness {
  const navigate = vi.fn();
  const message = { warning: vi.fn(), error: vi.fn(), success: vi.fn() };
  const resolveAccessStatus = vi.fn(async () => status);

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: auth },
      { provide: Router, useValue: { navigate, createUrlTree: (commands: unknown[], extras?: unknown) => ({ commands, extras }) as unknown as UrlTree } },
      { provide: NzMessageService, useValue: message },
      {
        provide: SellerApplicationService,
        useValue: { resolveAccessStatus } as unknown as SellerApplicationService,
      },
    ],
  });

  return { navigate, message, resolveAccessStatus };
}

function runSellerGuard(): Promise<boolean | UrlTree> {
  return Promise.resolve(
    TestBed.runInInjectionContext(() =>
      sellerGuard({} as never, { url: '/seller/dashboard' } as never),
    ) as boolean | UrlTree | Promise<boolean | UrlTree>,
  );
}

/** The fake Router returns the `createUrlTree` arguments, so the target is readable in asserts. */
function redirectTarget(result: boolean | UrlTree): unknown {
  return (result as unknown as { commands?: unknown[] }).commands;
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('sellerGuard (multi-role-permissions v1 AC-15)', () => {
  it('allows a user whose roles include seller', async () => {
    setup(buildAuth({ isSeller: true, isAdmin: false }), 'approved');
    const result = await runSellerGuard();
    expect(result).toBe(true);
  });

  it('allows an admin whose roles do NOT include seller (isSeller() false, isAdmin() true)', async () => {
    const harness = setup(buildAuth({ isSeller: false, isAdmin: true }), 'none');
    const result = await runSellerGuard();
    expect(result).toBe(true);
    // An admin has no store of their own — the guard must not even ask for an application.
    expect(harness.resolveAccessStatus).not.toHaveBeenCalled();
  });

  it('blocks a buyer with neither seller nor admin roles', async () => {
    setup(buildAuth({ isSeller: false, isAdmin: false }), 'none');
    const result = await runSellerGuard();
    expect(result).not.toBe(true);
  });

  it('redirects unauthenticated users to /auth/login', async () => {
    const harness = setup(buildAuth({ isAuthenticated: false, accessToken: null }), 'approved');
    const result = await runSellerGuard();
    expect(result).not.toBe(true);
    expect(redirectTarget(result)).toEqual(['/auth/login']);
    expect(harness.resolveAccessStatus).not.toHaveBeenCalled();
  });
});

/**
 * F-03 (TASK-PLAN-2026-09-12 §8.3): the five store states the guard has to tell apart, each with
 * its own destination and its own Thai explanation.
 */
describe('sellerGuard — store status gate (F-03)', () => {
  it('approved: lets a seller into /seller', async () => {
    const harness = setup(buildAuth({ isSeller: true }), 'approved');
    const result = await runSellerGuard();
    expect(result).toBe(true);
    expect(harness.resolveAccessStatus).toHaveBeenCalledTimes(1);
  });

  it('approved + stale token: calls refreshSession and grants access when refresh updates the role', async () => {
    // Approval grants the role server-side; a token minted before that is stale.
    // Guard must call refreshSession() so the new token carries the Seller claim, then re-check.
    let refreshCalled = false;
    const auth = {
      ...buildAuth({ isAdmin: false }),
      isSeller: () => refreshCalled, // false before refresh, true after
      refreshSession: vi.fn(async () => {
        refreshCalled = true;
        return 'new-token';
      }),
    };
    setup(auth as unknown as Partial<AuthService>, 'approved');
    const result = await runSellerGuard();
    expect(auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('approved + stale token: blocks when refresh still cannot grant seller role', async () => {
    const refreshSession = vi.fn(async () => null as string | null);
    const harness = setup(
      buildAuth({ isSeller: false, isAdmin: false, refreshSession }) as Partial<AuthService>,
      'approved',
    );
    const result = await runSellerGuard();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(result).not.toBe(true);
    expect(redirectTarget(result)).toEqual(['/']);
    expect(harness.message.error).toHaveBeenCalledWith(SELLER_GUARD_MESSAGES.notSeller);
  });

  it('pending: redirects to /become-seller and says the application is under review', async () => {
    const harness = setup(buildAuth({ isSeller: true }), 'pending');
    const result = await runSellerGuard();
    expect(result).not.toBe(true);
    expect(redirectTarget(result)).toEqual(['/become-seller']);
    expect(harness.message.warning).toHaveBeenCalledWith(SELLER_GUARD_MESSAGES.pending);
  });

  it('rejected: redirects to /become-seller with a different message than pending', async () => {
    const harness = setup(buildAuth({ isSeller: true }), 'rejected');
    const result = await runSellerGuard();
    expect(result).not.toBe(true);
    expect(redirectTarget(result)).toEqual(['/become-seller']);
    expect(harness.message.error).toHaveBeenCalledWith(SELLER_GUARD_MESSAGES.rejected);
    expect(SELLER_GUARD_MESSAGES.rejected).not.toBe(SELLER_GUARD_MESSAGES.pending);
  });

  it('no application at all (404): redirects to /become-seller and says the store is not open yet', async () => {
    const harness = setup(buildAuth({ isSeller: false }), 'none');
    const result = await runSellerGuard();
    expect(result).not.toBe(true);
    expect(redirectTarget(result)).toEqual(['/become-seller']);
    expect(harness.message.warning).toHaveBeenCalledWith(SELLER_GUARD_MESSAGES.none);
    expect(SELLER_GUARD_MESSAGES.none).not.toBe(SELLER_GUARD_MESSAGES.pending);
  });

  it('no application at all (404) but has seller role: allows existing seller into /seller', async () => {
    const harness = setup(buildAuth({ isSeller: true }), 'none');
    const result = await runSellerGuard();
    expect(result).toBe(true);
    expect(harness.message.warning).not.toHaveBeenCalled();
  });

  it('lookup failed: a real seller still gets in (falls back to the role in the token)', async () => {
    const harness = setup(buildAuth({ isSeller: true }), 'unavailable');
    const result = await runSellerGuard();
    expect(result).toBe(true);
    // The failure is reported by the service (ApiFailureReporter) — the guard must stay quiet
    // rather than blaming the user for an outage.
    expect(harness.message.error).not.toHaveBeenCalled();
    expect(harness.message.warning).not.toHaveBeenCalled();
  });

  it('lookup failed: a non-seller is still blocked (pre-F-03 behaviour, home + role message)', async () => {
    const harness = setup(buildAuth({ isSeller: false, isAdmin: false }), 'unavailable');
    const result = await runSellerGuard();
    expect(result).not.toBe(true);
    expect(redirectTarget(result)).toEqual(['/']);
    expect(harness.message.error).toHaveBeenCalledWith(SELLER_GUARD_MESSAGES.notSeller);
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

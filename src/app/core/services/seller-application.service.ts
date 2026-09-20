import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import {
  getApiMeSellerApplication,
  postApiMeSellerApplication,
  getApiAdminSellerApplications,
  postApiAdminSellerApplicationsByUserIdApprove,
  postApiAdminSellerApplicationsByUserIdReject,
} from '../api';
import type {
  AdminSellerApplicationResponse,
  SellerApplicationResponse,
} from '../api';
import { extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { TranslationService } from '../i18n';
import { AuthService } from './auth.service';

export type SellerApplicationStatus = 'pending' | 'approved' | 'rejected';

/**
 * F-03: what `sellerGuard` decides on — the three real application states plus the two that are
 * not a status at all: 'none' (404, never applied) and 'unavailable' (the lookup itself failed,
 * so the guard must fall back to the role in the token instead of throwing a genuine seller out
 * of their own store).
 */
export type SellerAccessStatus = SellerApplicationStatus | 'none' | 'unavailable';

/**
 * F-03: how long a failed lookup is remembered before the guard retries the API. Without it an
 * outage would fire one request — and one error toast — on every navigation inside /seller.
 */
const ACCESS_FAILURE_RETRY_MS = 30_000;

type MineOutcome =
  | { ok: true; data: SellerApplicationResponse | null }
  | { ok: false; error: unknown };

function normalizeStatus(raw: string | undefined): SellerApplicationStatus {
  switch (raw) {
    case 'approved':
      return 'approved';
    case 'rejected':
      return 'rejected';
    default:
      // The generated contract types `status` as a plain string; anything unexpected is treated
      // as "not usable yet" rather than silently unlocking the seller area.
      return 'pending';
  }
}

/**
 * GAP-01: buyer-to-seller onboarding. There was previously no way to become a seller
 * through the site — SELLER_PROFILE rows only came from the database seeder.
 */
@Injectable({ providedIn: 'root' })
export class SellerApplicationService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);
  /**
   * F-03: read only for cache ownership (`user()?.id`). AuthService never injects this service,
   * so the dependency stays one-way and cannot form a DI cycle.
   */
  private readonly auth = inject(AuthService);

  private readonly _mine = signal<SellerApplicationResponse | null>(null);
  private readonly _loading = signal<boolean>(false);
  /** F-03: cached guard decision for {@link accessOwnerId}. `null` = nothing cached yet. */
  private readonly _accessStatus = signal<SellerAccessStatus | null>(null);

  /** The signed-in user's application, or null when they have never applied. */
  readonly mine = this._mine.asReadonly();
  readonly loading = this._loading.asReadonly();
  /** F-03: the cached store status `sellerGuard` gates on — see {@link resolveAccessStatus}. */
  readonly accessStatus = this._accessStatus.asReadonly();

  /** Which account the cache belongs to, so one user never inherits another's decision. */
  private accessOwnerId: string | null = null;
  /** When the last failed lookup happened (epoch ms), for {@link ACCESS_FAILURE_RETRY_MS}. */
  private accessFailedAt = 0;
  /** De-duplicates parallel guard runs (parent + child routes resolving at the same time). */
  private inflightAccess: Promise<SellerAccessStatus> | null = null;
  /**
   * Identity the sign-out watcher last saw. Seeded synchronously at construction so the effect's
   * first flush is a no-op — it must react to a *change* of account, never wipe a decision the
   * guard cached in between (effects flush later than the navigation that triggered them).
   */
  private lastSeenUserId: string | null;

  constructor() {
    this.lastSeenUserId = untracked(() => this.auth.user()?.id ?? null);
    // F-03 requirement 2: drop the cached decision on sign-out (and on switching accounts) so a
    // second user on the same browser is never admitted on the first user's approval.
    effect(() => {
      const userId = this.auth.user()?.id ?? null;
      if (userId === this.lastSeenUserId) return;
      this.lastSeenUserId = userId;
      this.clearAccessCache();
    });
  }

  async loadMine(): Promise<SellerApplicationResponse | null> {
    const outcome = await this.fetchMine();
    if (!outcome.ok) {
      // Unchanged legacy behaviour: for the apply form a failed lookup reads as "no application".
      // It deliberately does NOT write the guard cache — `resolveAccessStatus()` owns that, and a
      // failure there means "unknown", not "never applied".
      this._mine.set(null);
      return null;
    }
    this._mine.set(outcome.data);
    this.cacheAccess(outcome.data ? normalizeStatus(outcome.data.status) : 'none');
    return outcome.data;
  }

  /**
   * F-03: the store status `sellerGuard` gates on, served from the in-memory cache so moving
   * between pages inside /seller does not re-hit `GET /api/me/seller-application`.
   *
   * Returns 'unavailable' when the lookup failed (network/5xx) — reported through
   * {@link ApiFailureReporter} — so the caller can fall back to the role in the token.
   */
  async resolveAccessStatus(options?: { force?: boolean }): Promise<SellerAccessStatus> {
    const ownerId = this.auth.user()?.id ?? null;
    if (ownerId !== this.accessOwnerId) this.clearAccessCache();

    if (!options?.force) {
      const cached = this._accessStatus();
      if (cached !== null) {
        // A failure is only remembered briefly; a real status stays until logout/resubmit.
        if (cached !== 'unavailable') return cached;
        if (Date.now() - this.accessFailedAt < ACCESS_FAILURE_RETRY_MS) return cached;
      }
      if (this.inflightAccess) return this.inflightAccess;
    }

    this.accessOwnerId = ownerId;
    const inflight = this.fetchAccessStatus();
    this.inflightAccess = inflight;
    try {
      return await inflight;
    } finally {
      if (this.inflightAccess === inflight) this.inflightAccess = null;
    }
  }

  /** F-03: forget the cached guard decision (sign-out, account switch, fresh submission). */
  clearAccessCache(): void {
    this._accessStatus.set(null);
    this._mine.set(null);
    this.accessOwnerId = null;
    this.accessFailedAt = 0;
    this.inflightAccess = null;
  }

  async submit(input: {
    studioName: string;
    bio: string;
    specialties: string[];
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await postApiMeSellerApplication({ body: input });
      const data = unwrapSdkResult(result);
      // F-03 requirement 2: a fresh submission invalidates whatever the guard cached (a rejected
      // application becomes pending again), so drop it and keep only what the server just said.
      this.clearAccessCache();
      this._mine.set(data);
      this.cacheAccess(normalizeStatus(data.status));
      return { ok: true };
    } catch (e) {
      this.apiFail.report('errors.context.submitSellerApplication', e);
      return { ok: false, error: this.translation.t('sellerApplication.submitFailed') };
    }
  }

  private async fetchAccessStatus(): Promise<SellerAccessStatus> {
    const outcome = await this.fetchMine();
    if (!outcome.ok) {
      this.apiFail.report('errors.context.checkSellerStatus', outcome.error);
      this.accessFailedAt = Date.now();
      this._accessStatus.set('unavailable');
      return 'unavailable';
    }
    this._mine.set(outcome.data);
    const status: SellerAccessStatus = outcome.data
      ? normalizeStatus(outcome.data.status)
      : 'none';
    this.cacheAccess(status);
    return status;
  }

  /** One request, three outcomes: the application, null for 404 (never applied), or a failure. */
  private async fetchMine(): Promise<MineOutcome> {
    this._loading.set(true);
    try {
      // F-03: `api-runtime` configures the generated client with `throwOnError: true`, which turned
      // the *expected* 404 into a throw carrying no status at all — `NotFound()` has an empty body,
      // so the thrown value is `{}`. The `response.status` check below has therefore been dead code
      // since that flag was introduced; opting out per call is what makes it work again, and it is
      // the difference between "never applied" (send them to /become-seller) and "the lookup broke"
      // (let a real seller through anyway).
      const result = await getApiMeSellerApplication({ throwOnError: false });
      // 404 simply means "has not applied yet" — not an error worth reporting.
      if (result.response?.status === 404) return { ok: true, data: null };
      return { ok: true, data: unwrapSdkResult(result) };
    } catch (e) {
      if (extractErrorStatus(e) === 404) return { ok: true, data: null };
      return { ok: false, error: e };
    } finally {
      this._loading.set(false);
    }
  }

  private cacheAccess(status: SellerAccessStatus): void {
    this.accessOwnerId = this.auth.user()?.id ?? null;
    this.accessFailedAt = 0;
    this._accessStatus.set(status);
  }

  // ===== Admin =====

  async listPending(page = 1, pageSize = 20): Promise<AdminSellerApplicationResponse[]> {
    try {
      const result = await getApiAdminSellerApplications({ query: { Page: page, PageSize: pageSize } });
      return unwrapSdkResult(result).items ?? [];
    } catch (e) {
      this.apiFail.report('errors.context.loadSellerApplications', e);
      return [];
    }
  }

  async listPendingPaged(
    page = 1,
    pageSize = 10,
  ): Promise<{ items: AdminSellerApplicationResponse[]; totalCount: number; page: number; pageSize: number; totalPages: number }> {
    try {
      const result = await getApiAdminSellerApplications({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: data.items ?? [],
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('errors.context.loadSellerApplications', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  async approve(userId: string): Promise<boolean> {
    try {
      await postApiAdminSellerApplicationsByUserIdApprove({ path: { userId }, throwOnError: true });
      return true;
    } catch (e) {
      this.apiFail.report('errors.context.approveApplication', e);
      return false;
    }
  }

  async reject(userId: string, reason: string): Promise<boolean> {
    try {
      await postApiAdminSellerApplicationsByUserIdReject({
        path: { userId },
        body: { reason },
        throwOnError: true,
      });
      return true;
    } catch (e) {
      this.apiFail.report('errors.context.rejectApplication', e);
      return false;
    }
  }
}

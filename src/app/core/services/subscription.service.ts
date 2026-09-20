import { Injectable, inject, signal } from '@angular/core';
import type {
  AdminSubscriptionListItem,
  Subscription,
  SubscriptionAccessHistoryItem,
} from '../models';
import {
  getApiAdminSubscriptions,
  getApiMeSubscription,
  getApiMeSubscriptionAccessHistory,
  postApiMeSubscription,
  postApiMeSubscriptionCancel,
} from '../api';
import {
  mapAdminSubscriptionListItem,
  mapSubscription,
  mapSubscriptionAccessHistoryItem,
} from '../api-mappers/mappers';
import { extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { TranslationService } from '../i18n/translation.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { createServerPager, type ServerPager } from './server-pager';
import type { PagedResult } from './infinite-pager';

export type AdminSubscriptionStatusFilter =
  | 'all'
  | 'incomplete'
  | 'active'
  | 'past_due'
  | 'canceled';

/**
 * subscription-membership v3 (docs/contracts/subscription-membership.md §3, §4) — service-as-store
 * for the buyer subscribe/cancel/status/access-history flows *and* the admin read-only list, same
 * "public + admin together" grouping `ExamHubService` already uses for one feature/one file.
 *
 * Round 2 (wired): every SDK call below hits the regenerated SDK for real now (gate 1 confirmed
 * backend matches this contract, snapshot updated, `npm run generate:api` regenerated
 * `sdk.gen.ts`/`types.gen.ts` against the live backend).
 *
 * `loadCurrent()`'s 404 handling — v2 → v3 spec fix (§3.4): `GET /api/me/subscription` returns
 * **404**, not 204, when the caller has never subscribed (or subscribed then canceled with
 * nothing new). Same "expected empty state, not a failure" shape as
 * `ExamCountdownService.loadSetting()`'s 404 — the SDK client defaults `throwOnError: true`
 * (`api-runtime.ts`'s `createClientConfig`), so `getApiMeSubscription()` **throws** on a 404
 * rather than resolving to a `{ response }` to branch on; {@link extractErrorStatus} reads the
 * thrown ProblemDetails body's own `status` field to tell a real 404 apart from every other
 * failure (500, network error, …), which still goes through {@link ApiFailureReporter} same as
 * everywhere else.
 */
@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  private readonly _current = signal<Subscription | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());
  private readonly _createState = signal<ActionState>(idleActionState());
  private readonly _cancelState = signal<ActionState>(idleActionState());

  readonly current = this._current.asReadonly();
  /** `loading` vs `idle` distinguishes "still fetching" from "fetched, no subscription" (both `current()===null`) — same convention as `ExamCountdownService.state`. */
  readonly state = this._state.asReadonly();
  readonly createState = this._createState.asReadonly();
  readonly cancelState = this._cancelState.asReadonly();

  /**
   * `GET /api/me/subscription` (§3.4). A `404` (never subscribed, or subscribed then canceled
   * with nothing new) means `current()` stays `null`; that is not an error state — see the class
   * doc above for why a thrown 404 is expected here, not a bug.
   */
  async loadCurrent(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      const data = unwrapSdkResult(await getApiMeSubscription());
      this._current.set(mapSubscription(data));
      this._state.set(idleActionState());
    } catch (e) {
      this._current.set(null);
      if (extractErrorStatus(e) === 404) {
        this._state.set(idleActionState());
        return;
      }
      this._state.set(errorActionState(this.translation.t('accountSubscription.loadFailed')));
      this.apiFail.report('errors.context.loadMembership', e);
    }
  }

  /**
   * `POST /api/me/subscription` (§3.3) — opens a real Stripe subscription + PaymentIntent.
   */
  async create(categoryIds: string[]): Promise<Subscription> {
    this._createState.set(loadingActionState());
    try {
      const data = unwrapSdkResult(await postApiMeSubscription({ body: { categoryIds } }));
      const sub = mapSubscription(data);
      this._current.set(sub);
      this._createState.set(successActionState(this.translation.t('subscribe.successToast')));
      return sub;
    } catch (e) {
      const message = this.apiFail.formatDetail(e);
      this._createState.set(errorActionState(message));
      throw e;
    }
  }

  /**
   * `POST /api/me/subscription/cancel` (§3.5) — sets `cancelAtPeriodEnd`, does not touch `status`.
   */
  async cancel(): Promise<void> {
    this._cancelState.set(loadingActionState());
    try {
      const data = unwrapSdkResult(await postApiMeSubscriptionCancel());
      this._current.set(mapSubscription(data));
      this._cancelState.set(successActionState(this.translation.t('accountSubscription.cancelSuccessToast')));
    } catch (e) {
      const message = this.apiFail.formatDetail(e);
      this._cancelState.set(errorActionState(message));
      throw e;
    }
  }

  /**
   * `GET /api/me/subscription/access-history` (§3.6) — page-based, same `ServerPager` shape
   * `AdminPayoutsPage`/`marketplacePager` already use.
   */
  private readonly accessHistoryPagerInstance: ServerPager<SubscriptionAccessHistoryItem> =
    createServerPager<SubscriptionAccessHistoryItem>({
      pageSize: 20,
      errorMessage: this.translation.t('subscriptionAccessHistory.loadFailed'),
      fetch: async (page, pageSize) => {
        const data = unwrapSdkResult(
          await getApiMeSubscriptionAccessHistory({
            query: { Page: page, PageSize: pageSize },
          }),
        );
        return {
          items: (data.items ?? []).map(mapSubscriptionAccessHistoryItem),
          page: data.page ?? page,
          pageSize: data.pageSize ?? pageSize,
          totalCount: data.totalCount ?? 0,
          totalPages: data.totalPages ?? 0,
        };
      },
    });

  readonly accessHistory = this.accessHistoryPagerInstance.items;
  readonly accessHistoryState = this.accessHistoryPagerInstance.state;
  readonly accessHistoryLoading = this.accessHistoryPagerInstance.loading;
  readonly accessHistoryPage = this.accessHistoryPagerInstance.page;
  readonly accessHistoryPageSize = this.accessHistoryPagerInstance.pageSize;
  readonly accessHistoryTotalCount = this.accessHistoryPagerInstance.totalCount;
  readonly accessHistoryTotalPages = this.accessHistoryPagerInstance.totalPages;

  async loadAccessHistory(): Promise<void> {
    try {
      await this.accessHistoryPagerInstance.reloadFromPage1();
    } catch (e) {
      this.apiFail.report('errors.context.loadAccessHistory', e);
    }
  }

  async onAccessHistoryPageChange(page: number): Promise<void> {
    try {
      await this.accessHistoryPagerInstance.onPageChange(page);
    } catch (e) {
      this.apiFail.report('errors.context.loadAccessHistory', e);
    }
  }

  async onAccessHistoryPageSizeChange(size: number): Promise<void> {
    try {
      await this.accessHistoryPagerInstance.onPageSizeChange(size);
    } catch (e) {
      this.apiFail.report('errors.context.loadAccessHistory', e);
    }
  }

  /**
   * `GET /api/admin/subscriptions` (§3.2) — plain paged fetch, same shape as
   * `AdminService.listPayoutsPaged`/`listTransactionsPaged` (the admin table owns its own
   * page/pageSize signals and calls this directly, no internal pager needed here).
   */
  async listAdmin(
    status: AdminSubscriptionStatusFilter,
    page = 1,
    pageSize = 10,
  ): Promise<PagedResult<AdminSubscriptionListItem>> {
    try {
      const result = await getApiAdminSubscriptions({
        query: { Page: page, PageSize: pageSize, ...(status !== 'all' ? { status } : {}) },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapAdminSubscriptionListItem),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('errors.context.listAdminSubscriptions', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  /** Test helper — mirrors `ReferralService.setSummaryForTest` / `ExamHubService.setPageForTesting`. */
  setCurrentForTest(sub: Subscription | null): void {
    this._current.set(sub);
  }

  resetCreateStateForTest(): void {
    this._createState.set(idleActionState());
  }
}

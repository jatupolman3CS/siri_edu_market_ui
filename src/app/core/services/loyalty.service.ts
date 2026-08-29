import { Injectable, inject, signal } from '@angular/core';
import { LoyaltyEntry, LoyaltySummary } from '../models';
import { mapLoyaltyEntry, mapLoyaltySummary } from '../api-mappers/mappers';
import { getApiMeLoyalty, getApiMeLoyaltyEntries } from '../api';
import { unwrapSdkResult } from './api-result';
import { AuthService } from './auth.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { createInfinitePager } from './infinite-pager';

/**
 * loyalty-points v1 (docs/contracts/loyalty-points.md §4) — service-as-store for the "คะแนนสะสม"
 * stat card + ledger drawer on `/library`.
 *
 * Calls `GET /api/me/loyalty` and `GET /api/me/loyalty/entries` through the generated SDK.
 * Never hardcode a number that could look like real data — the UI must show the loading dash
 * (`—`) instead of a fake balance while `summary()` is `null`.
 */
@Injectable({ providedIn: 'root' })
export class LoyaltyService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly auth = inject(AuthService);

  private readonly _summary = signal<LoyaltySummary | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());

  /** `null` = not loaded yet / request failed — the card must render `—`, never `0`. */
  readonly summary = this._summary.asReadonly();
  readonly state = this._state.asReadonly();

  private readonly ledgerPager = createInfinitePager<LoyaltyEntry>({
    pageSize: 20,
    errorMessage: 'โหลดคะแนนสะสมไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiMeLoyaltyEntries({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapLoyaltyEntry),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
  });

  readonly ledger = this.ledgerPager.items;
  readonly ledgerHasMore = this.ledgerPager.hasMore;
  readonly ledgerState = this.ledgerPager.state;

  /** Mirrors `LibraryService.refreshLibrary` — no accessToken means "not really logged in yet". */
  async refreshSummary(): Promise<void> {
    if (!this.auth.accessToken()) {
      if (this.auth.isAuthenticated()) {
        this._state.set(errorActionState('โหลดคะแนนสะสมไม่สำเร็จ'));
      }
      return;
    }

    this._state.set(loadingActionState());
    try {
      const result = await getApiMeLoyalty();
      const data = unwrapSdkResult(result);
      this._summary.set(mapLoyaltySummary(data));
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('โหลดคะแนนสะสม', e);
      this._state.set(errorActionState('โหลดคะแนนสะสมไม่สำเร็จ'));
    }
  }

  async loadLedgerFirst(): Promise<void> {
    if (!this.auth.accessToken()) return;
    try {
      await this.ledgerPager.loadFirst();
    } catch (e) {
      this.apiFail.report('โหลดประวัติคะแนนสะสม', e);
    }
  }

  loadMoreLedger(): Promise<void> {
    if (!this.auth.accessToken()) return Promise.resolve();
    return this.ledgerPager.loadMore();
  }
}

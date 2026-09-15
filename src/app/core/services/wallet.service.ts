import { Injectable, inject, signal } from '@angular/core';
import type { WalletEntry, WalletSummary, WalletTopUp } from '../models';
import { mapWalletEntry, mapWalletSummary, mapWalletTopUp } from '../api-mappers/mappers';
import {
  getApiMeWallet,
  getApiMeWalletEntries,
  getApiMeWalletTopupsById,
  postApiMeWalletTopups,
} from '../api';
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
 * buyer-wallet v1 (docs/contracts/buyer-wallet.md §4.2) — service-as-store for the buyer's wallet.
 *
 * Calls `GET /api/me/wallet`, `GET /api/me/wallet/entries`, `POST /api/me/wallet/topups`,
 * and `GET /api/me/wallet/topups/{id}`.
 * Never hardcode a fake balance — the UI must render `—` instead of 0 while `summary()` is `null`.
 */
@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly auth = inject(AuthService);

  private readonly _summary = signal<WalletSummary | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());

  /** `null` = not loaded yet / request failed — the card must render `—`, never `0`. */
  readonly summary = this._summary.asReadonly();
  readonly state = this._state.asReadonly();

  private readonly ledgerPager = createInfinitePager<WalletEntry>({
    pageSize: 20,
    errorMessage: 'โหลดประวัติยอดเงินไม่สำเร็จ',
    fetch: async (Page, PageSize) => {
      const result = await getApiMeWalletEntries({ query: { Page, PageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapWalletEntry),
        page: data.page ?? Page,
        pageSize: data.pageSize ?? PageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 0,
      };
    },
  });

  readonly ledger = this.ledgerPager.items;
  readonly ledgerHasMore = this.ledgerPager.hasMore;
  readonly ledgerState = this.ledgerPager.state;

  /** Mirrors `LoyaltyService.refreshSummary` — no accessToken means not logged in yet. */
  async refreshSummary(): Promise<void> {
    if (!this.auth.accessToken()) {
      if (this.auth.isAuthenticated()) {
        this._state.set(errorActionState('โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ'));
      }
      return;
    }

    this._state.set(loadingActionState());
    try {
      const result = await getApiMeWallet();
      const data = unwrapSdkResult(result);
      this._summary.set(mapWalletSummary(data));
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลกระเป๋าเงิน', e);
      this._state.set(errorActionState('โหลดข้อมูลกระเป๋าเงินไม่สำเร็จ'));
    }
  }

  async loadLedgerFirst(): Promise<void> {
    if (!this.auth.accessToken()) return;
    try {
      await this.ledgerPager.loadFirst();
    } catch (e) {
      this.apiFail.report('โหลดประวัติยอดเงิน', e);
    }
  }

  loadMoreLedger(): Promise<void> {
    if (!this.auth.accessToken()) return Promise.resolve();
    return this.ledgerPager.loadMore();
  }

  async createTopUp(amount: number): Promise<WalletTopUp | null> {
    if (!this.auth.accessToken()) return null;
    try {
      const result = await postApiMeWalletTopups({ body: { amount } });
      const data = unwrapSdkResult(result);
      return mapWalletTopUp(data);
    } catch (e) {
      this.apiFail.report('สร้างรายการเติมเงิน', e);
      return null;
    }
  }

  async pollTopUp(id: string): Promise<WalletTopUp | null> {
    if (!this.auth.accessToken()) return null;
    try {
      const result = await getApiMeWalletTopupsById({ path: { id } });
      const data = unwrapSdkResult(result);
      return mapWalletTopUp(data);
    } catch (e) {
      this.apiFail.report('ตรวจสอบสถานะการเติมเงิน', e);
      return null;
    }
  }
}

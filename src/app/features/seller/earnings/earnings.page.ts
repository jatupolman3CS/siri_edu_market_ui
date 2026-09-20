import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { PayoutAccountService, PlatformStatsService, SellerService, type SellerPayoutRow } from '../../../core/services';
import { AuthService } from '../../../core/services/auth.service';
import { resolveDownloadUrl } from '../../../core/api-runtime';
import { type SellerBalanceEntry } from '../../../core/models';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

/**
 * payout-request-slip-verification v1 §4.4 / seller-ads-promotion v1 §4.4: ledger `kind` → Thai
 * label (snake_case convention matching backend SellerBalanceService.MapKind).
 * Keys are looked up via `seller.earnings.kindLabels.<kind>` in the i18n dictionary.
 */

function formatBaht(v: number): string {
  return v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

@Component({
  selector: 'app-seller-earnings',
  standalone: true,
  imports: [
    RouterLink,
    TranslatePipe,
    StatCardComponent,
    EmptyStateComponent,
    IconComponent,
    PaginationComponent,
    ThbPipe,
    CommonModule,
    DatePipe,
    FormsModule,
    NzModalModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './earnings.page.html',
  styleUrl: './earnings.page.scss',
})
export class SellerEarningsPage {
  readonly seller = inject(SellerService);
  readonly payoutAccount = inject(PayoutAccountService);
  readonly platformStats = inject(PlatformStatsService);
  private readonly auth = inject(AuthService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly translation = inject(TranslationService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly totalPayouts = signal(0);
  readonly payouts = signal<SellerPayoutRow[]>([]);
  readonly loadingPayouts = signal(false);

  readonly ledgerPage = signal(1);
  readonly ledgerPageSize = signal(10);
  readonly ledgerTotal = signal(0);
  readonly balanceEntries = signal<SellerBalanceEntry[]>([]);
  readonly loadingLedger = signal(false);

  /** GAP-02: figures now come from the earnings endpoint rather than dashboard stats. */
  readonly totalEarnings = computed(() => this.seller.earnings()?.totalEarnings ?? 0);

  // payout-request-slip-verification v1 §3.4/§4.2: the ledger-backed figures (DEC-1) — replaces
  // this page's old reliance on the live-computed `pendingBalance` alone.
  readonly availableBalance = computed(() => this.seller.earnings()?.availableBalance ?? 0);
  readonly onHoldAmount = computed(() => this.seller.earnings()?.onHoldAmount ?? 0);
  readonly minPayoutAmount = computed(() => this.seller.earnings()?.minPayoutAmount ?? 0);
  readonly maxPayoutAmount = computed(() => this.seller.earnings()?.maxPayoutAmount ?? 0);
  readonly hasPayoutAccount = computed(() => this.seller.earnings()?.hasPayoutAccount ?? false);

  // ===== real-data-stats v1 §4.6: fee % (was hardcoded "90%") =====
  // Fallback 10 only while stats() hasn't loaded yet, same reasoning as the dashboard page.
  readonly sellerSharePercent = computed(
    () => 100 - (this.platformStats.stats()?.feeRatePercent ?? 10),
  );

  /** real-data-stats v1 §3.4/§4.6: same trend badge the dashboard page shows for "รายได้เดือนนี้". */
  readonly revenueTrendDisplay = computed(() => {
    const v = this.seller.stats().revenueTrendPercent;
    if (v == null) return null;
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  });

  /** True while a payout request is already awaiting processing. */
  readonly hasOpenRequest = computed(() =>
    (this.seller.earnings()?.payouts ?? []).some(
      (p) => p.status === 'pending' || p.status === 'processing',
    ),
  );

  /** payout-request-slip-verification v1 §4.2: the saved payout destination, masked. */
  readonly destinationMasked = computed(() => {
    const acc = this.payoutAccount.account();
    if (!acc || !acc.hasAccount) return '';
    if (acc.accountType === 'promptpay') return `${this.translation.t('shared.payoutAccount.promptPay')} ${acc.promptPayMasked}`;
    const bankName = this.translation.t(`banks.${acc.bankCode}`) || acc.bankCode;
    return `${bankName} ${acc.accountNumberMasked}`;
  });

  readonly requestOpen = signal<boolean>(false);
  readonly amount = signal<number | null>(null);
  readonly note = signal<string>('');
  readonly submitting = signal<boolean>(false);
  readonly cancellingId = signal<string | null>(null);

  /** §4.2: the 3 static reasons the "ขอถอนเงิน" button is disabled (submitting has its own label). */
  readonly disableReason = computed<string | null>(() => {
    if (!this.hasPayoutAccount()) return this.translation.t('seller.earnings.noPayoutAccount');
    if (this.availableBalance() < this.minPayoutAmount()) {
      return this.translation.t('seller.earnings.belowMinPayout', { amount: formatBaht(this.minPayoutAmount()) });
    }
    if (this.hasOpenRequest()) return this.translation.t('seller.earnings.pendingPayoutExists');
    return null;
  });

  readonly canOpenRequest = computed(() => this.disableReason() === null);

  /** §4.2/§4.3: client-side validation of the amount field before `submitRequest()`. */
  readonly amountError = computed<string | null>(() => {
    const v = this.amount();
    if (v === null) return null;
    if (!Number.isFinite(v) || v <= 0) return this.translation.t('seller.earnings.invalidAmount');
    // Reject more than 2 decimal places (e.g. 100.005) without floating-point false positives.
    if (Math.round(v * 100) / 100 !== v) return this.translation.t('seller.earnings.invalidAmount');
    if (v < this.minPayoutAmount()) {
      return this.translation.t('seller.earnings.amountBelowMin', { amount: formatBaht(this.minPayoutAmount()) });
    }
    const max = this.maxPayoutAmount();
    if (max > 0 && v > max) return this.translation.t('seller.earnings.amountAboveMax', { amount: formatBaht(max) });
    if (v > this.availableBalance()) return this.translation.t('seller.earnings.insufficientBalance');
    return null;
  });

  constructor() {
    void this.seller.loadEarnings();
    // real-data-stats v1 §4.6: needed for the "รายได้เดือนนี้" trend badge and the fee % below.
    void this.seller.refreshDashboard();
    void this.payoutAccount.load();
    this.platformStats.loadStats();
    void this.loadPayouts();
    void this.loadLedger();
  }

  async loadPayouts(): Promise<void> {
    this.loadingPayouts.set(true);
    try {
      const res = await this.seller.loadPayoutsPaged(this.page(), this.pageSize());
      this.payouts.set(res.items ?? []);
      this.totalPayouts.set(res.totalCount ?? 0);
    } finally {
      this.loadingPayouts.set(false);
    }
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.loadPayouts();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.loadPayouts();
  }

  async loadLedger(): Promise<void> {
    this.loadingLedger.set(true);
    try {
      const res = await this.seller.loadBalanceEntriesPaged(this.ledgerPage(), this.ledgerPageSize());
      this.balanceEntries.set(res.items ?? []);
      this.ledgerTotal.set(res.totalCount ?? 0);
    } finally {
      this.loadingLedger.set(false);
    }
  }

  onLedgerPageChange(p: number): void {
    this.ledgerPage.set(p);
    void this.loadLedger();
  }

  onLedgerPageSizeChange(newSize: number): void {
    this.ledgerPageSize.set(newSize);
    this.ledgerPage.set(1);
    void this.loadLedger();
  }

  ledgerLabel(kind: string): string {
    const translated = this.translation.t(`seller.earnings.kindLabels.${kind}`);
    return translated !== `seller.earnings.kindLabels.${kind}` ? translated : kind;
  }

  openRequest(): void {
    this.requestOpen.set(true);
  }

  cancelRequest(): void {
    this.requestOpen.set(false);
    this.amount.set(null);
    this.note.set('');
  }

  /** §4.2: "ถอนทั้งหมด" shortcut — fills the amount field with the current available balance. */
  fillMaxAmount(): void {
    this.amount.set(this.availableBalance());
  }

  async submitRequest(): Promise<void> {
    const v = this.amount();
    if (v === null || this.amountError()) {
      this.message.warning(this.amountError() ?? this.translation.t('seller.earnings.invalidAmount'));
      return;
    }
    if (this.submitting()) return;

    this.submitting.set(true);
    try {
      const result = await this.seller.requestPayout(v, this.note());
      if (result.ok) {
        this.message.success(this.translation.t('seller.earnings.payoutRequestSent'));
        this.cancelRequest();
        void this.loadPayouts();
        void this.loadLedger();
      }
    } finally {
      this.submitting.set(false);
    }
  }

  /** §4.3: `NzModalService.confirm` — never the browser's native `confirm()`. */
  confirmCancel(payout: SellerPayoutRow): void {
    this.modal.confirm({
      nzTitle: this.translation.t('seller.earnings.cancelPayoutTitle'),
      nzContent: this.translation.t('seller.earnings.cancelPayoutContent', { amount: formatBaht(payout.netAmount) }),
      nzOkText: this.translation.t('seller.earnings.cancelPayoutOk'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.close'),
      nzOnOk: () => this.doCancel(payout.id),
    });
  }

  private async doCancel(payoutId: string): Promise<void> {
    this.cancellingId.set(payoutId);
    try {
      const result = await this.seller.cancelPayout(payoutId);
      if (result.ok) {
        this.message.success(this.translation.t('seller.earnings.payoutCancelled'));
        void this.loadPayouts();
        void this.loadLedger();
      }
    } finally {
      this.cancellingId.set(null);
    }
  }

  /**
   * withdrawal-management (round 2): admin's uploaded transfer slip for a paid payout —
   * `p.slipUrl` is `/api/seller/payouts/{payoutId}/slips/{slipId}/file`, seller-owned only
   * (backend 404s for any other seller's payout).
   */
  slipFileUrl(p: SellerPayoutRow): string {
    return resolveDownloadUrl(p.slipUrl, this.auth.accessToken(), null, true);
  }

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'paid':
        return this.translation.t('seller.earnings.statusPaid');
      case 'processing':
        return this.translation.t('seller.earnings.statusProcessing');
      case 'failed':
        return this.translation.t('seller.earnings.statusFailed');
      case 'cancelled':
        return this.translation.t('seller.earnings.statusCancelled');
      default:
        return this.translation.t('seller.earnings.statusPending');
    }
  }
}

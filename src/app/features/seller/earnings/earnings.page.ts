import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { PlatformStatsService, SellerService, type SellerPayoutRow } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

@Component({
  selector: 'app-seller-earnings',
  standalone: true,
  imports: [
    RouterLink,
    StatCardComponent,
    EmptyStateComponent,
    IconComponent,
    PaginationComponent,
    ThbPipe,
    CommonModule,
    DatePipe,
    FormsModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './earnings.page.html',
  styleUrl: './earnings.page.scss',
})
export class SellerEarningsPage {
  readonly seller = inject(SellerService);
  readonly platformStats = inject(PlatformStatsService);
  private readonly message = inject(NzMessageService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly totalPayouts = signal(0);
  readonly payouts = signal<SellerPayoutRow[]>([]);
  readonly loadingPayouts = signal(false);

  /** GAP-02: figures now come from the earnings endpoint rather than dashboard stats. */
  readonly totalEarnings = computed(() => this.seller.earnings()?.totalEarnings ?? 0);
  readonly pendingBalance = computed(() => this.seller.earnings()?.pendingBalance ?? 0);

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

  readonly requestOpen = signal<boolean>(false);
  readonly bankAccount = signal<string>('');
  readonly submitting = signal<boolean>(false);

  constructor() {
    void this.seller.loadEarnings();
    // real-data-stats v1 §4.6: needed for the "รายได้เดือนนี้" trend badge and the fee % below.
    void this.seller.refreshDashboard();
    this.platformStats.loadStats();
    void this.loadPayouts();
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

  openRequest(): void {
    this.requestOpen.set(true);
  }

  cancelRequest(): void {
    this.requestOpen.set(false);
    this.bankAccount.set('');
  }

  async submitRequest(): Promise<void> {
    const account = this.bankAccount().trim();
    if (!account) {
      this.message.warning('กรุณาระบุบัญชีปลายทาง');
      return;
    }
    if (this.submitting()) return;

    this.submitting.set(true);
    try {
      const result = await this.seller.requestPayout(account);
      if (result.ok) {
        this.message.success('ส่งคำขอถอนเงินเรียบร้อย รอทีมงานดำเนินการ');
        this.cancelRequest();
        void this.loadPayouts();
      }
    } finally {
      this.submitting.set(false);
    }
  }

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'paid':
        return 'โอนแล้ว';
      case 'processing':
        return 'กำลังดำเนินการ';
      case 'failed':
        return 'ไม่สำเร็จ';
      default:
        return 'รอดำเนินการ';
    }
  }
}

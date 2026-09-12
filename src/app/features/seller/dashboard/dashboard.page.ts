import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { PlatformStatsService, SellerService } from '../../../core/services';
import { DEFAULT_STORE_READINESS } from '../../../core/models';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { StoreReadinessBarComponent } from '../../../shared/components/store-readiness-bar/store-readiness-bar.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { FeedbackModalComponent } from '../../../shared/components/feedback-modal/feedback-modal.component';

@Component({
  selector: 'app-seller-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    StatCardComponent,
    EmptyStateComponent,
    IconComponent,
    StoreReadinessBarComponent,
    ThbPipe,
    CompactPipe,
    DatePipe,
    ImgFallbackDirective,
    FeedbackModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class SellerDashboardPage {
  readonly seller = inject(SellerService);
  readonly platformStats = inject(PlatformStatsService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  readonly feedbackModalOpen = signal(false);

  openFeedbackModal(): void {
    this.feedbackModalOpen.set(true);
  }

  readonly maxMonth = computed(() =>
    Math.max(...this.seller.stats().revenueByMonth.map((m) => m.amount), 1),
  );

  readonly topCategoryMax = computed(() =>
    Math.max(...this.seller.stats().topCategories.map((c) => c.sales), 1),
  );

  // store-readiness-score v1 §4: `SellerStats.storeReadiness` is typed optional (see
  // `core/models/index.ts` for why) — always fall back to `DEFAULT_STORE_READINESS` rather than
  // let the template deal with `undefined`.
  readonly storeReadiness = computed(() => this.seller.stats().storeReadiness ?? DEFAULT_STORE_READINESS);

  // ===== real-data-stats v1 §4.6: platform fee % (was hardcoded 90%/10% in 3 spots) =====
  // Fallback 10 only while stats() hasn't loaded yet, to avoid a flash to a wrong number — the
  // moment it resolves, this recomputes with the real value (computed signal).
  readonly feeRatePercent = computed(() => this.platformStats.stats()?.feeRatePercent ?? 10);
  readonly sellerSharePercent = computed(() => 100 - this.feeRatePercent());

  // ===== real-data-stats v1 §4.6: trend badges =====
  readonly revenueTrendDisplay = computed(() => {
    const v = this.seller.stats().revenueTrendPercent;
    if (v == null) return null;
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  });
  readonly ratingTrendDisplay = computed(() => {
    const v = this.seller.stats().ratingTrendDelta;
    if (v == null) return null;
    return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
  });

  // Earnings calculator
  readonly pricePerItem = signal<number>(199);
  readonly salesPerMonth = signal<number>(80);
  readonly activeDocs = signal<number>(20);

  readonly grossRevenue = computed(() => this.pricePerItem() * this.salesPerMonth());
  readonly platformFee = computed(() =>
    Math.round(this.grossRevenue() * (this.feeRatePercent() / 100)),
  );
  readonly monthlyEarnings = computed(() => this.grossRevenue() - this.platformFee());
  readonly yearlyEarnings = computed(() => this.monthlyEarnings() * 12);

  constructor() {
    void this.seller.refreshDashboard();
    // real-data-stats v1 §4.6: "โอนรอบถัดไป" reads `seller.nextPayoutDate()`, sourced from the
    // same earnings endpoint the /seller/earnings page uses (§3.5) — this page needs its own load.
    void this.seller.loadEarnings();
    this.platformStats.loadStats();
  }

  /**
   * QA fix: "ขอถอนเงินทันที" used to have no click handler at all — enabled at ฿0 balance,
   * clicking it did nothing observable. The real request flow (bank account form, pending-request
   * guard) already lives on /seller/earnings; this is a shortcut into it, gated by balance.
   */
  requestWithdraw(): void {
    if (this.seller.stats().pendingPayout <= 0) {
      this.message.warning('ยังไม่มียอดเงินให้ถอนในตอนนี้');
      return;
    }
    void this.router.navigate(['/seller/earnings']);
  }
}

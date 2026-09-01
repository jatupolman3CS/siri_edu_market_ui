import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PlatformStatsService, SellerService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-seller-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    StatCardComponent,
    IconComponent,
    ThbPipe,
    CompactPipe,
    DatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class SellerDashboardPage {
  readonly seller = inject(SellerService);
  readonly platformStats = inject(PlatformStatsService);

  readonly maxMonth = computed(() =>
    Math.max(...this.seller.stats().revenueByMonth.map((m) => m.amount), 1),
  );

  readonly topCategoryMax = computed(() =>
    Math.max(...this.seller.stats().topCategories.map((c) => c.sales), 1),
  );

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
}

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
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { DEFAULT_STORE_READINESS, type DocumentItem } from '../../../core/models';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RowMoreComponent } from '../../../shared/components/row-more/row-more.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { StoreReadinessBarComponent } from '../../../shared/components/store-readiness-bar/store-readiness-bar.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';
import { FeedbackModalComponent } from '../../../shared/components/feedback-modal/feedback-modal.component';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * responsive-ui v1.6.1 GR3-d (§3, §4.6 E): the "เอกสารล่าสุด" card's one call — page 1 of
 * `GET /api/seller/documents`, 5 rows, no status or search (the API orders by last update,
 * newest first). The retry button repeats exactly this.
 */
const RECENT_DOCS_QUERY = { page: 1, pageSize: 5 } as const;

@Component({
  selector: 'app-seller-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    StatCardComponent,
    EmptyStateComponent,
    RowMoreComponent,
    IconComponent,
    StoreReadinessBarComponent,
    ThbPipe,
    CompactPipe,
    DatePipe,
    ImgFallbackDirective,
    TableViewportDirective,
    FeedbackModalComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class SellerDashboardPage {
  readonly seller = inject(SellerService);
  readonly platformStats = inject(PlatformStatsService);
  readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);
  readonly feedbackModalOpen = signal(false);

  openFeedbackModal(): void {
    this.feedbackModalOpen.set(true);
  }

  /**
   * responsive-ui v1.4 R-17 (G-27, F88): everything between the header and the earnings calculator
   * comes from `GET /api/seller/dashboard`. `stats()` starts zeroed, so before the first answer
   * those sections used to render as a store with no sales (five "ยังไม่มี…" empty states), and a
   * failure looked the same with nothing to retry. Loaded data wins over a background refresh.
   */
  readonly dashboardView = computed<'loading' | 'error' | 'data'>(() => {
    if (this.seller.dashboardLoaded()) return 'data';
    return this.seller.dashboardState().status === 'error' ? 'error' : 'loading';
  });

  retryDashboard(): void {
    void this.seller.refreshDashboard();
  }

  /**
   * responsive-ui v1.6.1 GR3-d (§4.6 E): the "เอกสารล่าสุด" card loads itself. It used to read
   * `SellerService.myDocuments()`, which this page never loads, so a seller with documents saw
   * "ยังไม่มีเอกสาร" on a fresh visit. `recentDocs` holds at most 5 rows, newest update first;
   * 'data' with no rows is the empty state (`totalCount` 0). Loading and error never show it.
   */
  readonly recentDocs = signal<DocumentItem[]>([]);
  readonly recentDocsView = signal<'loading' | 'error' | 'data'>('loading');

  retryRecentDocs(): void {
    void this.loadRecentDocs();
  }

  private async loadRecentDocs(): Promise<void> {
    this.recentDocsView.set('loading');
    try {
      const res = await this.seller.listDocumentsPaged({ ...RECENT_DOCS_QUERY });
      if (res.failed) {
        this.recentDocsView.set('error');
        return;
      }
      this.recentDocs.set((res.items ?? []).slice(0, RECENT_DOCS_QUERY.pageSize));
      this.recentDocsView.set('data');
    } catch {
      this.recentDocsView.set('error');
    }
  }

  /** GR3-d: each pill shows its document's own status, with the labels of /seller/documents. */
  statusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return this.translation.t('seller.statusApproved');
      case 'pending':
        return this.translation.t('seller.statusPending');
      case 'rejected':
        return this.translation.t('seller.statusRejected');
      case 'draft':
        return this.translation.t('seller.statusDraft');
      default:
        return status || '—';
    }
  }

  /** GR3-d: the pill classes of /seller/documents. */
  statusPillClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return 'pill-green';
      case 'pending':
        return 'pill-amber';
      case 'rejected':
        return 'pill-rose';
      default:
        return 'pill-soft';
    }
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
    this.catalog.ensureCategories();
    void this.seller.refreshDashboard();
    // responsive-ui v1.6.1 GR3-d (§3): the recent documents card, once per page load.
    void this.loadRecentDocs();
    // real-data-stats v1 §4.6: "โอนรอบถัดไป" reads `seller.nextPayoutDate()`, sourced from the
    // same earnings endpoint the /seller/earnings page uses (§3.5) — this page needs its own load.
    void this.seller.loadEarnings();
    this.platformStats.loadStats();
  }

  categoryDisplayName(category: string): string {
    return this.catalog.getCategoryById(category)?.name ?? category;
  }

  /**
   * QA fix: "ขอถอนเงินทันที" used to have no click handler at all — enabled at ฿0 balance,
   * clicking it did nothing observable. The real request flow (bank account form, pending-request
   * guard) already lives on /seller/earnings; this is a shortcut into it, gated by balance.
   */
  requestWithdraw(): void {
    if (this.seller.stats().pendingPayout <= 0) {
      this.message.warning(this.translation.t('seller.noWithdrawBalance'));
      return;
    }
    void this.router.navigate(['/seller/earnings']);
  }
}

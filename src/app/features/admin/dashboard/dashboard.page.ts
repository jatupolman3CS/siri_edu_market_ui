import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { RowMoreComponent } from '../../../shared/components/row-more/row-more.component';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

const STATUS_LABEL_KEYS: Readonly<Record<string, string>> = {
  fulfilled: 'admin.transactions.statusLabelFulfilled',
  paid: 'admin.transactions.statusLabelPaid',
  awaiting_payment: 'admin.transactions.statusLabelAwaiting',
  refunded: 'admin.transactions.statusLabelRefunded',
  cancelled: 'admin.transactions.statusLabelCancelled',
};

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    TranslatePipe,
    RouterLink,
    StatCardComponent,
    ThbPipe,
    TimeAgoPipe,
    ImgFallbackDirective,
    RowMoreComponent,
    TableViewportDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class AdminDashboardPage {
  readonly translation = inject(TranslationService);
  readonly admin = inject(AdminService);

  /** Service status from the API (Database / Storage / API). Falls back to a single "API: ok" line. */
  readonly services = computed(() => {
    const items = this.admin.dashboard()?.serviceStatus ?? [];
    if (items.length > 0) return items;
    return [{ name: 'API', status: 'ok', message: undefined as string | undefined }];
  });

  // ===== real-data-stats v1 §3.6/§4.7: trend badges (GMV/fees/refunds) =====
  // Successful transactions intentionally get no trend badge — no field exists for it (§4.7).
  private formatTrendPercent(v: number | null): string | null {
    if (v == null) return null;
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  }
  readonly revenueTrendDisplay = computed(() =>
    this.formatTrendPercent(this.admin.dashboardTrends().revenueTrendPercent),
  );
  readonly feesTrendDisplay = computed(() =>
    this.formatTrendPercent(this.admin.dashboardTrends().feesTrendPercent),
  );
  readonly refundTrendDisplay = computed(() =>
    this.formatTrendPercent(this.admin.dashboardTrends().refundTrendPercent),
  );

  /**
   * responsive-ui v1.4 R-17 (G-27, F88): the stat cards and the system-health card come from
   * `GET /api/admin/dashboard`. Loaded data wins (a background refresh keeps it on screen); before
   * the first answer they are skeletons, and a failure shows a message with a retry — never zeroed
   * stats or an "API: ok" line that nothing confirmed.
   */
  readonly dashboardView = computed<'loading' | 'error' | 'data'>(() => {
    if (this.admin.dashboard() !== null) return 'data';
    const status = this.admin.dashboardState().status;
    if (status === 'error') return 'error';
    return status === 'success' ? 'data' : 'loading';
  });

  retryDashboard(): void {
    void this.admin.refreshDashboard();
  }

  /** Pending-approval count in the card subtitle: the server total when known (F87), else the loaded rows. */
  readonly pendingCount = computed(
    () => this.admin.pendingBadgeCount() ?? this.admin.pendingDocuments().length,
  );

  constructor() {
    void this.admin.refreshDashboard();
    void this.admin.refreshTransactions();
    void this.admin.refreshPendingDocuments();
  }

  badgeClass(s: string): string {
    return {
      fulfilled: 'bg-emerald-100 text-emerald-700',
      paid: 'bg-blue-100 text-blue-700',
      awaiting_payment: 'bg-amber-100 text-amber-700',
      refunded: 'bg-rose-100 text-rose-700',
      cancelled: 'bg-gray-100 text-gray-600',
    }[s] ?? 'bg-pink-100 text-pink-700';
  }

  /**
   * F20: translated status text. The old map pointed at `admin.txStatus*` keys that exist in
   * neither translation file, so the raw key path reached the pill. It reuses the transactions
   * page's `admin.transactions.statusLabel*` keys; an unknown status shows as-is.
   */
  statusLabel(s: string): string {
    const key = STATUS_LABEL_KEYS[s];
    return key ? this.translation.t(key) : s;
  }
}

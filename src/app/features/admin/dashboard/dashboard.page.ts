import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    RouterLink,
    StatCardComponent,
    ThbPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class AdminDashboardPage {
  readonly admin = inject(AdminService);

  /** Service status from the API (Database / Storage / API). Falls back to a single "API: ok" line. */
  readonly services = computed(() => {
    const items = this.admin.dashboard()?.serviceStatus ?? [];
    if (items.length > 0) return items;
    return [{ name: 'API', status: 'ok', message: undefined as string | undefined }];
  });

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

  statusLabel(s: string): string {
    return {
      fulfilled: 'สำเร็จ',
      paid: 'ชำระแล้ว',
      awaiting_payment: 'รอชำระ',
      refunded: 'คืนเงิน',
      cancelled: 'ยกเลิก',
    }[s] ?? s;
  }
}

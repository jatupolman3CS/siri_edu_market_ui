import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  SubscriptionService,
  type AdminSubscriptionStatusFilter,
} from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import type { AdminSubscriptionListItem, SubscriptionStatus } from '../../../core/models';

/**
 * subscription-membership v2 §1 AC-24 / §3.2 / §4: "/admin/subscriptions" — read-only paginated
 * table from `GET /api/admin/subscriptions`. Same page/pageSize signals + `reload()` pattern
 * `AdminPayoutsPage` already uses.
 */
@Component({
  selector: 'app-admin-subscriptions',
  standalone: true,
  imports: [DatePipe, ThbPipe, EmptyStateComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subscriptions-admin.page.html',
})
export class AdminSubscriptionsPage {
  private readonly subscriptionService = inject(SubscriptionService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  readonly items = signal<AdminSubscriptionListItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly filter = signal<AdminSubscriptionStatusFilter>('all');

  readonly filters: { value: AdminSubscriptionStatusFilter; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'active', label: 'ใช้งานอยู่' },
    { value: 'incomplete', label: 'รอชำระเงิน' },
    { value: 'past_due', label: 'ค้างชำระ' },
    { value: 'canceled', label: 'ยกเลิกแล้ว' },
  ];

  constructor() {
    void this.reload();
  }

  setFilter(next: AdminSubscriptionStatusFilter): void {
    this.filter.set(next);
    this.page.set(1);
    void this.reload();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.subscriptionService.listAdmin(
        this.filter(),
        this.page(),
        this.pageSize(),
      );
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายการสมาชิกทั้งหมด', e);
      this.items.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  statusLabel(status: SubscriptionStatus): string {
    switch (status) {
      case 'active':
        return 'ใช้งานอยู่';
      case 'incomplete':
        return 'รอชำระเงิน';
      case 'past_due':
        return 'ค้างชำระ';
      case 'canceled':
        return 'ยกเลิกแล้ว';
      default:
        return status;
    }
  }

  statusClass(status: SubscriptionStatus): string {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700';
      case 'incomplete':
        return 'bg-sky-50 text-sky-700';
      case 'past_due':
        return 'bg-amber-50 text-amber-700';
      case 'canceled':
        return 'bg-rose-50 text-rose-700';
      default:
        return 'bg-pink-50 text-pink-700';
    }
  }
}

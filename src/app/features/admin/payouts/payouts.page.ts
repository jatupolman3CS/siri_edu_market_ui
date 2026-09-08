import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { AdminPayoutResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

type PayoutFilter = 'pending' | 'processing' | 'paid' | 'failed' | 'all';

/**
 * GAP-02: admin queue for paying sellers. PAYOUT had no API at all, so money could come
 * into the platform but never go out.
 */
@Component({
  selector: 'app-admin-payouts',
  standalone: true,
  imports: [CommonModule, DatePipe, ThbPipe, EmptyStateComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './payouts.page.html',
})
export class AdminPayoutsPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  readonly items = signal<AdminPayoutResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly filter = signal<PayoutFilter>('pending');
  readonly busyId = signal<string | null>(null);

  readonly filters: { value: PayoutFilter; label: string }[] = [
    { value: 'pending', label: 'รอดำเนินการ' },
    { value: 'processing', label: 'กำลังโอน' },
    { value: 'paid', label: 'โอนแล้ว' },
    { value: 'failed', label: 'ไม่สำเร็จ' },
    { value: 'all', label: 'ทั้งหมด' },
  ];

  constructor() {
    void this.reload();
  }

  setFilter(next: PayoutFilter): void {
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
      const status = this.filter();
      const res = await this.admin.listPayoutsPaged(
        status === 'all' ? undefined : status,
        this.page(),
        this.pageSize(),
      );
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายการถอนเงิน', e);
      this.items.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  async setStatus(payoutId: string, status: 'processing' | 'paid' | 'failed'): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(payoutId);
    try {
      await this.admin.setPayoutStatus(payoutId, status);
      this.message.success('อัปเดตสถานะเรียบร้อย');
      await this.reload();
    } catch (e) {
      this.apiFail.report('อัปเดตสถานะการถอนเงิน', e);
    } finally {
      this.busyId.set(null);
    }
  }

  statusLabel(status: string | undefined): string {
    switch (status) {
      case 'paid':
        return 'โอนแล้ว';
      case 'processing':
        return 'กำลังโอน';
      case 'failed':
        return 'ไม่สำเร็จ';
      default:
        return 'รอดำเนินการ';
    }
  }

  statusClass(status: string | undefined): string {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700';
      case 'processing':
        return 'bg-sky-50 text-sky-700';
      case 'failed':
        return 'bg-rose-50 text-rose-700';
      default:
        return 'bg-amber-50 text-amber-700';
    }
  }
}

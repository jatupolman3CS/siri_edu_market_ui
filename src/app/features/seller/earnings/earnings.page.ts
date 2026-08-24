import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerService } from '../../../core/services';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

@Component({
  selector: 'app-seller-earnings',
  standalone: true,
  imports: [StatCardComponent, IconComponent, ThbPipe, CommonModule, DatePipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './earnings.page.html',
  styleUrl: './earnings.page.scss',
})
export class SellerEarningsPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);

  /** GAP-02: figures now come from the earnings endpoint rather than dashboard stats. */
  readonly totalEarnings = computed(() => this.seller.earnings()?.totalEarnings ?? 0);
  readonly pendingBalance = computed(() => this.seller.earnings()?.pendingBalance ?? 0);

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

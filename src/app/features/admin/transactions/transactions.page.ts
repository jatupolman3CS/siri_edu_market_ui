import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-admin-transactions',
  standalone: true,
  imports: [FormsModule, StatCardComponent, IconComponent, ThbPipe, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transactions.page.html',
  styleUrl: './transactions.page.scss',
})
export class AdminTransactionsPage {
  readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  /** F-11: the order currently being refunded, so only one button spins. */
  readonly refundingId = signal<string | null>(null);

  /** F-11: awaiting confirmation. A refund revokes library access and cannot be undone. */
  readonly confirmingId = signal<string | null>(null);

  readonly search = signal<string>('');
  readonly status = signal<'all' | 'fulfilled' | 'paid' | 'refunded' | 'awaiting_payment'>('all');

  readonly statuses = [
    { value: 'all' as const, label: 'ทั้งหมด' },
    { value: 'fulfilled' as const, label: 'สำเร็จ' },
    { value: 'paid' as const, label: 'ชำระแล้ว' },
    { value: 'awaiting_payment' as const, label: 'รอชำระ' },
    { value: 'refunded' as const, label: 'คืนเงิน' },
  ];

  readonly filtered = computed(() => {
    let list = this.admin.transactions();
    if (this.status() !== 'all') {
      list = list.filter((t) => t.status === this.status());
    }
    if (this.search().trim()) {
      const q = this.search().toLowerCase();
      list = list.filter(
        (t) =>
          t.orderNumber.toLowerCase().includes(q) ||
          t.buyerName.toLowerCase().includes(q) ||
          t.documentTitle.toLowerCase().includes(q),
      );
    }
    return list;
  });

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

  payLabel(p: string): string {
    return {
      promptpay: 'PromptPay',
      credit_card: 'บัตรเครดิต',
      truemoney: 'TrueMoney',
    }[p] ?? p;
  }

  constructor() {
    void this.admin.refreshTransactions();
  }

  /** Only settled money can be given back — the server enforces this too. */
  canRefund(status: string | undefined): boolean {
    return status === 'paid' || status === 'fulfilled';
  }

  askToRefund(id: string | undefined): void {
    if (!id) return;
    this.confirmingId.set(id);
  }

  cancelRefund(): void {
    this.confirmingId.set(null);
  }

  async refund(id: string | undefined): Promise<void> {
    if (!id || this.refundingId()) return;

    this.refundingId.set(id);
    try {
      await this.admin.refundOrder(id);
      this.confirmingId.set(null);
      this.message.success('คืนเงินเรียบร้อย และเพิกถอนสิทธิ์ในคลังของผู้ซื้อแล้ว');
    } catch (e) {
      // The server's message names the actual reason — already refunded, never paid, or the
      // seller has already drawn this money — and that is what the admin needs to read.
      this.apiFail.report('คืนเงิน', e);
    } finally {
      this.refundingId.set(null);
    }
  }
}

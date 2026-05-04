import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminService } from '../../../core/services';
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
}

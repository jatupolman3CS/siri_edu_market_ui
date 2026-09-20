import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminService } from '../../../core/services';
import type { AdminTransaction } from '../../../core/models';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

@Component({
  selector: 'app-admin-transactions',
  standalone: true,
  imports: [
    FormsModule,
    StatCardComponent,
    IconComponent,
    PaginationComponent,
    ThbPipe,
    TimeAgoPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transactions.page.html',
  styleUrl: './transactions.page.scss',
})
export class AdminTransactionsPage {
  readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly i18n = inject(TranslationService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly items = signal<AdminTransaction[]>([]);
  readonly loading = signal(false);

  /** F-11: the order currently being refunded, so only one button spins. */
  readonly refundingId = signal<string | null>(null);

  /** F-11: awaiting confirmation. A refund revokes library access and cannot be undone. */
  readonly confirmingId = signal<string | null>(null);

  readonly search = signal<string>('');
  readonly status = signal<'all' | 'fulfilled' | 'paid' | 'refunded' | 'awaiting_payment'>('all');

  readonly statuses = [
    { value: 'all' as const, key: 'admin.transactions.statusAll' },
    { value: 'fulfilled' as const, key: 'admin.transactions.statusFulfilled' },
    { value: 'paid' as const, key: 'admin.transactions.statusPaid' },
    { value: 'awaiting_payment' as const, key: 'admin.transactions.statusAwaiting' },
    { value: 'refunded' as const, key: 'admin.transactions.statusRefunded' },
  ];

  constructor() {
    void this.admin.refreshDashboard();
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.admin.listTransactionsPaged(this.page(), this.pageSize());
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } finally {
      this.loading.set(false);
    }
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
    const keyMap: Record<string, string> = {
      fulfilled: 'admin.transactions.statusLabelFulfilled',
      paid: 'admin.transactions.statusLabelPaid',
      awaiting_payment: 'admin.transactions.statusLabelAwaiting',
      refunded: 'admin.transactions.statusLabelRefunded',
      cancelled: 'admin.transactions.statusLabelCancelled',
    };
    return keyMap[s] ? this.i18n.t(keyMap[s]) : s;
  }

  payLabel(p: string): string {
    if (p === 'credit_card') return this.i18n.t('admin.transactions.payLabelCreditCard');
    return { promptpay: 'PromptPay', truemoney: 'TrueMoney' }[p] ?? p;
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
      this.message.success(this.i18n.t('admin.transactions.refundSuccess'));
    } catch (e) {
      // The server's message names the actual reason — already refunded, never paid, or the
      // seller has already drawn this money — and that is what the admin needs to read.
      this.apiFail.report(this.i18n.t('admin.errRefund'), e);
    } finally {
      this.refundingId.set(null);
    }
  }
}

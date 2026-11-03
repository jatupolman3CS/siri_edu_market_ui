import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminService, type AdminTransactionsFilters } from '../../../core/services';
import type { AdminTransaction } from '../../../core/models';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { RowMoreComponent } from '../../../shared/components/row-more/row-more.component';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

type TransactionStatusFilter = 'all' | 'fulfilled' | 'paid' | 'refunded' | 'awaiting_payment';

/** wave-l0-hardening v1 AC-Q6-8: typing waits this long before the list reloads. */
export const TRANSACTION_SEARCH_DEBOUNCE_MS = 300;

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
    RowMoreComponent,
    TableViewportDirective,
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

  /** What is in the search box right now (updates on every keystroke). */
  readonly search = signal<string>('');
  /** The trimmed search the list was last loaded with — changes only after the debounce settles. */
  readonly appliedSearch = signal<string>('');
  readonly status = signal<TransactionStatusFilter>('all');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Only the newest reload may write the table — a slow earlier response must not overwrite it. */
  private reloadSeq = 0;

  readonly statuses = [
    { value: 'all' as const, key: 'admin.transactions.statusAll' },
    { value: 'fulfilled' as const, key: 'admin.transactions.statusFulfilled' },
    { value: 'paid' as const, key: 'admin.transactions.statusPaid' },
    { value: 'awaiting_payment' as const, key: 'admin.transactions.statusAwaiting' },
    { value: 'refunded' as const, key: 'admin.transactions.statusRefunded' },
  ];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.clearSearchTimer());
    void this.admin.refreshDashboard();
    void this.reload();
  }

  /** wave-l0-hardening §4.3: the filters the server is asked for. "ทั้งหมด" / blank = not sent. */
  currentFilters(): AdminTransactionsFilters {
    const filters: AdminTransactionsFilters = {};
    const q = this.appliedSearch();
    if (q) filters.q = q;
    const status = this.status();
    if (status !== 'all') filters.status = [status];
    return filters;
  }

  async reload(): Promise<void> {
    const seq = ++this.reloadSeq;
    this.loading.set(true);
    try {
      const res = await this.admin.listTransactionsPaged(this.page(), this.pageSize(), this.currentFilters());
      if (seq !== this.reloadSeq) return;
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } finally {
      if (seq === this.reloadSeq) this.loading.set(false);
    }
  }

  /** AC-Q6-8: debounce 300 ms, then back to page 1 with the new search. */
  onSearchChange(value: string): void {
    this.search.set(value);
    this.clearSearchTimer();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      const q = this.search().trim();
      if (q === this.appliedSearch()) return;
      this.appliedSearch.set(q);
      this.page.set(1);
      void this.reload();
    }, TRANSACTION_SEARCH_DEBOUNCE_MS);
  }

  /** AC-Q6-8: a chip reloads immediately from page 1 (and takes any half-typed search with it). */
  onStatusChange(value: TransactionStatusFilter): void {
    const q = this.search().trim();
    if (value === this.status() && q === this.appliedSearch()) return;
    this.clearSearchTimer();
    this.status.set(value);
    this.appliedSearch.set(q);
    this.page.set(1);
    void this.reload();
  }

  private clearSearchTimer(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
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
    }[s] ?? 'bg-brand-100 text-brand-700';
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

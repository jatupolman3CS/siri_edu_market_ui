import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, LibraryService, OrderService, WalletService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { OrderTabFilter } from '../../../core/services/library.service';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

/**
 * order-status-tabs v1 §4: order of the tabs on screen, matching the Thai copy table exactly.
 * Index into this array is the index of the chip in the tab row (responsive-ui v1 U5-3).
 */
const TAB_ORDER: readonly OrderTabFilter[] = [
  'all',
  'awaiting_payment',
  'successful',
  'cancelled_refunded',
];

@Component({
  selector: 'app-buyer-orders',
  standalone: true,
  imports: [
    RouterLink,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    ThbPipe,
    TimeAgoPipe,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.scss',
})
export class BuyerOrdersPage {
  readonly library = inject(LibraryService);
  readonly wallet = inject(WalletService);
  readonly translation = inject(TranslationService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);

  readonly showSuccess = signal<boolean>(false);

  /** Tab chips in on-screen order (label keys unchanged from order-status-tabs v1 §4). */
  readonly tabs: readonly { value: OrderTabFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'orders.tabAll' },
    { value: 'awaiting_payment', labelKey: 'orders.tabAwaitingPayment' },
    { value: 'successful', labelKey: 'orders.tabSuccessful' },
    { value: 'cancelled_refunded', labelKey: 'orders.tabCancelledRefunded' },
  ];

  /** order-status-tabs v1 §4: which tab is highlighted, kept in sync with `library.ordersTab()`. */
  readonly selectedTabIndex = computed(() => {
    const index = TAB_ORDER.indexOf(this.library.ordersTab());
    return index === -1 ? 0 : index;
  });

  /**
   * responsive-ui v1.4 R-17 (F88): four distinct states. "ยังไม่มีคำสั่งซื้อ" is only for a list that
   * really loaded empty — never while the GET is pending, and never after it failed.
   */
  readonly listState = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
    if (this.library.orders().length > 0) return 'data';
    const status = this.library.ordersState().status;
    if (status === 'error') return 'error';
    if (status === 'loading') return 'loading';
    return this.library.ordersLoaded() ? 'empty' : 'loading';
  });

  retryOrders(): void {
    void this.library.refreshOrders();
  }

  /** order-status-tabs v1 §4: guards against firing a second cancel while one is in flight. */
  readonly cancellingId = signal<string | null>(null);
  readonly payingWalletId = signal<string | null>(null);

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/orders' } });
      return;
    }
    void this.library.refreshOrders();
    void this.wallet.refreshSummary();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.showSuccess.set(params.get('success') === '1');
      });
  }

  dismissSuccess(): void {
    this.showSuccess.set(false);
  }

  /**
   * order-status-tabs v1 §4/AC-11: 1 tab switch = 1 `setOrdersTab` call. Only runs on a user
   * click, and clicking the already-selected chip is a no-op (same semantics nz-tabs had:
   * no fetch on initial render, none when the selected index does not change).
   */
  selectTab(index: number): void {
    if (index === this.selectedTabIndex()) return;
    const tab = TAB_ORDER[index];
    if (!tab) return;
    void this.library.setOrdersTab(tab);
  }

  /**
   * order-status-tabs v1 §4/AC-12..AC-15: mirrors `BuyerOrderDetailPage.cancelOrder` — cancel
   * via `OrderService.cancel` (not `LibraryService`, cancel is not its job), then refresh the
   * current tab's page 1 on success so the card updates/disappears per AC-14. `OrderService`
   * already reports failures through `ApiFailureReporter` and returns `null`, so there is
   * nothing else to do on the error path here.
   */
  async cancelOrder(id: string): Promise<void> {
    if (this.cancellingId() !== null) return;
    this.cancellingId.set(id);
    try {
      const result = await this.orderService.cancel(id);
      if (result !== null) {
        await this.library.refreshOrders();
      }
    } finally {
      this.cancellingId.set(null);
    }
  }

  async payWithWallet(orderId: string): Promise<void> {
    if (this.payingWalletId() !== null) return;
    this.payingWalletId.set(orderId);
    try {
      const updated = await this.orderService.payWithWallet(orderId);
      if (updated && (updated.status === 'paid' || updated.status === 'fulfilled')) {
        this.message.success(this.translation.t('orders.walletPaidSuccess'));
        await this.wallet.refreshSummary();
        await this.library.refreshOrders();
      }
    } finally {
      this.payingWalletId.set(null);
    }
  }

  statusLabel(s: string): string {
    const keyMap: Record<string, string> = {
      awaiting_payment: 'orders.statusAwaitingPayment',
      paid: 'orders.statusPaid',
      fulfilled: 'orders.statusFulfilled',
      refunded: 'orders.statusRefunded',
      cancelled: 'orders.statusCancelled',
    };
    return keyMap[s] ? this.translation.t(keyMap[s] as any) : s;
  }

  statusClass(s: string): string {
    return {
      awaiting_payment: 'bg-amber-100 text-amber-700',
      paid: 'bg-blue-100 text-blue-700',
      fulfilled: 'bg-emerald-100 text-emerald-700',
      refunded: 'bg-rose-100 text-rose-700',
      cancelled: 'bg-gray-100 text-gray-600',
    }[s] ?? 'bg-pink-100 text-pink-700';
  }

  paymentLabel(p: string): string {
    const keyMap: Record<string, string> = {
      promptpay: 'orders.methodPromptpay',
      credit_card: 'orders.methodCreditCard',
      truemoney: 'orders.methodTrueMoney',
      unknown: 'orders.methodUnknown',
      other: 'orders.methodOther',
    };
    return keyMap[p] ? this.translation.t(keyMap[p] as any) : p;
  }
}

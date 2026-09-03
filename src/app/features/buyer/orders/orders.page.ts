import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzTabChangeEvent, NzTabsModule } from 'ng-zorro-antd/tabs';
import { AuthService, LibraryService, OrderService } from '../../../core/services';
import type { OrderTabFilter } from '../../../core/services/library.service';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

/**
 * order-status-tabs v1 §4: order of the tabs on screen, matching the Thai copy table exactly.
 * Index into this array is what `nz-tabs` reports on `(nzSelectChange)`.
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
    NzTabsModule,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    ThbPipe,
    TimeAgoPipe,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './orders.page.html',
  styleUrl: './orders.page.scss',
})
export class BuyerOrdersPage {
  readonly library = inject(LibraryService);
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly showSuccess = signal<boolean>(false);

  /** order-status-tabs v1 §4: which tab is highlighted, kept in sync with `library.ordersTab()`. */
  readonly selectedTabIndex = computed(() => {
    const index = TAB_ORDER.indexOf(this.library.ordersTab());
    return index === -1 ? 0 : index;
  });

  /** order-status-tabs v1 §4: guards against firing a second cancel while one is in flight. */
  readonly cancellingId = signal<string | null>(null);

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/orders' } });
      return;
    }
    void this.library.refreshOrders();
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
   * order-status-tabs v1 §4/AC-11: 1 tab switch = 1 `setOrdersTab` call. `nz-tabs` does not fire
   * `nzSelectChange` on the initial render (only on an actual change of the selected index), so
   * this never runs before the user interacts with the tab strip.
   */
  onTabChange(event: NzTabChangeEvent): void {
    if (event.index == null) return;
    const tab = TAB_ORDER[event.index];
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

  statusLabel(s: string): string {
    return {
      awaiting_payment: 'รอชำระเงิน',
      paid: 'ชำระแล้ว',
      fulfilled: 'สำเร็จ',
      refunded: 'คืนเงินแล้ว',
      cancelled: 'ยกเลิก',
    }[s] ?? s;
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
    return {
      promptpay: 'PromptPay',
      credit_card: 'บัตรเครดิต',
      truemoney: 'TrueMoney',
    }[p] ?? p;
  }
}

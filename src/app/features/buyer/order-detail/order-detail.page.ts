import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, OrderService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-buyer-order-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    DocumentCardComponent,
    ImgFallbackDirective,
    ThbPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './order-detail.page.html',
  styleUrl: './order-detail.page.scss',
})
export class BuyerOrderDetailPage {
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly order = this.orderService.detail;
  // order-similar-documents v1 §4: "เอกสารที่คล้ายกับคำสั่งซื้อนี้" — hidden entirely when empty
  // or errored (§1.6), never rendered for anything but paid/fulfilled orders (§4 AC-16).
  readonly similar = this.orderService.similar;
  readonly similarState = this.orderService.similarState;

  /** Guards `loadSimilar()` to a single call per order (§4: "เรียก loadSimilar() ครั้งเดียว"). */
  private similarRequested = false;

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.orderService.loadDetail(id).finally(() => this.loading.set(false));
    } else {
      this.loading.set(false);
    }

    effect((onCleanup) => {
      const o = this.order();
      if (!o?.id || o.status !== 'awaiting_payment') {
        return;
      }
      const orderId = o.id;
      const handle = window.setInterval(() => {
        void this.orderService.loadDetail(orderId);
      }, 3000);
      onCleanup(() => window.clearInterval(handle));
    });

    // order-similar-documents v1 §4: load once the order is paid/fulfilled — never for
    // awaiting_payment/cancelled/refunded, and never repeated by the polling loop above.
    effect(() => {
      const o = this.order();
      if (!o?.id || (o.status !== 'paid' && o.status !== 'fulfilled')) return;
      if (this.similarRequested) return;
      this.similarRequested = true;
      void this.orderService.loadSimilar(o.id);
    });
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
      // S-04: an order carries no method until Stripe reports one at the webhook, so this is
      // what an unpaid order shows rather than a method the buyer never chose.
      unknown: 'ยังไม่ระบุ',
      promptpay: 'PromptPay',
      credit_card: 'บัตรเครดิต',
      other: 'ช่องทางอื่น',
      // Historical: orders paid before the Stripe migration.
      truemoney: 'TrueMoney',
    }[p] ?? p;
  }

  readonly refreshing = signal(false);

  /**
   * S-04: the page already polls while an order is unpaid, but a buyer staring at a screen
   * needs something to press. This is that button — the same read, on demand.
   */
  async refreshStatus(id: string): Promise<void> {
    if (this.refreshing()) return;
    this.refreshing.set(true);
    try {
      await this.orderService.loadDetail(id);
    } finally {
      this.refreshing.set(false);
    }
  }

  readonly cancelling = signal(false);

  async cancelOrder(id: string): Promise<void> {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    try {
      await this.orderService.cancel(id);
    } finally {
      this.cancelling.set(false);
    }
  }

  printReceipt(): void {
    window.print();
  }
}

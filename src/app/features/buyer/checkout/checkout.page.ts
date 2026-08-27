import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService, CartService, OrderService } from '../../../core/services';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { loadStripeScript } from '../../../core/util/load-stripe-script';

/**
 * S-04: checkout in two moves. First it creates the order, which opens a Stripe PaymentIntent
 * and returns a client secret; then Stripe's Payment Element collects the payment and confirms
 * it. This page never sees a card number — that is the point of the migration, and why the card
 * form that used to live here is gone rather than restyled.
 *
 * Nothing here concludes that an order is paid. `payment_intent.succeeded` at the webhook does,
 * which is why the buyer lands on the order page in a "confirming" state rather than a
 * "success" one.
 */
@Component({
  selector: 'app-buyer-checkout',
  standalone: true,
  imports: [RouterLink, ThbPipe, IconComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class BuyerCheckoutPage {
  readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly orders = inject(OrderService);
  private readonly message = inject(NzMessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  readonly checkoutState = this.orders.checkoutState;

  /** The payment box is only on screen once an order exists to pay for. */
  readonly paymentReady = signal(false);

  /** True while a network call is in flight, so neither button can be double-clicked. */
  readonly busy = signal(false);

  /**
   * T-13: the payment may already carry the buyer's money and the order did not complete. The
   * buttons stay down from here — a second attempt is a second payment, and only an operator can
   * settle the first one.
   */
  readonly paymentUnderReview = signal(false);

  private stripe: ReturnType<NonNullable<Window['Stripe']>> | null = null;
  private elements: ReturnType<NonNullable<typeof this.stripe>['elements']> | null = null;
  private orderId: string | null = null;

  /**
   * Step one: turn the cart into an order and open a payment for it. Everything the buyer needs
   * to choose — card, PromptPay, a wallet — is decided inside the Payment Element afterwards,
   * from whatever is enabled in the Stripe Dashboard.
   */
  async startPayment(): Promise<void> {
    if (this.busy() || this.paymentUnderReview()) return;

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/checkout' } });
      return;
    }

    this.busy.set(true);
    try {
      const outcome = await this.orders.create({});
      this.cdr.markForCheck();

      if (!outcome.ok) {
        this.handleFailedCheckout(outcome);
        return;
      }

      const order = outcome.order;
      if (!order.id?.trim()) {
        this.message.error('สร้างคำสั่งซื้อแล้วแต่ไม่ได้รับรหัสออเดอร์ — โปรดตรวจที่ประวัติคำสั่งซื้อ');
        this.orders.resetCheckout();
        return;
      }

      // BUG-02: a zero-total order is fulfilled server-side without a gateway, so there is
      // nothing for Stripe to collect.
      if (order.status === 'paid') {
        this.cart.clear();
        await this.ngZone.run(() =>
          this.router.navigateByUrl(this.router.createUrlTree(['/orders'], { queryParams: { success: 1 } })),
        );
        return;
      }

      const clientSecret = order.paymentHints?.clientSecret;
      if (!clientSecret) {
        this.message.error('เปิดการชำระเงินไม่สำเร็จ — โปรดดูคำสั่งซื้อในประวัติแล้วลองอีกครั้ง');
        this.orders.resetCheckout();
        return;
      }

      this.orderId = order.id;
      await this.mountPaymentElement(clientSecret);
      this.paymentReady.set(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'เปิดการชำระเงินไม่สำเร็จ';
      this.orders.resetCheckout();
      this.message.error(msg);
    } finally {
      this.busy.set(false);
      this.cdr.markForCheck();
    }
  }

  /**
   * Step two: hand the payment to Stripe. A successful confirmation usually redirects the
   * browser to `return_url`; when it does not (a card that needs no extra step), we navigate
   * there ourselves so both routes end on the same page.
   */
  async confirmPayment(): Promise<void> {
    if (this.busy() || this.paymentUnderReview()) return;
    if (!this.stripe || !this.elements || !this.orderId) {
      this.message.warning('กรุณากด «ดำเนินการชำระเงิน» ก่อน');
      return;
    }

    this.busy.set(true);
    try {
      const result = await this.stripe.confirmPayment({
        elements: this.elements,
        confirmParams: { return_url: this.returnUrlFor(this.orderId) },
      });

      // Stripe only returns here when the payment could not be confirmed; anything else has
      // already sent the browser to return_url.
      if (result.error) {
        this.message.error(result.error.message ?? 'ยืนยันการชำระเงินไม่สำเร็จ');
        return;
      }

      await this.ngZone.run(() =>
        this.router.navigateByUrl(
          this.router.createUrlTree(['/orders', this.orderId!], { queryParams: { pay: '1' } }),
        ),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'ยืนยันการชำระเงินไม่สำเร็จ';
      this.message.error(msg);
    } finally {
      this.busy.set(false);
      this.cdr.markForCheck();
    }
  }

  private async mountPaymentElement(clientSecret: string): Promise<void> {
    await loadStripeScript();

    const stripeFactory = window.Stripe;
    if (!stripeFactory) {
      throw new Error('โหลด Stripe.js ไม่สำเร็จ');
    }

    const publishableKey = await this.orders.getStripePublishableKey();
    if (!publishableKey) {
      throw new Error('ยังไม่ตั้งค่า Stripe publishable key ที่เซิร์ฟเวอร์');
    }

    this.stripe = stripeFactory(publishableKey);
    this.elements = this.stripe.elements({ clientSecret });
    this.elements.create('payment').mount('#stripe-payment-element');
  }

  /** Absolute, because Stripe redirects the browser to it from its own domain. */
  private returnUrlFor(orderId: string): string {
    const path = this.router.serializeUrl(
      this.router.createUrlTree(['/orders', orderId], { queryParams: { pay: '1' } }),
    );
    return new URL(path, window.location.origin).toString();
  }

  private handleFailedCheckout(
    outcome: Extract<Awaited<ReturnType<OrderService['create']>>, { ok: false }>,
  ): void {
    // BUG-09: an earlier unpaid order still holds these documents. Send the buyer to their order
    // history to finish paying it or cancel it, instead of a dead-end toast.
    if (outcome.pendingOrder) {
      this.message.warning(outcome.message ?? 'คุณมีคำสั่งซื้อที่ยังไม่ได้ชำระเงินอยู่');
      void this.ngZone.run(() => this.router.navigateByUrl('/orders'));
      return;
    }

    // T-13: the payment may already have gone through and the order did not complete. Stay on
    // this page with the explanation — do not clear the cart, do not offer to pay again. The
    // order row is kept server-side and an operator has already been alerted.
    if (outcome.paymentNeedsReview) {
      this.paymentUnderReview.set(true);
      this.message.error(
        outcome.message ??
          'ชำระเงินสำเร็จแล้ว แต่ระบบยังจับคู่การชำระเงินกับคำสั่งซื้อไม่สำเร็จ ทีมงานกำลังตรวจสอบ กรุณาอย่าชำระเงินซ้ำ',
        { nzDuration: 12000 },
      );
      return;
    }

    if (outcome.alreadyOwned) {
      this.message.warning('มีบางรายการที่คุณเป็นเจ้าของอยู่แล้ว — ไปที่คลังของฉัน');
      void this.ngZone.run(() => this.router.navigateByUrl('/library'));
      return;
    }

    // Toast มาจาก OrderService → ApiFailureReporter แล้ว — เคลียร์ state ปุ่มให้ลองใหม่
    this.orders.resetCheckout();
  }
}

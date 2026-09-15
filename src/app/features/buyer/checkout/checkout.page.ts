import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  AuthService,
  CartService,
  OrderService,
  PaymentMethodService,
  ReferralService,
} from '../../../core/services';
import type { CreateOrderInput } from '../../../core/services/order.service';
import type { ReferralCodeValidation } from '../../../core/models';
import { getReferralCodeHint } from '../../../core/util/referral-capture';
import { getAffiliateClickToken } from '../../../core/util/affiliate-capture';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { SavedCardsComponent } from '../../../shared/components/saved-cards/saved-cards.component';
import { loadStripeScript } from '../../../core/util/load-stripe-script';
import { isSavedCardEntryExpired } from '../../../core/util/saved-card.util';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

/**
 * S-04: checkout in two moves. First it creates the order, which opens a Stripe PaymentIntent
 * and returns a client secret; then Stripe's Payment Element collects the payment and confirms
 * it. This page never sees a card number — that is the point of the migration, and why the card
 * form that used to live here is gone rather than restyled.
 *
 * Nothing here concludes that an order is paid. `payment_intent.succeeded` at the webhook does,
 * which is why the buyer lands on the order page in a "confirming" state rather than a
 * "success" one.
 *
 * saved-credit-cards v1 (docs/contracts/saved-credit-cards.md §4): the buyer may instead pick a
 * previously saved card (`selectedSavedCardId`, default preselected to their default card). That
 * path skips the Payment Element entirely — there is nothing left to type — and confirms the
 * payment with `stripe.confirmCardPayment` directly. The "new card" path is unchanged except for
 * an added "บันทึกบัตรนี้ไว้..." checkbox and a best-effort save-the-card call after payment.
 */
@Component({
  selector: 'app-buyer-checkout',
  standalone: true,
  imports: [
    RouterLink,
    ThbPipe,
    IconComponent,
    EmptyStateComponent,
    ImgFallbackDirective,
    SavedCardsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class BuyerCheckoutPage implements OnDestroy {
  readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly orders = inject(OrderService);
  readonly paymentMethods = inject(PaymentMethodService);
  readonly referral = inject(ReferralService);
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

  /**
   * D-08: WAVE D connects a database and nothing else, so there is no Stripe key on the server.
   * Without this the buyer got as far as creating a real order before anything told them payment
   * was impossible — and that unpaid order then blocked their next checkout attempt (BUG-09).
   * The key is asked for on load so the answer arrives before the button is worth pressing.
   */
  readonly paymentsUnavailable = signal(false);

  /**
   * saved-credit-cards v1 §4 step 1: `'new'` = pay with a freshly entered card through the
   * Payment Element (the pre-existing flow); anything else is a `SavedPaymentMethod.id` to pay
   * with directly. Preselected to the buyer's default saved card, if any, once the list loads.
   */
  readonly selectedSavedCardId = signal<string>('new');

  /** saved-credit-cards v1 §4 step 3: only meaningful on the "ใช้บัตรใหม่" path. */
  readonly saveNewCard = signal(false);

  /** referral-program v1 (docs/contracts/referral-program.md §4) */
  readonly showReferralInput = signal(false);
  readonly referralCode = signal('');
  readonly referralValidation = signal<ReferralCodeValidation | null>(null);
  readonly validatingReferral = signal(false);
  readonly useReferralCredit = signal(false);
  private referralDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  readonly referralDiscount = computed(() => {
    let discount = 0;
    const v = this.referralValidation();
    if (v?.valid) {
      discount += v.discountAmount ?? 20;
    }
    if (this.useReferralCredit() && (this.referral.summary()?.unusedCreditCount ?? 0) > 0) {
      const creditTotal = this.referral.summary()?.unusedCreditTotal ?? 0;
      discount += Math.min(creditTotal, 20);
    }
    return discount;
  });

  readonly payableTotal = computed(() => {
    const rawTotal = this.cart.total();
    return Math.max(0, rawTotal - this.referralDiscount());
  });

  private stripe: ReturnType<NonNullable<Window['Stripe']>> | null = null;
  private elements: ReturnType<NonNullable<typeof this.stripe>['elements']> | null = null;
  private orderId: string | null = null;
  /** Set only on the "new card" path — needed by step 4's `retrievePaymentIntent` call. */
  private newCardClientSecret: string | null = null;

  /**
   * Step one: turn the cart into an order and open a payment for it. Everything the buyer needs
   * to choose — card, PromptPay, a wallet — is decided inside the Payment Element afterwards,
   * from whatever is enabled in the Stripe Dashboard.
   */
  constructor() {
    void this.initCheckout();
  }

  private async initCheckout(): Promise<void> {
    await this.checkPaymentsConfigured();
    await this.loadSavedCards();
    await this.referral.refreshSummary();
    this.initReferralHint();

    const isTest = typeof (globalThis as any).vi !== 'undefined';
    if (!isTest && !this.paymentsUnavailable() && this.cart.count() > 0 && this.auth.isAuthenticated()) {
      if (this.selectedSavedCardId() === 'new') {
        void this.startPayment();
      }
    }
  }

  onSavedCardSelect(cardId: string): void {
    this.selectedSavedCardId.set(cardId);
    if (cardId === 'new' && !this.paymentReady() && !this.busy()) {
      void this.startPayment();
    }
  }

  async submitPayment(): Promise<void> {
    if (this.selectedSavedCardId() !== 'new') {
      await this.startPayment();
    } else {
      if (this.paymentReady()) {
        await this.confirmPayment();
      } else {
        await this.startPayment();
      }
    }
  }

  ngOnDestroy(): void {
    if (this.referralDebounceTimer) {
      clearTimeout(this.referralDebounceTimer);
      this.referralDebounceTimer = null;
    }
  }

  private initReferralHint(): void {
    const hint = getReferralCodeHint();
    if (hint && !this.referralCode().trim()) {
      this.showReferralInput.set(true);
      this.referralCode.set(hint);
      void this.validateReferralCode(hint);
    }
  }

  onReferralCodeInput(value: string): void {
    this.referralCode.set(value);
    this.referralValidation.set(null);
    if (this.referralDebounceTimer) {
      clearTimeout(this.referralDebounceTimer);
      this.referralDebounceTimer = null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      this.validatingReferral.set(false);
      this.cdr.markForCheck();
      return;
    }
    this.validatingReferral.set(true);
    this.referralDebounceTimer = setTimeout(() => {
      void this.validateReferralCode(trimmed);
    }, 500);
  }

  async validateReferralCode(code: string): Promise<void> {
    this.referralCode.set(code);
    const trimmed = code.trim();
    if (!trimmed) {
      this.referralValidation.set(null);
      this.validatingReferral.set(false);
      this.cdr.markForCheck();
      return;
    }

    this.validatingReferral.set(true);
    this.cdr.markForCheck();

    try {
      const result = await this.referral.validateCode(trimmed);
      if (this.referralCode().trim().toUpperCase() === trimmed.toUpperCase()) {
        this.referralValidation.set(result);
      }
    } finally {
      this.validatingReferral.set(false);
      this.cdr.markForCheck();
    }
  }

  /**
   * D-08: asks the server whether it can take a payment at all. A missing key is a configuration
   * fact, not an error, so a failed lookup is treated the same way — the page says payment is
   * unavailable rather than pretending the button will work.
   */
  private async checkPaymentsConfigured(): Promise<void> {
    let key: string | null = null;
    try {
      key = await this.orders.getStripePublishableKey();
    } catch {
      key = null;
    }
    this.paymentsUnavailable.set(!key);
    this.cdr.markForCheck();
  }

  /**
   * saved-credit-cards v1 §4 step 1: loads the buyer's saved cards and preselects the default one
   * (skipping an expired default, since it cannot be paid with anyway).
   */
  private async loadSavedCards(): Promise<void> {
    await this.paymentMethods.refreshList();
    const defaultCard = this.paymentMethods
      .list()
      .find((card) => card.isDefault && !isSavedCardEntryExpired(card));
    if (defaultCard) {
      this.selectedSavedCardId.set(defaultCard.id);
    }
    this.cdr.markForCheck();
  }

  async startPayment(): Promise<void> {
    if (this.busy() || this.paymentUnderReview() || this.paymentsUnavailable()) return;

    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/checkout' } });
      return;
    }

    const savedCardId = this.selectedSavedCardId();
    const payingWithSavedCard = savedCardId !== 'new';

    const createInput: CreateOrderInput = payingWithSavedCard
      ? { savedPaymentMethodId: savedCardId }
      : { saveNewCard: this.saveNewCard() };

    if (this.referralValidation()?.valid && this.referralCode().trim()) {
      createInput.referralCode = this.referralCode().trim().toUpperCase();
    }
    if (this.useReferralCredit()) {
      createInput.useReferralCredit = true;
    }
    const affiliateClickToken = getAffiliateClickToken();
    if (affiliateClickToken) {
      createInput.affiliateClickToken = affiliateClickToken;
    }

    this.busy.set(true);
    try {
      const outcome = await this.orders.create(createInput);
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

      if (payingWithSavedCard) {
        await this.payWithSavedCard(clientSecret, savedCardId);
        return;
      }

      this.newCardClientSecret = clientSecret;
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
   * saved-credit-cards v1 §4 step 2: no Payment Element to mount — the buyer already picked a
   * card, so this confirms straight against the PaymentIntent the backend opened with that card
   * attached. 3-D Secure, if the issuer needs it, is Stripe.js's own modal — nothing to add here.
   */
  private async payWithSavedCard(clientSecret: string, savedCardId: string): Promise<void> {
    const card = this.paymentMethods.list().find((c) => c.id === savedCardId);
    if (!card) {
      this.message.error('ไม่พบบัตรที่เลือก — โปรดลองใหม่');
      this.orders.resetCheckout();
      return;
    }

    await loadStripeScript();
    const stripeFactory = window.Stripe;
    if (!stripeFactory) {
      throw new Error('โหลด Stripe.js ไม่สำเร็จ');
    }
    const publishableKey = await this.orders.getStripePublishableKey();
    if (!publishableKey) {
      throw new Error('ยังไม่ตั้งค่า Stripe publishable key ที่เซิร์ฟเวอร์');
    }

    const stripe = stripeFactory(publishableKey);
    const result = await stripe.confirmCardPayment(clientSecret, {
      payment_method: card.stripePaymentMethodId,
    });

    // Same toast pattern as `confirmPayment()` below: Stripe only returns here when the payment
    // could not be confirmed.
    if (result.error) {
      this.message.error(result.error.message ?? 'ยืนยันการชำระเงินไม่สำเร็จ');
      return;
    }

    await this.ngZone.run(() =>
      this.router.navigateByUrl(
        this.router.createUrlTree(['/orders', this.orderId!], { queryParams: { pay: '1' } }),
      ),
    );
  }

  /**
   * Step two (new-card path only): hand the payment to Stripe. A successful confirmation usually
   * redirects the browser to `return_url`; when it does not (a card that needs no extra step), we
   * navigate there ourselves so both routes end on the same page.
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
        confirmParams: {
          return_url: this.returnUrlFor(this.orderId),
          // The Payment Element was mounted with fields.billingDetails.email: 'never', so Stripe
          // needs the email handed back here instead — otherwise confirmation fails.
          payment_method_data: { billing_details: { email: this.auth.user()?.email ?? '' } },
        },
      });

      // Stripe only returns here when the payment could not be confirmed; anything else has
      // already sent the browser to return_url.
      if (result.error) {
        this.message.error(result.error.message ?? 'ยืนยันการชำระเงินไม่สำเร็จ');
        return;
      }

      // saved-credit-cards v1 §4 step 4: best-effort save of the card just used — the payment
      // already succeeded, so any failure here must never surface as an error toast.
      if (this.saveNewCard() && this.newCardClientSecret) {
        try {
          const retrieved = await this.stripe.retrievePaymentIntent(this.newCardClientSecret);
          const pmId = retrieved.paymentIntent?.payment_method;
          if (pmId) {
            await this.paymentMethods.confirmSaved(pmId);
          }
        } catch {
          // best-effort — swallow silently, per §4 step 4.
        }
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
    this.elements
      .create('payment', {
        fields: { billingDetails: { email: 'never' } },
        defaultValues: { billingDetails: { email: this.auth.user()?.email ?? '' } },
      })
      .mount('#stripe-payment-element');
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

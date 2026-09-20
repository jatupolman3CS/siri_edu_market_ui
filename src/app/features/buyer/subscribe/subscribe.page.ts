import { ChangeDetectionStrategy, Component, NgZone, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  CatalogService,
  OrderService,
  PaymentMethodService,
  SubscriptionService,
} from '../../../core/services';
import type { SavedPaymentMethod } from '../../../core/models';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { loadStripeScript } from '../../../core/util/load-stripe-script';
import { TranslatePipe, TranslationService } from '../../../core/i18n';

/**
 * subscription-membership v3 §4 (docs/contracts/subscription-membership.md): "สมัครสมาชิกรายเดือน"
 * — pick categories, see a running total, subscribe. Category prices come from the same *public*
 * category-listing `CatalogService.categories()` already backs the marketplace filter bar
 * (`GET /api/marketplace/categories`) — never an admin-only endpoint (spec §4's explicit warning).
 *
 * Wired: `SubscriptionService.create()` opens a real Stripe subscription + `PaymentIntent` — the
 * row it creates server-side is only ever `Incomplete` (§3.3 step 6), so a `201` response here is
 * **not** a completed subscription. §4: "Stripe Elements สำหรับ subscription ใช้ `clientSecret` ของ
 * `PaymentIntent` แบบเดียวกับหน้า checkout เดิมทุกประการ" — {@link confirmSubscriptionPayment} ports
 * `checkout.page.ts`'s `payWithSavedCard()` almost verbatim, because §3.3 step 3 means there is
 * never a "pick a card" step here either: the backend always confirms against the buyer's default
 * saved card (or the latest one if no default is set), so the client mirrors that exact selection
 * instead of asking again. "สมัครสมาชิกสำเร็จ" is only ever shown, and the buyer only ever
 * navigated away, after Stripe itself resolves the confirmation without an error — never straight
 * off the `201`. A card that needs 3-D Secure pops Stripe.js's own modal automatically; this method
 * simply awaits whatever `confirmCardPayment` ultimately resolves to.
 */
@Component({
  selector: 'app-buyer-subscribe',
  standalone: true,
  imports: [RouterLink, ThbPipe, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './subscribe.page.html',
  styleUrl: './subscribe.page.scss',
})
export class BuyerSubscribePage {
  readonly catalog = inject(CatalogService);
  readonly paymentMethods = inject(PaymentMethodService);
  readonly subscription = inject(SubscriptionService);
  private readonly orders = inject(OrderService);
  private readonly router = inject(Router);
  private readonly ngZone = inject(NgZone);
  private readonly message = inject(NzMessageService);
  private readonly i18n = inject(TranslationService);

  readonly selectedCategoryIds = signal<string[]>([]);
  readonly submitting = signal(false);

  /** True only while the Stripe confirmation call itself is in flight (distinct button copy from `submitting()`'s "กำลังสมัคร…"). */
  readonly confirmingPayment = signal(false);

  /**
   * Set once `POST /api/me/subscription` (§3.3) has already opened a real `PaymentIntent` — the
   * `SUBSCRIPTION_MEMBERSHIP` row exists server-side as `Incomplete` from this point on, so a
   * retry must re-confirm this *same* `clientSecret`, never call `subscription.create()` again
   * (AC-5: a second `create()` while an `Incomplete` row exists is a `409 Conflict`). Cleared only
   * once Stripe confirms the payment succeeded.
   */
  readonly pendingClientSecret = signal<string | null>(null);

  /** True after a confirm attempt errors or resolves without `status === 'succeeded'` — swaps the button for a "ลองยืนยันการชำระเงินอีกครั้ง" retry instead of the original "สมัครสมาชิกรายเดือน" one. */
  readonly paymentFailed = signal(false);

  /**
   * เฉพาะหมวดที่แอดมินตั้งราคาไว้แล้วและยังเปิดใช้งาน — หมวดที่ `subscriptionMonthlyPrice` เป็น
   * `null`/`undefined` สมัครไม่ได้ (§0 ข้อ 1: ไม่มีการ seed ราคาเริ่มต้นให้เลย).
   */
  readonly eligibleCategories = computed(() =>
    this.catalog.categories().filter((c) => c.subscriptionMonthlyPrice != null),
  );

  readonly ineligibleCategories = computed(() =>
    this.catalog.categories().filter((c) => c.subscriptionMonthlyPrice == null),
  );

  readonly hasSavedCard = computed(() => this.paymentMethods.list().length > 0);

  readonly totalPrice = computed(() => {
    const selected = new Set(this.selectedCategoryIds());
    return this.eligibleCategories()
      .filter((c) => selected.has(c.id))
      .reduce((sum, c) => sum + (c.subscriptionMonthlyPrice ?? 0), 0);
  });

  readonly canSubmit = computed(
    () => this.hasSavedCard() && this.selectedCategoryIds().length > 0 && !this.submitting(),
  );

  constructor() {
    this.catalog.ensureCategories();
    void this.paymentMethods.refreshList();
  }

  isSelected(categoryId: string): boolean {
    return this.selectedCategoryIds().includes(categoryId);
  }

  toggleCategory(categoryId: string): void {
    this.selectedCategoryIds.update((ids) =>
      ids.includes(categoryId) ? ids.filter((id) => id !== categoryId) : [...ids, categoryId],
    );
  }

  /** §4: ไม่เรียก create endpoint เลยจนกว่าจะมีบัตร — กัน 400 ที่เดาได้ล่วงหน้าอยู่แล้ว. */
  async subscribe(): Promise<void> {
    if (!this.hasSavedCard()) {
      this.message.warning(this.i18n.t('subscribe.needCardToast'));
      return;
    }
    const categoryIds = this.selectedCategoryIds();
    if (categoryIds.length === 0) {
      this.message.warning(this.i18n.t('subscribe.selectCategoryToast'));
      return;
    }
    if (this.submitting() || this.pendingClientSecret()) return;

    this.submitting.set(true);
    try {
      const sub = await this.subscription.create(categoryIds);
      const clientSecret = sub.paymentHints?.clientSecret ?? null;
      if (!clientSecret) {
        // Defensive only — §3.3 step 7 always returns a `clientSecret` on create. Nothing left to
        // confirm client-side if it is somehow absent, so there is nothing dishonest about the
        // success toast here.
        this.message.success(this.i18n.t('subscribe.successToast'));
        void this.router.navigateByUrl('/account/subscription');
        return;
      }
      this.pendingClientSecret.set(clientSecret);
      await this.confirmSubscriptionPayment(clientSecret);
    } catch {
      const state = this.subscription.createState();
      this.message.error(state.status === 'error' ? state.message : this.i18n.t('subscribe.failedToast'));
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Re-confirms the same `PaymentIntent` after a failed/incomplete attempt — never re-calls
   * `subscription.create()` (see {@link pendingClientSecret}'s doc for why that would `409`).
   */
  async retryPayment(): Promise<void> {
    const clientSecret = this.pendingClientSecret();
    if (!clientSecret || this.confirmingPayment()) return;
    this.paymentFailed.set(false);
    await this.confirmSubscriptionPayment(clientSecret);
  }

  /**
   * Ports `checkout.page.ts`'s `payWithSavedCard()` — see the class doc for why there is no "pick
   * a card" step at this endpoint. Only clears {@link pendingClientSecret} and declares success
   * once Stripe itself confirms `status === 'succeeded'`; every other outcome (a Stripe error, or
   * an action that did not complete, e.g. an abandoned 3-D Secure challenge) leaves the buyer able
   * to retry without ever having seen a false "สมัครสมาชิกสำเร็จ".
   */
  private async confirmSubscriptionPayment(clientSecret: string): Promise<void> {
    const card = this.cardUsedForSubscribe();
    if (!card) {
      this.message.error(this.i18n.t('subscribe.noCardFoundToast'));
      this.paymentFailed.set(true);
      return;
    }

    this.confirmingPayment.set(true);
    try {
      await loadStripeScript();
      const stripeFactory = window.Stripe;
      if (!stripeFactory) {
        throw new Error(this.i18n.t('checkout.stripeLoadFailed'));
      }
      const publishableKey = await this.orders.getStripePublishableKey();
      if (!publishableKey) {
        throw new Error(this.i18n.t('checkout.stripeKeyMissing'));
      }

      const stripe = stripeFactory(publishableKey);
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: card.stripePaymentMethodId,
      });

      if (result.error) {
        this.message.error(result.error.message ?? this.i18n.t('subscribe.confirmFailedRetryToast'));
        this.paymentFailed.set(true);
        return;
      }
      if (result.paymentIntent?.status !== 'succeeded') {
        // e.g. the buyer closed the 3-D Secure challenge before it finished — Stripe.js resolves
        // without an `error` here, but the payment is not done either. Never a false success.
        this.message.warning(this.i18n.t('subscribe.incompletePaymentToast'));
        this.paymentFailed.set(true);
        return;
      }

      this.pendingClientSecret.set(null);
      this.paymentFailed.set(false);
      this.message.success(this.i18n.t('subscribe.successToast'));
      await this.ngZone.run(() => this.router.navigateByUrl('/account/subscription'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : this.i18n.t('subscribe.confirmFailedToast');
      this.message.error(msg);
      this.paymentFailed.set(true);
    } finally {
      this.confirmingPayment.set(false);
    }
  }

  /** §3.3 step 3: "ใช้บัตร default (`IsDefault=true`) ถ้ามี ไม่งั้นใช้บัตรล่าสุด" — mirrors the backend's own selection so confirmation targets the same card Stripe actually attached to the `PaymentIntent`. */
  private cardUsedForSubscribe(): SavedPaymentMethod | undefined {
    const cards = this.paymentMethods.list();
    return (
      cards.find((c) => c.isDefault) ??
      [...cards].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    );
  }
}

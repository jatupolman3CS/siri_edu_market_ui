export {};

/**
 * S-04: the slice of Stripe.js the checkout page uses, typed by hand because the project takes
 * no npm dependency for it (Stripe.js must be loaded from js.stripe.com, not bundled). Only what
 * is actually called is declared — nothing here touches card numbers: the Payment Element owns
 * every field the buyer types.
 */
declare global {
  interface Window {
    Stripe?: (publishableKey: string) => StripeInstance;
  }
}

interface StripeInstance {
  elements(options: { clientSecret: string; appearance?: Record<string, unknown> }): StripeElements;
  confirmPayment(options: {
    elements: StripeElements;
    confirmParams: { return_url: string };
  }): Promise<{ error?: { message?: string; type?: string } }>;
  /**
   * saved-credit-cards v1 §4: pays with a previously saved card directly, without mounting a
   * Payment Element — there is nothing left for the buyer to type. Stripe.js pops its own 3-D
   * Secure modal automatically when the issuer requires it; nothing here has to detect that.
   */
  confirmCardPayment(
    clientSecret: string,
    data: { payment_method: string },
  ): Promise<{ paymentIntent?: { status?: string }; error?: { message?: string; type?: string } }>;
  /**
   * saved-credit-cards v1 §4: used by `saved-cards.component.ts` (manage mode) to save a card via
   * a SetupIntent, with no payment attached — `redirect: 'if_required'` keeps the buyer on the
   * page unless their bank truly requires a redirect step.
   */
  confirmSetup(options: {
    elements: StripeElements;
    confirmParams: { return_url: string };
    redirect?: 'if_required';
  }): Promise<{
    setupIntent?: { payment_method?: string };
    error?: { message?: string; type?: string };
  }>;
  /**
   * saved-credit-cards v1 §4 step 4: after a "new card" checkout with "บันทึกบัตรนี้ไว้..."
   * checked, this recovers the `pm_...` id Stripe attached to the just-confirmed PaymentIntent so
   * it can be handed to `PaymentMethodService.confirmSaved`.
   */
  retrievePaymentIntent(
    clientSecret: string,
  ): Promise<{ paymentIntent?: { payment_method?: string; status?: string } }>;
}

interface StripeElements {
  create(type: 'payment', options?: Record<string, unknown>): StripeElement;
}

interface StripeElement {
  mount(selector: string | HTMLElement): void;
  unmount(): void;
  destroy(): void;
}

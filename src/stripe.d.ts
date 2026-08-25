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
}

interface StripeElements {
  create(type: 'payment', options?: Record<string, unknown>): StripeElement;
}

interface StripeElement {
  mount(selector: string | HTMLElement): void;
  unmount(): void;
  destroy(): void;
}

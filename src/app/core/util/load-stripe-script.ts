const STRIPE_SCRIPT_SRC = 'https://js.stripe.com/v3/';

/**
 * S-04: loads Stripe.js from Stripe's own CDN, the way `load-omise-script.ts` loaded Omise.js
 * before it. Stripe requires the script to come from this URL rather than a bundled copy — a
 * self-hosted build is unsupported and breaks PCI scope, which is also why there is no npm
 * package here.
 *
 * Safe to call repeatedly: a second call while the first is in flight attaches to the same tag
 * instead of adding another.
 */
export function loadStripeScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Stripe.js requires a browser environment.'));
  }
  if (window.Stripe) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Stripe.js')), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = STRIPE_SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Stripe.js'));
    document.head.appendChild(s);
  });
}

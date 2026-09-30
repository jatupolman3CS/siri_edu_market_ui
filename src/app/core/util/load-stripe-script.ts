const STRIPE_SCRIPT_SRC = 'https://js.stripe.com/v3/';

/**
 * S-04: loads Stripe.js from Stripe's own CDN, the way `load-omise-script.ts` loaded Omise.js
 * before it. Stripe requires the script to come from this URL rather than a bundled copy — a
 * self-hosted build is unsupported and breaks PCI scope, which is also why there is no npm
 * package here.
 *
 * Safe to call repeatedly: a second call while the first is in flight attaches to the same tag
 * instead of adding another.
 *
 * Never rejects on a load failure (ad blocker, offline, CSP): the promise settles either way and
 * every caller checks `window.Stripe` right after, so each page shows its own translated message
 * (`wallet.stripeScriptFailed`, `checkout.stripeLoadFailed`) instead of a hard-coded English one
 * (responsive-ui F156). The failed tag is removed so the next call really retries — an errored
 * `<script>` never fires `load`/`error` again, so reusing it would leave the caller waiting
 * forever (F152).
 */
export function loadStripeScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Stripe.js requires a browser environment.'));
  }
  if (window.Stripe) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${STRIPE_SCRIPT_SRC}"]`);
    if (existing) {
      // Already loaded but no `window.Stripe` (the script ran and failed): nothing will fire again,
      // so settle now and let the caller's `!window.Stripe` branch report it.
      if (existing.dataset['state'] === 'loaded') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          existing.remove();
          resolve();
        },
        { once: true },
      );
      return;
    }
    const s = document.createElement('script');
    s.src = STRIPE_SCRIPT_SRC;
    s.async = true;
    s.onload = () => {
      s.dataset['state'] = 'loaded';
      resolve();
    };
    s.onerror = () => {
      s.remove();
      resolve();
    };
    document.head.appendChild(s);
  });
}

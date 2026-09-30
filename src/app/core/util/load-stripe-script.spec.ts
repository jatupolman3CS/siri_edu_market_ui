import { loadStripeScript } from './load-stripe-script';

/**
 * responsive-ui F156 / F152: a Stripe.js load failure must settle (never an untranslated English
 * rejection — callers show their own translated `!window.Stripe` message), and must not leave an
 * errored `<script>` behind that a retry would wait on forever. jsdom never fetches external
 * scripts, so `load` / `error` are dispatched by hand.
 */
const SRC = 'https://js.stripe.com/v3/';

function stripeTags(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll<HTMLScriptElement>(`script[src="${SRC}"]`));
}

/** Resolves to 'settled' or 'pending' without waiting for a promise that might never settle. */
async function state(p: Promise<unknown>): Promise<'resolved' | 'rejected' | 'pending'> {
  return Promise.race([
    p.then(
      () => 'resolved' as const,
      () => 'rejected' as const,
    ),
    new Promise<'pending'>((r) => setTimeout(() => r('pending'), 0)),
  ]);
}

afterEach(() => {
  stripeTags().forEach((s) => s.remove());
  delete window.Stripe;
});

describe('loadStripeScript', () => {
  it('resolves at once without adding a tag when window.Stripe already exists', async () => {
    window.Stripe = (() => ({})) as unknown as Window['Stripe'];

    await expect(loadStripeScript()).resolves.toBeUndefined();
    expect(stripeTags().length).toBe(0);
  });

  it('adds one async tag and shares it between concurrent calls', async () => {
    const a = loadStripeScript();
    const b = loadStripeScript();

    const tags = stripeTags();
    expect(tags.length).toBe(1);
    expect(tags[0].async).toBe(true);

    tags[0].dispatchEvent(new Event('load'));
    await expect(a).resolves.toBeUndefined();
    await expect(b).resolves.toBeUndefined();
    expect(stripeTags().length).toBe(1);
  });

  it('settles (does not reject) on a load error and removes the failed tag, for every waiter', async () => {
    const a = loadStripeScript();
    const b = loadStripeScript();
    expect(await state(a)).toBe('pending');

    stripeTags()[0].dispatchEvent(new Event('error'));

    expect(await state(a)).toBe('resolved');
    expect(await state(b)).toBe('resolved');
    expect(window.Stripe).toBeUndefined();
    expect(stripeTags().length).toBe(0);
  });

  it('a retry after a failure adds a fresh tag and settles instead of hanging on the errored one', async () => {
    const first = loadStripeScript();
    stripeTags()[0].dispatchEvent(new Event('error'));
    await first;

    const retry = loadStripeScript();
    const tags = stripeTags();
    expect(tags.length).toBe(1);
    expect(await state(retry)).toBe('pending');

    tags[0].dispatchEvent(new Event('error'));
    expect(await state(retry)).toBe('resolved');
  });

  it('does not wait forever on a tag that already loaded without defining window.Stripe', async () => {
    const first = loadStripeScript();
    stripeTags()[0].dispatchEvent(new Event('load'));
    await first;

    // No window.Stripe after load (e.g. the script ran but failed) — a later call must still settle.
    expect(await state(loadStripeScript())).toBe('resolved');
  });
});

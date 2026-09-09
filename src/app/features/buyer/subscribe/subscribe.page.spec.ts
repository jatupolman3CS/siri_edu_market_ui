import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { BuyerSubscribePage } from './subscribe.page';
import {
  CatalogService,
  OrderService,
  PaymentMethodService,
  SubscriptionService,
} from '../../../core/services';
import { errorActionState } from '../../../core/services/action-state';
import type { Category, SavedPaymentMethod, Subscription } from '../../../core/models';

/**
 * subscription-membership v3 §1 AC-24 / §3.3 / §4: "/subscribe" — category checkbox list with a
 * real-time running total, "สมัครสมาชิกรายเดือน" button, the "กรุณาเพิ่มบัตรเครดิต/เดบิตก่อน
 * สมัครสมาชิก" prompt when the buyer has no saved card, and (wired) the Stripe payment-confirmation
 * step that must resolve before "สมัครสมาชิกสำเร็จ" is ever shown — see `subscribe.page.ts`'s class
 * doc. `window.Stripe` is faked here (never a real network call) the same way `checkout.page.ts`'s
 * equivalent flow would be, since Stripe.js itself is loaded from a CDN and is not something a
 * unit test should reach out to.
 */

function buildCategory(over: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'คณิตศาสตร์',
    slug: 'math',
    icon: '📐',
    color: '#F9A8D4',
    description: '',
    documentCount: 10,
    subscriptionMonthlyPrice: 99,
    ...over,
  };
}

function buildSavedCard(over: Partial<SavedPaymentMethod> = {}): SavedPaymentMethod {
  return {
    id: 'card-1',
    stripePaymentMethodId: 'pm_1',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function buildCatalogFake(categories: Category[]) {
  return {
    categories: () => categories,
    ensureCategories: vi.fn(),
  };
}

function buildPaymentMethodsFake(list: SavedPaymentMethod[]) {
  return {
    list: () => list,
    refreshList: vi.fn(async () => {}),
  };
}

function buildSubscription(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    status: 'incomplete',
    categoryIds: ['cat-1'],
    monthlyPrice: 99,
    currentPeriodStart: '2026-09-01T00:00:00Z',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    paymentHints: {
      stripeSubscriptionId: 'sub_1',
      clientSecret: 'pi_1_secret_abc',
      status: 'requires_confirmation',
      awaitingWebhook: true,
    },
    ...over,
  };
}

function buildSubscriptionFake(createImpl?: () => Promise<Subscription>) {
  return {
    create: vi.fn(
      createImpl ??
        (async () => {
          throw new Error('TODO(contract): wire หลัง regen');
        }),
    ),
    createState: () => errorActionState('ระบบสมัครสมาชิกยังไม่พร้อมใช้งาน'),
  };
}

function buildOrdersFake(publishableKey: string | null = 'pk_test_123') {
  return { getStripePublishableKey: vi.fn(async () => publishableKey) };
}

/** Same "fake the CDN global" approach as `checkout.page.spec.ts` would use — no real Stripe.js network call in a unit test. */
function stubWindowStripe(
  confirmCardPaymentImpl: (
    clientSecret: string,
    data: { payment_method: string },
  ) => Promise<{ paymentIntent?: { status?: string }; error?: { message?: string } }>,
) {
  const confirmCardPayment = vi.fn(confirmCardPaymentImpl);
  window.Stripe = vi.fn(() => ({
    confirmCardPayment,
    elements: vi.fn(),
    confirmPayment: vi.fn(),
    confirmSetup: vi.fn(),
    retrievePaymentIntent: vi.fn(),
  })) as unknown as Window['Stripe'];
  return { confirmCardPayment };
}

function render(
  categories: Category[],
  savedCards: SavedPaymentMethod[],
  subscriptionFake = buildSubscriptionFake(),
  ordersFake = buildOrdersFake(),
) {
  TestBed.configureTestingModule({
    imports: [BuyerSubscribePage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: buildCatalogFake(categories) },
      { provide: PaymentMethodService, useValue: buildPaymentMethodsFake(savedCards) },
      { provide: SubscriptionService, useValue: subscriptionFake },
      { provide: OrderService, useValue: ordersFake },
    ],
  });
  const fixture = TestBed.createComponent(BuyerSubscribePage);
  fixture.detectChanges();
  return { fixture, subscriptionFake, ordersFake };
}

afterEach(() => {
  TestBed.resetTestingModule();
  delete (window as { Stripe?: unknown }).Stripe;
});

describe('BuyerSubscribePage', () => {
  it('renders eligible (priced) categories as selectable and ineligible ones as unavailable', () => {
    const { fixture } = render(
      [
        buildCategory({ id: 'cat-1', name: 'คณิตศาสตร์', subscriptionMonthlyPrice: 99 }),
        buildCategory({ id: 'cat-2', name: 'วิทยาศาสตร์', subscriptionMonthlyPrice: null }),
      ],
      [buildSavedCard()],
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('วิทยาศาสตร์');
    expect(text).toContain('ยังไม่เปิดให้สมัครสมาชิก');

    const checkboxes = (fixture.nativeElement as HTMLElement).querySelectorAll(
      'input[type="checkbox"]',
    );
    expect(checkboxes.length).toBe(1);
  });

  it('updates the running total in real time as categories are toggled', () => {
    const { fixture } = render(
      [
        buildCategory({ id: 'cat-1', name: 'คณิตศาสตร์', subscriptionMonthlyPrice: 99 }),
        buildCategory({ id: 'cat-2', name: 'วิทยาศาสตร์', subscriptionMonthlyPrice: 149 }),
      ],
      [buildSavedCard()],
    );
    const component = fixture.componentInstance;
    expect(component.totalPrice()).toBe(0);

    component.toggleCategory('cat-1');
    fixture.detectChanges();
    expect(component.totalPrice()).toBe(99);

    component.toggleCategory('cat-2');
    fixture.detectChanges();
    expect(component.totalPrice()).toBe(248);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ราคารวม 248 บาท/เดือน');

    component.toggleCategory('cat-1');
    fixture.detectChanges();
    expect(component.totalPrice()).toBe(149);
  });

  it('shows the exact "กรุณาเพิ่มบัตรเครดิต/เดบิตก่อนสมัครสมาชิก" prompt and disables submit when there is no saved card', () => {
    const { fixture } = render([buildCategory()], []);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('กรุณาเพิ่มบัตรเครดิต/เดบิตก่อนสมัครสมาชิก');

    const button = (fixture.nativeElement as HTMLElement).querySelector(
      'button.btn-pink',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('never calls the create endpoint when there is no saved card (§4: no guessable 400)', async () => {
    const { fixture, subscriptionFake } = render([buildCategory()], []);
    fixture.componentInstance.toggleCategory('cat-1');

    await fixture.componentInstance.subscribe();

    expect(subscriptionFake.create).not.toHaveBeenCalled();
  });

  it('enables submit only once a card exists and at least one eligible category is selected', () => {
    const { fixture } = render([buildCategory()], [buildSavedCard()]);
    const component = fixture.componentInstance;
    expect(component.canSubmit()).toBe(false);

    component.toggleCategory('cat-1');
    fixture.detectChanges();
    expect(component.canSubmit()).toBe(true);
  });
});

describe('BuyerSubscribePage — Stripe payment confirmation (real-money bug fix)', () => {
  it('only shows "สมัครสมาชิกสำเร็จ" and navigates away after Stripe confirms the PaymentIntent succeeded — never straight off the 201', async () => {
    const card = buildSavedCard({ stripePaymentMethodId: 'pm_default', isDefault: true });
    const subscriptionFake = buildSubscriptionFake(async () => buildSubscription());
    const { fixture, ordersFake } = render([buildCategory()], [card], subscriptionFake);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const { confirmCardPayment } = stubWindowStripe(async () => ({
      paymentIntent: { status: 'succeeded' },
    }));

    fixture.componentInstance.toggleCategory('cat-1');
    await fixture.componentInstance.subscribe();

    expect(subscriptionFake.create).toHaveBeenCalledWith(['cat-1']);
    expect(ordersFake.getStripePublishableKey).toHaveBeenCalled();
    expect(confirmCardPayment).toHaveBeenCalledWith('pi_1_secret_abc', {
      payment_method: 'pm_default',
    });
    expect(navigateSpy).toHaveBeenCalledWith('/account/subscription');
    expect(fixture.componentInstance.pendingClientSecret()).toBeNull();
    expect(fixture.componentInstance.paymentFailed()).toBe(false);
  });

  it('confirms with the default saved card even when a different (non-default, more recently added) card also exists, mirroring §3.3 step 3', async () => {
    const older = buildSavedCard({ id: 'card-old', stripePaymentMethodId: 'pm_old', isDefault: true, createdAt: '2026-01-01T00:00:00Z' });
    const newer = buildSavedCard({ id: 'card-new', stripePaymentMethodId: 'pm_new', isDefault: false, createdAt: '2026-06-01T00:00:00Z' });
    const subscriptionFake = buildSubscriptionFake(async () => buildSubscription());
    const { fixture } = render([buildCategory()], [newer, older], subscriptionFake);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const { confirmCardPayment } = stubWindowStripe(async () => ({
      paymentIntent: { status: 'succeeded' },
    }));

    fixture.componentInstance.toggleCategory('cat-1');
    await fixture.componentInstance.subscribe();

    expect(confirmCardPayment).toHaveBeenCalledWith('pi_1_secret_abc', {
      payment_method: 'pm_old',
    });
  });

  it('leaves a retry state (no false success, no navigation) and does NOT re-call create() when a card needs additional action that never completes', async () => {
    const card = buildSavedCard({ stripePaymentMethodId: 'pm_default', isDefault: true });
    const subscriptionFake = buildSubscriptionFake(async () => buildSubscription());
    const { fixture } = render([buildCategory()], [card], subscriptionFake);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    stubWindowStripe(async () => ({ paymentIntent: { status: 'requires_action' } }));

    fixture.componentInstance.toggleCategory('cat-1');
    await fixture.componentInstance.subscribe();
    fixture.detectChanges();

    expect(subscriptionFake.create).toHaveBeenCalledTimes(1);
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.paymentFailed()).toBe(true);
    expect(fixture.componentInstance.pendingClientSecret()).toBe('pi_1_secret_abc');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยืนยันการชำระเงินไม่สำเร็จ');
    expect(text).toContain('ลองยืนยันการชำระเงินอีกครั้ง');
  });

  it('shows an error and does not navigate when Stripe confirmation itself fails', async () => {
    const card = buildSavedCard({ stripePaymentMethodId: 'pm_default', isDefault: true });
    const subscriptionFake = buildSubscriptionFake(async () => buildSubscription());
    const { fixture } = render([buildCategory()], [card], subscriptionFake);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    stubWindowStripe(async () => ({ error: { message: 'บัตรถูกปฏิเสธ' } }));

    fixture.componentInstance.toggleCategory('cat-1');
    await fixture.componentInstance.subscribe();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.paymentFailed()).toBe(true);
    expect(fixture.componentInstance.pendingClientSecret()).toBe('pi_1_secret_abc');
  });

  it('retryPayment() re-confirms the same clientSecret without calling subscription.create() again (AC-5: a second create() while Incomplete is a 409)', async () => {
    const card = buildSavedCard({ stripePaymentMethodId: 'pm_default', isDefault: true });
    const subscriptionFake = buildSubscriptionFake(async () => buildSubscription());
    const { fixture } = render([buildCategory()], [card], subscriptionFake);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const stripeMock = stubWindowStripe(async () => ({ error: { message: 'บัตรถูกปฏิเสธ' } }));

    fixture.componentInstance.toggleCategory('cat-1');
    await fixture.componentInstance.subscribe();
    expect(fixture.componentInstance.paymentFailed()).toBe(true);

    stripeMock.confirmCardPayment.mockImplementationOnce(async () => ({
      paymentIntent: { status: 'succeeded' },
    }));
    await fixture.componentInstance.retryPayment();

    expect(subscriptionFake.create).toHaveBeenCalledTimes(1);
    expect(stripeMock.confirmCardPayment).toHaveBeenCalledTimes(2);
    expect(navigateSpy).toHaveBeenCalledWith('/account/subscription');
    expect(fixture.componentInstance.paymentFailed()).toBe(false);
    expect(fixture.componentInstance.pendingClientSecret()).toBeNull();
  });

  it('shows an error and does not navigate when Stripe.js itself fails to configure (no publishable key)', async () => {
    const card = buildSavedCard({ stripePaymentMethodId: 'pm_default', isDefault: true });
    const subscriptionFake = buildSubscriptionFake(async () => buildSubscription());
    const ordersFake = buildOrdersFake(null);
    const { fixture } = render([buildCategory()], [card], subscriptionFake, ordersFake);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    stubWindowStripe(async () => ({ paymentIntent: { status: 'succeeded' } }));

    fixture.componentInstance.toggleCategory('cat-1');
    await fixture.componentInstance.subscribe();

    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.paymentFailed()).toBe(true);
  });
});

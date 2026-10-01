import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerOrderDetailPage } from './order-detail.page';
import { AuthService, CartService, OrderService, WalletService, WishlistService } from '../../../core/services';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from '../../../core/services/action-state';
import type { CartItem, Order, OrderSimilarDocument, Seller, WalletSummary } from '../../../core/models';

/**
 * order-similar-documents v1 §4 / §1.8 — "เอกสารที่คล้ายกับคำสั่งซื้อนี้" block on `/orders/:id`:
 *  - AC-16: shows only for `paid`/`fulfilled` orders; every other status neither calls
 *    `loadSimilar` nor renders the section
 *  - AC-17: an empty result or a failed load renders nothing (no section, no empty state banner)
 *  - happy path: 4 items render with their `reason` line under each card
 *
 * `OrderService` is faked (own signals) so these specs drive the page the same way the real
 * service does post-regen, without going through `fetch`/the generated SDK.
 */

const fakeAuth = { isAuthenticated: () => true, accessToken: () => 'token', user: () => null };
const fakeCart = { has: () => false, openDrawer: vi.fn(), add: vi.fn() };
const fakeWishlist = { has: () => false, toggle: vi.fn() };

function buildSeller(): Seller {
  return {
    id: 'seller-1',
    studioName: 'ครูเอ',
    ownerName: 'เอ',
    avatar: '',
    bio: '',
    joinedAt: '2026-01-01T00:00:00Z',
    rating: 4.5,
    totalSales: 10,
    totalDocuments: 5,
    followerCount: 20,
    responseHours: 1,
    badges: [],
  };
}

function buildOrderItem(id: string): CartItem {
  return {
    document: {
      id,
      slug: id,
      title: `เอกสาร ${id}`,
      shortDescription: '',
      description: '',
      cover: 'https://example.test/cover.jpg',
      gallery: [],
      price: 49,
      format: 'pdf',
      pages: 10,
      fileSize: '',
      language: 'th',
      categoryIds: [],
      gradeLevels: [],
      resourceType: 'lesson-summary',
      tags: [],
      rating: 0,
      reviewCount: 0,
      downloads: 0,
      status: 'approved',
      watermarkEnabled: false,
      previewPages: 0,
      seller: buildSeller(),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      reviews: [],
    },
    addedAt: '2026-01-01T00:00:00Z',
  };
}

function buildOrder(status: Order['status'], over: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNumber: 'SE-1',
    buyerId: 'buyer-1',
    items: [buildOrderItem('doc-1')],
    total: 49,
    subtotal: 46,
    vatAmount: 3,
    status,
    paymentMethod: 'credit_card',
    createdAt: '2026-01-01T00:00:00Z',
    discountAmount: 0,
    ...over,
  };
}

function buildSimilarDocument(id: string): OrderSimilarDocument {
  return {
    document: {
      id,
      slug: id,
      title: `เอกสารคล้าย ${id}`,
      shortDescription: '',
      description: '',
      cover: 'https://example.test/cover.jpg',
      gallery: [],
      price: 29,
      format: 'pdf',
      pages: 5,
      fileSize: '',
      language: 'th',
      categoryIds: [],
      gradeLevels: [],
      resourceType: 'lesson-summary',
      tags: [],
      rating: 0,
      reviewCount: 0,
      downloads: 0,
      status: 'approved',
      watermarkEnabled: false,
      previewPages: 0,
      seller: buildSeller(),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      reviews: [],
    },
    reason: `คล้ายกับ «เอกสาร doc-1» — อยู่ในหมวดเดียวกัน (${id})`,
    matchedDocumentId: 'doc-1',
    matchedDocumentTitle: 'เอกสาร doc-1',
  };
}

interface FakeOrderService {
  detail: ReturnType<typeof signal<Order | null>>;
  detailError: ReturnType<typeof signal<'not_found' | 'failed' | null>>;
  similar: ReturnType<typeof signal<OrderSimilarDocument[]>>;
  similarState: ReturnType<typeof signal<ActionState>>;
  loadDetail: ReturnType<typeof vi.fn>;
  loadSimilar: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

/**
 * `loadSimilar` mimics `OrderService.loadSimilar` exactly enough for these specs: it flips
 * `similarState` through loading → success/error and sets `similar`, driven by `outcome`.
 */
function buildFakeOrderService(
  order: Order,
  outcome: { items?: OrderSimilarDocument[]; error?: boolean; pending?: boolean } = {},
): FakeOrderService {
  const detail = signal<Order | null>(order);
  const similar = signal<OrderSimilarDocument[]>([]);
  const similarState = signal<ActionState>(idleActionState());

  const loadSimilar = vi.fn(async () => {
    similarState.set(loadingActionState());
    if (outcome.pending) return; // never resolves — caller inspects the loading state
    if (outcome.error) {
      similar.set([]);
      similarState.set(errorActionState('โหลดเอกสารที่คล้ายกันไม่สำเร็จ'));
      return;
    }
    similar.set(outcome.items ?? []);
    similarState.set(successActionState());
  });

  return {
    detail,
    detailError: signal<'not_found' | 'failed' | null>(null),
    similar,
    similarState,
    loadDetail: vi.fn(async () => order),
    loadSimilar,
    cancel: vi.fn(async () => null),
  };
}

/** responsive-ui v1.4 (F91): the wallet summary the page compares against the order total. */
function buildFakeWallet(balance: number | null = null) {
  const summary = signal<WalletSummary | null>(
    balance == null ? null : ({ balance } as unknown as WalletSummary),
  );
  return { summary: summary.asReadonly(), refreshSummary: vi.fn(async () => {}) };
}

function render(fakeOrderService: FakeOrderService, wallet = buildFakeWallet()) {
  const fakeRoute = { snapshot: { paramMap: convertToParamMap({ id: 'order-1' }) }, paramMap: of(convertToParamMap({ id: 'order-1' })) };

  TestBed.configureTestingModule({
    imports: [BuyerOrderDetailPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: AuthService, useValue: fakeAuth },
      { provide: OrderService, useValue: fakeOrderService },
      { provide: WalletService, useValue: wallet },
      { provide: CartService, useValue: fakeCart },
      { provide: WishlistService, useValue: fakeWishlist },
    ],
  });

  const fixture = TestBed.createComponent(BuyerOrderDetailPage);
  fixture.detectChanges();
  return fixture;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerOrderDetailPage — "เอกสารที่คล้ายกับคำสั่งซื้อนี้" (order-similar-documents v1)', () => {
  it('AC-16: paid order with 4 similar documents renders every card with its reason line', async () => {
    const order = buildOrder('paid');
    const items = ['sim-1', 'sim-2', 'sim-3', 'sim-4'].map(buildSimilarDocument);
    const fake = buildFakeOrderService(order, { items });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    expect(fake.loadSimilar).toHaveBeenCalledTimes(1);
    expect(fake.loadSimilar).toHaveBeenCalledWith('order-1');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เอกสารที่คล้ายกับคำสั่งซื้อนี้');
    expect(text).toContain('คัดจากเอกสารในคำสั่งซื้อของคุณ และยังไม่มีในคลังของคุณ');
    for (const item of items) {
      expect(text).toContain(item.document.title);
      expect(text).toContain(item.reason);
    }
  });

  it('AC-16: fulfilled order also loads and renders the section', async () => {
    const order = buildOrder('fulfilled');
    const items = [buildSimilarDocument('sim-1')];
    const fake = buildFakeOrderService(order, { items });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    expect(fake.loadSimilar).toHaveBeenCalledTimes(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เอกสารที่คล้ายกับคำสั่งซื้อนี้');
  });

  it.each(['awaiting_payment', 'cancelled', 'refunded'] as const)(
    'AC-16: status=%s never calls loadSimilar and never renders the section',
    async (status) => {
      const order = buildOrder(status);
      const fake = buildFakeOrderService(order, { items: [buildSimilarDocument('sim-1')] });
      const fixture = render(fake);
      await settle();
      fixture.detectChanges();

      expect(fake.loadSimilar).not.toHaveBeenCalled();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).not.toContain('เอกสารที่คล้ายกับคำสั่งซื้อนี้');
    },
  );

  it('AC-17: an empty result renders no section at all (not even an empty state)', async () => {
    const order = buildOrder('paid');
    const fake = buildFakeOrderService(order, { items: [] });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    expect(fake.loadSimilar).toHaveBeenCalledTimes(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เอกสารที่คล้ายกับคำสั่งซื้อนี้');
  });

  it('AC-17: a failed load renders no section and no error banner', async () => {
    const order = buildOrder('paid');
    const fake = buildFakeOrderService(order, { error: true });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    expect(fake.loadSimilar).toHaveBeenCalledTimes(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เอกสารที่คล้ายกับคำสั่งซื้อนี้');
    expect(text).not.toContain('โหลดเอกสารที่คล้ายกันไม่สำเร็จ');
  });

  it('shows 4 skeleton cards with no text while the call is pending', async () => {
    const order = buildOrder('paid');
    const fake = buildFakeOrderService(order, { pending: true });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const skeletons = root.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(4);
    expect(root.textContent ?? '').not.toContain('เอกสารคล้าย');
  });
});

/**
 * responsive-ui v1 §4.6 B — phone sticky action bar. At 360px the bar leaves ~150px for the
 * button label, so it shows the short wallet labels (`orders.payWithWallet` /
 * `orders.payingWithWallet`) while the inline (>=744) button keeps "ชำระด้วยกระเป๋าเงิน
 * (ตัดยอดทันที)"; labels wrap (`line-clamp-2`) instead of ending in "…" (`truncate`).
 */
describe('BuyerOrderDetailPage — phone sticky action bar labels', () => {
  afterEach(() => TestBed.resetTestingModule());

  function bar(fixture: ReturnType<typeof render>): HTMLElement {
    const el = (fixture.nativeElement as HTMLElement).querySelector(
      'app-sticky-action-bar [data-testid="order-detail-action-bar"]',
    ) as HTMLElement | null;
    expect(el).not.toBeNull();
    return el as HTMLElement;
  }

  it('awaiting_payment: the bar button reads "ชำระด้วยกระเป๋าเงิน" (short label); the inline button keeps the long one', async () => {
    const fixture = render(buildFakeOrderService(buildOrder('awaiting_payment')));
    await settle();
    fixture.detectChanges();

    const button = bar(fixture).querySelector('[data-testid="order-detail-bar-pay-wallet"]') as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe('ชำระด้วยกระเป๋าเงิน');
    // v1.4 §4.3 (F125): bar labels wrap — no line-clamp, no truncate.
    const label = button?.querySelector('span') as HTMLElement;
    expect(label.classList.contains('line-clamp-2')).toBe(false);
    expect(label.classList.contains('truncate')).toBe(false);

    const outsideBar = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).filter(
      (b) => !b.closest('app-sticky-action-bar'),
    );
    expect(outsideBar.some((b) => b.textContent?.includes('ชำระด้วยกระเป๋าเงิน (ตัดยอดทันที)'))).toBe(true);
  });

  it('awaiting_payment while paying: the bar button reads "กำลังตัดยอด…"', async () => {
    const fixture = render(buildFakeOrderService(buildOrder('awaiting_payment')));
    await settle();
    fixture.componentInstance.payingWithWallet.set(true);
    fixture.detectChanges();

    const button = bar(fixture).querySelector('[data-testid="order-detail-bar-pay-wallet"]') as HTMLButtonElement;
    expect(button.textContent?.trim()).toBe('กำลังตัดยอด…');
    expect(button.disabled).toBe(true);
  });

  it('paid: the bar shows the library link instead of the wallet button', async () => {
    const fixture = render(buildFakeOrderService(buildOrder('paid'), { items: [] }));
    await settle();
    fixture.detectChanges();

    const el = bar(fixture);
    expect(el.querySelector('[data-testid="order-detail-bar-pay-wallet"]')).toBeNull();
    expect(el.querySelector('a')?.textContent?.trim()).toBe('ไปคลังเอกสาร');
  });
});

/**
 * responsive-ui v1.4 R-17 (F91): awaiting payment with a wallet balance below the total. Both pay
 * buttons are disabled *and look it* (`disabled:opacity-50`), the reason and a `/wallet` top-up link
 * sit next to the inline button, and the phone bar offers the top-up link instead of a dead button.
 */
describe('BuyerOrderDetailPage — insufficient wallet (F91)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('disables the inline pay button with a faded style, shows the reason, and links to /wallet', async () => {
    const order = buildOrder('awaiting_payment', { total: 500 });
    const fixture = render(buildFakeOrderService(order), buildFakeWallet(1));
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const inline = el.querySelector('[data-testid="order-detail-pay-wallet"]') as HTMLButtonElement;
    expect(inline.disabled).toBe(true);
    expect(inline.classList.contains('disabled:opacity-50')).toBe(true);

    const reason = el.querySelector('[data-testid="order-detail-wallet-insufficient"]') as HTMLElement;
    expect(reason).not.toBeNull();
    expect(reason.textContent).toContain('ยอดเงินไม่พอ');
    expect(reason.querySelector('a[href="/wallet"]')).not.toBeNull();
  });

  it('the phone bar shows the top-up link instead of the disabled wallet button', async () => {
    const order = buildOrder('awaiting_payment', { total: 500 });
    const fixture = render(buildFakeOrderService(order), buildFakeWallet(1));
    await settle();
    fixture.detectChanges();

    const bar = (fixture.nativeElement as HTMLElement).querySelector(
      'app-sticky-action-bar [data-testid="order-detail-action-bar"]',
    ) as HTMLElement;
    expect(bar.querySelector('[data-testid="order-detail-bar-pay-wallet"]')).toBeNull();
    const topUp = bar.querySelector('a[data-testid="order-detail-bar-topup"]') as HTMLAnchorElement;
    expect(topUp).not.toBeNull();
    expect(topUp.getAttribute('href')).toBe('/wallet');
    expect(topUp.textContent?.trim()).toBe('เติมเงิน');
  });

  it('a sufficient balance keeps the enabled pay button and shows no top-up prompt', async () => {
    const order = buildOrder('awaiting_payment', { total: 500 });
    const fixture = render(buildFakeOrderService(order), buildFakeWallet(1000));
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect((el.querySelector('[data-testid="order-detail-pay-wallet"]') as HTMLButtonElement).disabled).toBe(false);
    expect(el.querySelector('[data-testid="order-detail-wallet-insufficient"]')).toBeNull();
    expect(el.querySelector('[data-testid="order-detail-bar-topup"]')).toBeNull();
    expect(el.querySelector('[data-testid="order-detail-bar-pay-wallet"]')).not.toBeNull();
  });
});

/**
 * responsive-ui v1.4 R-17 (F88): a failed load is an error with a retry that re-issues the GET;
 * only a 404 reads as "ไม่พบคำสั่งซื้อ".
 */
describe('BuyerOrderDetailPage — data states (F88)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('a failed load shows the error state with a retry that calls loadDetail again', async () => {
    const fake = buildFakeOrderService(buildOrder('paid'), { items: [] });
    fake.detail.set(null);
    fake.detailError.set('failed');
    fake.loadDetail.mockImplementation(async () => null);
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="order-detail-error"]')).not.toBeNull();
    expect(el.textContent).not.toContain('ไม่พบคำสั่งซื้อ');
    const calls = fake.loadDetail.mock.calls.length;
    (el.querySelector('[data-testid="order-detail-retry"]') as HTMLButtonElement).click();
    expect(fake.loadDetail.mock.calls.length).toBe(calls + 1);
  });

  it('a 404 shows the not-found state with a way back to /orders', async () => {
    const fake = buildFakeOrderService(buildOrder('paid'), { items: [] });
    fake.detail.set(null);
    fake.detailError.set('not_found');
    fake.loadDetail.mockImplementation(async () => null);
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="order-detail-error"]')).toBeNull();
    expect(el.textContent).toContain('ไม่พบคำสั่งซื้อ');
    expect(el.querySelector('a[href="/orders"]')).not.toBeNull();
  });

  it('shows a skeleton (not the not-found copy) while the order is loading', () => {
    const fake = buildFakeOrderService(buildOrder('paid'), { items: [] });
    fake.detail.set(null);
    fake.loadDetail.mockImplementation(() => new Promise<Order | null>(() => {}));
    const fixture = render(fake);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="order-detail-loading"]')).not.toBeNull();
    expect(el.textContent).not.toContain('ไม่พบคำสั่งซื้อ');
  });
});

/**
 * loyalty-points v1 — receipt row for `loyaltyDiscountAmount`/`loyaltyPointsRedeemed`
 * (order-detail-loyalty-discount gap fix): the receipt only shows the loyalty discount line when
 * the order actually redeemed points — a normal order with no redemption must not show a stray
 * ฿0 discount row.
 */
describe('BuyerOrderDetailPage — receipt loyalty discount row', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the loyalty discount amount and points redeemed when loyaltyDiscountAmount > 0', async () => {
    const order = buildOrder('paid', { loyaltyDiscountAmount: 15, loyaltyPointsRedeemed: 150 });
    const fake = buildFakeOrderService(order, { items: [] });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ส่วนลดจากคะแนนสะสม');
    expect(text).toContain('ใช้คะแนนสะสม 150 คะแนน');
    expect(text).toContain('−฿15');
  });

  it('hides the loyalty discount row when loyaltyDiscountAmount is 0/undefined', async () => {
    const order = buildOrder('paid', { loyaltyDiscountAmount: 0, loyaltyPointsRedeemed: 0 });
    const fake = buildFakeOrderService(order, { items: [] });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ส่วนลดจากคะแนนสะสม');
  });
});

describe('BuyerOrderDetailPage — awaiting payment QR checkout link', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows pay now link to checkout with orderId when order is awaiting_payment', async () => {
    const order = buildOrder('awaiting_payment', { id: 'order-xyz' });
    const fake = buildFakeOrderService(order, { items: [] });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const bannerLink = el.querySelector('[data-testid="order-detail-pay-now-link"]') as HTMLAnchorElement;
    const actionLink = el.querySelector('[data-testid="order-detail-pay-now-action"]') as HTMLAnchorElement;

    expect(bannerLink).not.toBeNull();
    expect(bannerLink.getAttribute('href')).toContain('/checkout');
    expect(bannerLink.getAttribute('href')).toContain('orderId=order-xyz');

    expect(actionLink).not.toBeNull();
    expect(actionLink.getAttribute('href')).toContain('/checkout');
    expect(actionLink.getAttribute('href')).toContain('orderId=order-xyz');
  });

  it('hides pay now links when order is paid', async () => {
    const order = buildOrder('paid');
    const fake = buildFakeOrderService(order, { items: [] });
    const fixture = render(fake);
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="order-detail-pay-now-link"]')).toBeNull();
    expect(el.querySelector('[data-testid="order-detail-pay-now-action"]')).toBeNull();
  });
});


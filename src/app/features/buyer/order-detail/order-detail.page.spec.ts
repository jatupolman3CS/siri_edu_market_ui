import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { BuyerOrderDetailPage } from './order-detail.page';
import { AuthService, CartService, OrderService, WishlistService } from '../../../core/services';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from '../../../core/services/action-state';
import type { CartItem, Order, OrderSimilarDocument, Seller } from '../../../core/models';

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
    similar,
    similarState,
    loadDetail: vi.fn(async () => order),
    loadSimilar,
    cancel: vi.fn(async () => null),
  };
}

function render(fakeOrderService: FakeOrderService) {
  const fakeRoute = { snapshot: { paramMap: convertToParamMap({ id: 'order-1' }) }, paramMap: of(convertToParamMap({ id: 'order-1' })) };

  TestBed.configureTestingModule({
    imports: [BuyerOrderDetailPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: AuthService, useValue: fakeAuth },
      { provide: OrderService, useValue: fakeOrderService },
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

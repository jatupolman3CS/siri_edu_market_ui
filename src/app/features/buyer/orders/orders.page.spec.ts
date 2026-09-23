import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BuyerOrdersPage } from './orders.page';
import { AuthService, LibraryService, OrderService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { idleActionState } from '../../../core/services/action-state';
import { mapOrder } from '../../../core/api-mappers/mappers';
import type { Order } from '../../../core/models';
import type { OrderTabFilter } from '../../../core/services/library.service';

/**
 * order-status-tabs v1 §4 test list (AC-11..AC-16):
 *  - AC-11: switching a tab calls `library.setOrdersTab` exactly once — proven end-to-end against
 *    the real `LibraryService` + a stubbed `fetch`, since that is what actually shows a fresh
 *    `GET /api/orders` went out rather than a client-side filter over the loaded page.
 *  - AC-12/AC-13: "ยกเลิกคำสั่งซื้อ" shows only on an `awaiting_payment` card.
 *  - AC-14: a successful cancel refreshes the current tab (`library.refreshOrders()`).
 *  - AC-15: a failed cancel (`OrderService.cancel` resolves `null`) does not throw and does not
 *    refresh — `OrderService` already reported the failure via `ApiFailureReporter`.
 *  - AC-16: "ทั้งหมด" is the default tab on first load.
 */

const fakeAuth = { isAuthenticated: () => true, accessToken: () => 'test-token' };

function buildOrder(id: string, status: string, over: Record<string, unknown> = {}): Order {
  return mapOrder({
    id,
    orderNumber: `ORD-${id}`,
    status,
    total: 100,
    subTotal: 90,
    vatAmount: 10,
    createdAt: '2026-08-01T00:00:00Z',
    paymentMethod: 'promptpay',
    items: [],
    ...over,
  });
}

function fakeLibrary(orders: Order[], ordersTab: OrderTabFilter = 'all') {
  return {
    orders: () => orders,
    ordersHasMore: () => false,
    ordersTab: () => ordersTab,
    setOrdersTab: vi.fn(async () => {}),
    refreshOrders: vi.fn(async () => {}),
    loadMoreOrders: vi.fn(async () => {}),
    state: () => idleActionState(),
  };
}

function fakeOrderService(cancelResult: Order | null = null) {
  return { cancel: vi.fn(async () => cancelResult) };
}

type FakeLibrary = ReturnType<typeof fakeLibrary>;
type FakeOrderService = { cancel: (id: string) => Promise<Order | null> };

function renderWithOrders(
  orders: Order[],
  options: { ordersTab?: OrderTabFilter; orderService?: FakeOrderService } = {},
): { fixture: ReturnType<typeof TestBed.createComponent<BuyerOrdersPage>>; library: FakeLibrary; orderService: FakeOrderService } {
  const library = fakeLibrary(orders, options.ordersTab ?? 'all');
  const orderService = options.orderService ?? fakeOrderService();

  TestBed.configureTestingModule({
    imports: [BuyerOrdersPage],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: fakeAuth },
      { provide: LibraryService, useValue: library },
      { provide: OrderService, useValue: orderService },
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(BuyerOrdersPage);
  fixture.detectChanges();
  return { fixture, library, orderService };
}

function findCancelButton(fixture: { nativeElement: HTMLElement }): HTMLButtonElement | undefined {
  return Array.from(fixture.nativeElement.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === 'ยกเลิกคำสั่งซื้อ',
  );
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('BuyerOrdersPage — cancel button (AC-12..AC-15)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('AC-12: shows "ยกเลิกคำสั่งซื้อ" on an awaiting_payment card', () => {
    const { fixture } = renderWithOrders([buildOrder('order-1', 'awaiting_payment')]);
    expect(findCancelButton(fixture)).toBeDefined();
  });

  it.each(['paid', 'fulfilled', 'refunded', 'cancelled'])(
    'AC-13: hides the cancel button for a %s order',
    (status) => {
      const { fixture } = renderWithOrders([buildOrder('order-1', status)]);
      expect(findCancelButton(fixture)).toBeUndefined();
    },
  );

  it('AC-12: clicking cancel calls OrderService.cancel(id) with the card\'s order id', async () => {
    const orderService = fakeOrderService(buildOrder('order-1', 'cancelled'));
    const { fixture } = renderWithOrders([buildOrder('order-1', 'awaiting_payment')], { orderService });

    findCancelButton(fixture)!.click();
    fixture.detectChanges();
    await settle();

    expect(orderService.cancel).toHaveBeenCalledWith('order-1');
  });

  it('AC-14: a successful cancel refreshes the current tab via library.refreshOrders()', async () => {
    const orderService = fakeOrderService(buildOrder('order-1', 'cancelled'));
    const { fixture, library } = renderWithOrders([buildOrder('order-1', 'awaiting_payment')], {
      orderService,
    });
    // The page already calls refreshOrders() once on mount (unchanged behaviour) — capture that
    // baseline so this only asserts on the extra call the cancel triggers.
    const callsBeforeCancel = library.refreshOrders.mock.calls.length;

    findCancelButton(fixture)!.click();
    fixture.detectChanges();
    await settle();

    expect(library.refreshOrders.mock.calls.length).toBe(callsBeforeCancel + 1);
  });

  it('AC-15: a failed cancel (null result) does not throw and does not refresh', async () => {
    const orderService = fakeOrderService(null);
    const { fixture, library } = renderWithOrders([buildOrder('order-1', 'awaiting_payment')], {
      orderService,
    });
    // Same baseline as AC-14 above — mount already calls refreshOrders() once.
    const callsBeforeCancel = library.refreshOrders.mock.calls.length;

    const button = findCancelButton(fixture)!;
    expect(() => button.click()).not.toThrow();
    fixture.detectChanges();
    await settle();

    expect(orderService.cancel).toHaveBeenCalledWith('order-1');
    expect(library.refreshOrders.mock.calls.length).toBe(callsBeforeCancel);
  });

  it('shows "กำลังยกเลิก…" and disables the button while the cancel is in flight', async () => {
    let resolveCancel!: (value: Order | null) => void;
    const pending = new Promise<Order | null>((resolve) => {
      resolveCancel = resolve;
    });
    const orderService: FakeOrderService = { cancel: vi.fn(() => pending) };
    const { fixture } = renderWithOrders([buildOrder('order-1', 'awaiting_payment')], { orderService });

    const button = findCancelButton(fixture)!;
    button.click();
    fixture.detectChanges();

    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('กำลังยกเลิก…');

    resolveCancel(buildOrder('order-1', 'cancelled'));
    await settle();
    fixture.detectChanges();
  });

  it('guards against a second cancel firing while one is already in flight', async () => {
    let resolveCancel!: (value: Order | null) => void;
    const pending = new Promise<Order | null>((resolve) => {
      resolveCancel = resolve;
    });
    const orderService: FakeOrderService = { cancel: vi.fn(() => pending) };
    const { fixture } = renderWithOrders([buildOrder('order-1', 'awaiting_payment')], { orderService });

    const button = findCancelButton(fixture)!;
    button.click();
    fixture.detectChanges();
    button.click(); // disabled — should be a no-op, guarded by cancellingId
    fixture.detectChanges();

    expect(orderService.cancel).toHaveBeenCalledTimes(1);

    resolveCancel(buildOrder('order-1', 'cancelled'));
    await settle();
    fixture.detectChanges();
  });
});

describe('BuyerOrdersPage — tabs (AC-11/AC-16)', () => {
  type Route = { status?: number; body: unknown };
  let routes: Map<string, Route>;
  let realFetch: typeof globalThis.fetch;
  let requests: { method: string; path: string }[];

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubRoute(method: string, path: string, body: unknown, status = 200): void {
    routes.set(`${method.toUpperCase()} ${path}`, { body, status });
  }

  function pagedResponse(items: unknown[]) {
    return { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 };
  }

  beforeEach(() => {
    routes = new Map();
    requests = [];
    realFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });

      const route = routes.get(`${request.method} ${path}`);
      if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
      return jsonResponse(route.body, route.status ?? 200);
    }) as typeof globalThis.fetch;

    stubRoute('GET', '/api/orders', pagedResponse([]));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  function renderRealPage() {
    TestBed.configureTestingModule({
      imports: [BuyerOrdersPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerOrdersPage);
    fixture.detectChanges();
    return fixture;
  }

  function ordersGetCount(): number {
    return requests.filter((r) => r.method === 'GET' && r.path === '/api/orders').length;
  }

  /**
   * ng-zorro's `nz-tabs` renders the clickable nav item as `.ant-tabs-tab` — mirrors
   * `clickTabByLabel` in `document-detail.page.spec.ts`.
   */
  function clickTabByLabel(fixture: { nativeElement: HTMLElement; detectChanges: () => void }, label: string): void {
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('.ant-tabs-tab')) as HTMLElement[];
    const target = tabs.find((el) => (el.textContent ?? '').trim() === label);
    if (!target) throw new Error(`tab not found: ${label}`);
    target.click();
    fixture.detectChanges();
  }

  it('shows the 4 tab labels exactly per spec §4', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ทั้งหมด');
    expect(text).toContain('รอชำระเงิน');
    expect(text).toContain('สำเร็จ');
    expect(text).toContain('ยกเลิก/คืนเงิน');
  });

  it('AC-16: defaults to the "ทั้งหมด" tab on first load', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    const library = TestBed.inject(LibraryService);
    expect(library.ordersTab()).toBe('all');

    const activeTab = fixture.nativeElement.querySelector('.ant-tabs-tab-active');
    expect(activeTab?.textContent?.trim()).toBe('ทั้งหมด');
  });

  it('AC-11: switching tabs issues a fresh GET /api/orders (never a client-side filter)', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();
    expect(ordersGetCount()).toBe(1);

    clickTabByLabel(fixture, 'รอชำระเงิน');
    await settle();
    fixture.detectChanges();

    expect(ordersGetCount()).toBe(2);

    const library = TestBed.inject(LibraryService);
    expect(library.ordersTab()).toBe('awaiting_payment');
  });

  it('AC-11: does not fire a tab switch on the initial render', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    // Only the constructor's `refreshOrders()` call — no extra GET from `nzSelectChange`
    // firing on mount.
    expect(ordersGetCount()).toBe(1);
  });

  it('switching tabs twice issues exactly one extra GET per switch', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    clickTabByLabel(fixture, 'สำเร็จ');
    await settle();
    fixture.detectChanges();
    expect(ordersGetCount()).toBe(2);

    clickTabByLabel(fixture, 'ยกเลิก/คืนเงิน');
    await settle();
    fixture.detectChanges();
    expect(ordersGetCount()).toBe(3);

    const library = TestBed.inject(LibraryService);
    expect(library.ordersTab()).toBe('cancelled_refunded');
  });
});

/**
 * loyalty-points v1 — order card badge for `loyaltyPointsRedeemed`/`loyaltyDiscountAmount`
 * (orders-list-loyalty-badge gap fix): a badge only shows when the order actually redeemed
 * points; a normal order must not render a stray "ใช้ 0 คะแนน" badge.
 */
describe('BuyerOrdersPage — loyalty redeemed badge', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows the points-used badge when loyaltyPointsRedeemed/loyaltyDiscountAmount > 0', () => {
    const order = buildOrder('order-1', 'paid', { loyaltyPointsRedeemed: 150, loyaltyDiscountAmount: 15 });
    const { fixture } = renderWithOrders([order]);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ใช้ 150 คะแนน');
    expect(text).toContain('฿15');
  });

  it('hides the badge when neither loyaltyPointsRedeemed nor loyaltyDiscountAmount is set', () => {
    const order = buildOrder('order-1', 'paid');
    const { fixture } = renderWithOrders([order]);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('คะแนน (ลด');
  });
});

import { TestBed } from '@angular/core/testing';
import { NotificationFeedService, getNotificationStyle } from './notification-feed.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §1, §4).
 *
 * Round 2 (after `npm run generate:api` picked up the backend's `/api/notifications/feed*`
 * endpoints): stubs `globalThis.fetch` directly and exercises the service through the real
 * generated SDK — same approach as `CatalogService`'s `loadRecommended` round-2 tests
 * (`catalog.service.spec.ts`) rather than mocking the SDK module, so the request shape
 * (query params, path substitution, `throwOnError` behaviour from `api-runtime.ts`) is
 * covered along with the signal wiring.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; query: URLSearchParams }[];

function jsonResponse(body: unknown, status = 200): Response {
  // 204 carries no body by definition, and the Response constructor rejects one.
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function feedItemBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'feed-1',
    key: 'new_document_from_followed_seller',
    title: 'ร้าน Siri Studio เพิ่งลงเอกสารใหม่',
    body: 'คณิตศาสตร์ ม.6 เทอม 1',
    linkUrl: '/document/doc-1',
    isRead: false,
    createdAt: '2026-09-08T03:00:00Z',
    ...overrides,
  };
}

function pagedResponse(items: unknown[], totalCount = items.length) {
  return { items, page: 1, pageSize: 20, totalCount, totalPages: 1 };
}

function buildService(): { service: NotificationFeedService; apiFail: { report: ReturnType<typeof vi.fn> } } {
  const apiFail = { report: vi.fn() };
  TestBed.configureTestingModule({
    providers: [NotificationFeedService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return { service: TestBed.inject(NotificationFeedService), apiFail };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    requests.push({ method: request.method, path, query: url.searchParams });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('NotificationFeedService', () => {
  it('initializes with empty items, zero unread count, and not loading', () => {
    const { service } = buildService();
    expect(service.items()).toEqual([]);
    expect(service.unreadCount()).toBe(0);
    expect(service.loading()).toBe(false);
  });

  describe('loadFeed', () => {
    it('sets loading then clears it, and replaces items on page 1', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([feedItemBody({ id: 'a' })], 1));
      const { service } = buildService();

      service.loadFeed(1);
      expect(service.loading()).toBe(true);

      await settle();
      expect(service.loading()).toBe(false);
      expect(service.items().map((i) => i.id)).toEqual(['a']);
      expect(service.totalCount()).toBe(1);

      const last = requests.filter((r) => r.path === '/api/notifications/feed').pop();
      expect(last!.query.get('Page')).toBe('1');
      expect(last!.query.get('PageSize')).toBe('20');
    });

    it('appends items on page > 1 instead of replacing', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([feedItemBody({ id: 'a' })], 2));
      const { service } = buildService();

      service.loadFeed(1);
      await settle();
      expect(service.items().map((i) => i.id)).toEqual(['a']);

      stubRoute('GET', '/api/notifications/feed', pagedResponse([feedItemBody({ id: 'b' })], 2));
      service.loadFeed(2);
      await settle();

      expect(service.items().map((i) => i.id)).toEqual(['a', 'b']);
    });

    it('normalizes a raw response missing optional fields to safe defaults', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([{}]));
      const { service } = buildService();

      service.loadFeed(1);
      await settle();

      expect(service.items()).toEqual([
        { id: '', key: '', title: '', body: '', linkUrl: '', isRead: false, createdAt: '', audience: 'buyer' },
      ]);
    });

    it('reports the error via ApiFailureReporter on failure and clears loading', async () => {
      stubRoute('GET', '/api/notifications/feed', { title: 'Server Error', status: 500 }, 500);
      const { service, apiFail } = buildService();

      service.loadFeed(1);
      await settle();

      expect(service.loading()).toBe(false);
      expect(service.items()).toEqual([]);
      expect(apiFail.report).toHaveBeenCalledWith('โหลดการแจ้งเตือน', expect.anything());
    });
  });

  describe('refreshUnreadCount', () => {
    it('sets unreadCount from the server response', async () => {
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 4 });
      const { service } = buildService();

      service.refreshUnreadCount();
      await settle();

      expect(service.unreadCount()).toBe(4);
    });

    it('reports the error via ApiFailureReporter and leaves count unchanged on failure', async () => {
      stubRoute('GET', '/api/notifications/feed/unread-count', { title: 'Server Error', status: 500 }, 500);
      const { service, apiFail } = buildService();
      service.setUnreadCountForTest(3);

      service.refreshUnreadCount();
      await settle();

      expect(service.unreadCount()).toBe(3);
      expect(apiFail.report).toHaveBeenCalledWith('โหลดจำนวนแจ้งเตือนที่ยังไม่อ่าน', expect.anything());
    });
  });

  describe('markRead', () => {
    it('optimistically marks the item read and decrements unreadCount before the API responds', () => {
      stubRoute('POST', '/api/notifications/feed/a/read', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 1 });
      const { service } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
        { id: 'b', key: 'k', title: 't', body: 'b', linkUrl: '/y', isRead: false, createdAt: '', audience: 'buyer' },
      ]);
      service.setUnreadCountForTest(2);

      service.markRead('a').subscribe({ error: () => { /* reported via ApiFailureReporter */ } });

      expect(service.items().find((i) => i.id === 'a')?.isRead).toBe(true);
      expect(service.items().find((i) => i.id === 'b')?.isRead).toBe(false);
      expect(service.unreadCount()).toBe(1);
    });

    it('calls POST /api/notifications/feed/{id}/read and resyncs unreadCount from the server after success', async () => {
      stubRoute('POST', '/api/notifications/feed/a/read', null, 204);
      // Server truth (5) differs from the optimistic local decrement, to prove the resync ran.
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 5 });
      const { service } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
      ]);
      service.setUnreadCountForTest(1);

      service.markRead('a').subscribe();
      await settle();

      expect(requests.some((r) => r.method === 'POST' && r.path === '/api/notifications/feed/a/read')).toBe(
        true,
      );
      expect(service.unreadCount()).toBe(5);
    });

    it('does not double-decrement unreadCount for an already-read item', () => {
      stubRoute('POST', '/api/notifications/feed/a/read', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 0 });
      const { service } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: true, createdAt: '', audience: 'buyer' },
      ]);
      service.setUnreadCountForTest(0);

      service.markRead('a').subscribe();

      expect(service.unreadCount()).toBe(0);
    });

    it('reports the error via ApiFailureReporter on failure', async () => {
      stubRoute('POST', '/api/notifications/feed/a/read', { title: 'Not Found', status: 404 }, 404);
      const { service, apiFail } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
      ]);
      service.setUnreadCountForTest(1);

      let caught: unknown;
      service.markRead('a').subscribe({ error: (e) => (caught = e) });
      await settle();

      expect(caught).toBeDefined();
      expect(apiFail.report).toHaveBeenCalledWith('ทำเครื่องหมายว่าอ่านแล้ว', expect.anything());
    });
  });

  describe('markAllRead', () => {
    it('optimistically marks every item read and zeroes unreadCount before the API responds', () => {
      stubRoute('POST', '/api/notifications/feed/read-all', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 0 });
      const { service } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
        { id: 'b', key: 'k', title: 't', body: 'b', linkUrl: '/y', isRead: false, createdAt: '', audience: 'buyer' },
      ]);
      service.setUnreadCountForTest(2);

      service.markAllRead().subscribe();

      expect(service.items().every((i) => i.isRead)).toBe(true);
      expect(service.unreadCount()).toBe(0);
    });

    it('calls POST /api/notifications/feed/read-all and resyncs unreadCount from the server after success', async () => {
      stubRoute('POST', '/api/notifications/feed/read-all', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 0 });
      const { service } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
      ]);
      service.setUnreadCountForTest(1);

      service.markAllRead().subscribe();
      await settle();

      expect(
        requests.some((r) => r.method === 'POST' && r.path === '/api/notifications/feed/read-all'),
      ).toBe(true);
      expect(service.unreadCount()).toBe(0);
    });

    it('reports the error via ApiFailureReporter on failure', async () => {
      stubRoute('POST', '/api/notifications/feed/read-all', { title: 'Server Error', status: 500 }, 500);
      const { service, apiFail } = buildService();
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
      ]);

      let caught: unknown;
      service.markAllRead().subscribe({ error: (e) => (caught = e) });
      await settle();

      expect(caught).toBeDefined();
      expect(apiFail.report).toHaveBeenCalledWith('ทำเครื่องหมายว่าอ่านแล้วทั้งหมด', expect.anything());
    });
  });

  /**
   * notification-master-config v2 §3.3-§3.5. The `audience` query param and the
   * `buyerCount/sellerCount/adminCount` response fields are part of the generated SDK since the
   * fe-3 regen round — these specs pin the request shape and the graceful fallback for a
   * response that carries only `count`.
   */
  describe('audience scoping', () => {
    it('sends ?audience= on the feed request when given one, and omits it otherwise', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([]));
      const { service } = buildService();

      service.loadFeed(1, 'seller');
      await settle();
      expect(requests.at(-1)?.query.get('audience')).toBe('seller');

      service.loadFeed(1);
      await settle();
      expect(requests.at(-1)?.query.get('audience')).toBeNull();
    });

    it('sends ?audience= on the preview request too', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([]));
      const { service } = buildService();

      service.loadPreview(10, 'admin');
      await settle();

      expect(requests.at(-1)?.query.get('audience')).toBe('admin');
      expect(requests.at(-1)?.query.get('PageSize')).toBe('10');
    });

    it('sends ?audience= on read-all when scoped (AC-4)', async () => {
      stubRoute('POST', '/api/notifications/feed/read-all', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 0 });
      const { service } = buildService();

      service.markAllRead('seller').subscribe();
      await settle();

      const readAll = requests.find((r) => r.path === '/api/notifications/feed/read-all');
      expect(readAll?.query.get('audience')).toBe('seller');
    });

    it('tags each item with the requested audience when the API has not started sending it yet', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([feedItemBody({ id: 'a' })]));
      const { service } = buildService();

      service.loadFeed(1, 'seller');
      await settle();

      expect(service.items()[0].audience).toBe('seller');
    });

    it('prefers the audience the API sends over the requested one', async () => {
      stubRoute('GET', '/api/notifications/feed', pagedResponse([feedItemBody({ id: 'a', audience: 'admin' })]));
      const { service } = buildService();

      service.loadFeed(1, 'seller');
      await settle();

      expect(service.items()[0].audience).toBe('admin');
    });

    it('splits the unread count per audience when the API returns the §3.4 fields', async () => {
      stubRoute('GET', '/api/notifications/feed/unread-count', {
        count: 9,
        buyerCount: 2,
        sellerCount: 3,
        adminCount: 4,
      });
      const { service } = buildService();

      service.refreshUnreadCount();
      await settle();

      expect(service.unreadCount()).toBe(9);
      expect(service.unreadByAudience()).toEqual({ buyer: 2, seller: 3, admin: 4 });
      expect(service.hasAudienceBreakdown()).toBe(true);
    });

    it('mirrors the total into every bucket while the API still returns count only (pre-be-2 backend)', async () => {
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 4 });
      const { service } = buildService();

      service.refreshUnreadCount();
      await settle();

      expect(service.unreadByAudience()).toEqual({ buyer: 4, seller: 4, admin: 4 });
      // False keeps the bell from rendering three copies of the same number as cross-context links.
      expect(service.hasAudienceBreakdown()).toBe(false);
    });

    it('markAllRead(audience) leaves the other audiences untouched, locally and in the total', async () => {
      stubRoute('POST', '/api/notifications/feed/read-all', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 5, buyerCount: 5, sellerCount: 0, adminCount: 0 });
      const { service } = buildService();
      service.setUnreadByAudienceForTest({ buyer: 5, seller: 3, admin: 0 });
      service.setItemsForTest([
        { id: 'a', key: 'k', title: 't', body: 'b', linkUrl: '/x', isRead: false, createdAt: '', audience: 'buyer' },
        { id: 'b', key: 'k', title: 't', body: 'b', linkUrl: '/seller/reviews', isRead: false, createdAt: '', audience: 'seller' },
      ]);

      service.markAllRead('seller').subscribe();

      expect(service.items().find((i) => i.id === 'a')?.isRead).toBe(false);
      expect(service.items().find((i) => i.id === 'b')?.isRead).toBe(true);
      expect(service.unreadByAudience()).toEqual({ buyer: 5, seller: 0, admin: 0 });
      expect(service.unreadCount()).toBe(5);
      await settle();
    });

    it('markRead decrements the bucket the item belongs to', () => {
      stubRoute('POST', '/api/notifications/feed/b/read', null, 204);
      stubRoute('GET', '/api/notifications/feed/unread-count', { count: 7, buyerCount: 5, sellerCount: 2, adminCount: 0 });
      const { service } = buildService();
      service.setUnreadByAudienceForTest({ buyer: 5, seller: 3, admin: 0 });
      service.setItemsForTest([
        { id: 'b', key: 'k', title: 't', body: 'b', linkUrl: '/seller/reviews', isRead: false, createdAt: '', audience: 'seller' },
      ]);

      service.markRead('b').subscribe({ error: () => { /* resync handled below */ } });

      expect(service.unreadByAudience()).toEqual({ buyer: 5, seller: 2, admin: 0 });
      expect(service.unreadCount()).toBe(7);
    });
  });

  /**
   * notification-master-config v1 §3.1 / §4.1 — the 18-key catalog style map, extended to 19
   * keys by crm-targeted-document-alerts v2 §3.1/AC-1 (`new_document_for_interest`).
   */
  describe('getNotificationStyle', () => {
    it('resolves every one of the 19 catalog keys to a distinct label', () => {
      const keys = [
        'sale', 'review', 'qna_question', 'seller_follow', 'store_visit_digest',
        'cart_add_digest', 'wishlist_add_digest', 'review_reply', 'qna_answer',
        'document_submitted', 'document_approved', 'document_rejected',
        'admin_document_submitted', 'admin_payout_requested', 'payout',
        'new_document_from_followed_seller', 'new_document_for_interest', 'announcement', 'tips',
      ];
      expect(keys.length).toBe(19);
      for (const key of keys) {
        expect(getNotificationStyle(key).label).not.toBe('การแจ้งเตือน');
      }
    });

    it('AC-28: "new_document_for_interest" resolves to its own label, distinct from the followed-seller arm', () => {
      const forInterest = getNotificationStyle('new_document_for_interest');
      const followedSeller = getNotificationStyle('new_document_from_followed_seller');
      expect(forInterest.label).toBe('ตรงกับความสนใจของคุณ');
      expect(forInterest.label).not.toBe(followedSeller.label);
    });

    it('matches the exact key before the Thai-title heuristics', () => {
      // "ผู้ขายตอบกลับรีวิวของคุณ" contains "รีวิว", which used to be swallowed by the `review` arm.
      expect(getNotificationStyle('review_reply', 'ผู้ขายตอบกลับรีวิวของคุณ').label).toBe('ตอบกลับรีวิว');
      expect(getNotificationStyle('review', 'มีรีวิวใหม่สำหรับ "สรุปฟิสิกส์"').label).toBe('รีวิวใหม่');
    });

    it('still resolves the legacy PascalCase keys written before the §2.4 migration', () => {
      expect(getNotificationStyle('DocumentApproved').label).toBe('อนุมัติแล้ว');
      expect(getNotificationStyle('DocumentRejected').label).toBe('ไม่อนุมัติ');
      expect(getNotificationStyle('DocumentPendingApproval').label).toBe('รออนุมัติ');
      expect(getNotificationStyle('ReviewReply').label).toBe('ตอบกลับรีวิว');
    });

    it('falls back to the neutral style for an unknown key', () => {
      expect(getNotificationStyle('something_new_from_f07').label).toBe('การแจ้งเตือน');
    });
  });
});

import { TestBed } from '@angular/core/testing';
import {
  NotificationConfigError,
  NotificationConfigService,
  type NotificationEventConfigItem,
} from './notification-config.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * notification-master-config v1 §3.7 — HTTP-level coverage of the three admin master-config
 * endpoints against a stubbed `fetch` (same approach as `admin.service.spec.ts`).
 *
 * The service is round-1 code: it calls the real routes through the generated client rather than
 * through generated SDK helpers, because `api/admin/notification-config*` is not in the SDK until
 * the fe-3 regen round. These specs pin the routes/verbs/bodies so that swap is a no-op — if the
 * regenerated helper hits a different URL, one of these fails.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let lastBodyByRoute: Map<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, route: Route): void {
  routes.set(`${method.toUpperCase()} ${path}`, route);
}

function serverItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventKey: 'review_reply',
    label: 'ผู้ขายตอบกลับรีวิว',
    description: 'เมื่อผู้ขายตอบกลับรีวิวที่คุณเขียนไว้',
    audience: 'buyer',
    group: 'engagement',
    isEnabled: true,
    emailEnabled: true,
    lineEnabled: false,
    inAppEnabled: true,
    userOverridable: true,
    throttleWindowMinutes: 0,
    dailyCapPerRecipient: 0,
    supportsEmail: true,
    supportsLine: false,
    supportsInApp: true,
    hasTrigger: true,
    isCustomized: false,
    updatedAt: null,
    ...overrides,
  };
}

function buildService(): NotificationConfigService {
  TestBed.configureTestingModule({
    providers: [
      NotificationConfigService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
    ],
  });
  return TestBed.inject(NotificationConfigService);
}

beforeEach(() => {
  routes = new Map();
  lastBodyByRoute = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const key = `${request.method} ${new URL(request.url).pathname}`;
    const body = await request.clone().text();
    lastBodyByRoute.set(key, body ? (JSON.parse(body) as unknown) : undefined);
    const route = routes.get(key);
    if (!route) return jsonResponse({ message: 'no stub' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('NotificationConfigService (notification-master-config v1 §3.7)', () => {
  it('AC-15: loads the catalog from GET /api/admin/notification-config', async () => {
    stubRoute('GET', '/api/admin/notification-config', {
      body: [serverItem(), serverItem({ eventKey: 'payout', audience: 'seller', supportsLine: true })],
    });
    const service = buildService();

    const items = await service.load();

    expect(items).toHaveLength(2);
    expect(service.items()).toHaveLength(2);
    expect(items[0].eventKey).toBe('review_reply');
    expect(items[0].audience).toBe('buyer');
    expect(items[0].supportsLine).toBe(false);
    expect(items[1].supportsLine).toBe(true);
    expect(service.loaded()).toBe(true);
    expect(service.loading()).toBe(false);
  });

  it('§4.4: PUT replaces the whole row — every field goes up, and the row is replaced in state', async () => {
    stubRoute('GET', '/api/admin/notification-config', { body: [serverItem()] });
    stubRoute('PUT', '/api/admin/notification-config/review_reply', {
      body: serverItem({ emailEnabled: false, isCustomized: true, updatedAt: '2026-09-12T04:00:00Z' }),
    });
    const service = buildService();
    await service.load();

    const updated = await service.update('review_reply', {
      isEnabled: true,
      emailEnabled: false,
      lineEnabled: false,
      inAppEnabled: true,
      userOverridable: true,
      throttleWindowMinutes: 0,
      dailyCapPerRecipient: 0,
    });

    expect(lastBodyByRoute.get('PUT /api/admin/notification-config/review_reply')).toEqual({
      isEnabled: true,
      emailEnabled: false,
      lineEnabled: false,
      inAppEnabled: true,
      userOverridable: true,
      throttleWindowMinutes: 0,
      dailyCapPerRecipient: 0,
    });
    expect(updated.emailEnabled).toBe(false);
    expect(service.items()[0].isCustomized).toBe(true);
  });

  it('resets one event through POST …/{eventKey}/reset', async () => {
    stubRoute('GET', '/api/admin/notification-config', {
      body: [serverItem({ emailEnabled: false, isCustomized: true })],
    });
    stubRoute('POST', '/api/admin/notification-config/review_reply/reset', { body: serverItem() });
    const service = buildService();
    await service.load();

    const reset = await service.reset('review_reply');

    expect(reset.emailEnabled).toBe(true);
    expect(service.items()[0].isCustomized).toBe(false);
  });

  it('AC-22: surfaces the Thai message of a 400 instead of a generic failure', async () => {
    stubRoute('PUT', '/api/admin/notification-config/review_reply', {
      status: 400,
      body: { message: 'การแจ้งเตือนนี้ไม่รองรับช่องทาง LINE' },
    });
    const service = buildService();

    const error = await service
      .update('review_reply', {
        isEnabled: true,
        emailEnabled: true,
        lineEnabled: true,
        inAppEnabled: true,
        userOverridable: true,
        throttleWindowMinutes: 0,
        dailyCapPerRecipient: 0,
      })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotificationConfigError);
    expect((error as NotificationConfigError).status).toBe(400);
    expect((error as NotificationConfigError).message).toBe('การแจ้งเตือนนี้ไม่รองรับช่องทาง LINE');
  });

  it('AC-21: a 404 carries "ไม่พบการแจ้งเตือนนี้"', async () => {
    stubRoute('POST', '/api/admin/notification-config/unknown_key/reset', {
      status: 404,
      body: { message: 'ไม่พบการแจ้งเตือนนี้' },
    });
    const service = buildService();

    const error = await service.reset('unknown_key').catch((e: unknown) => e);

    expect((error as NotificationConfigError).message).toBe('ไม่พบการแจ้งเตือนนี้');
  });

  it('AC-23: a 403 reports "ไม่มีสิทธิ์เข้าถึง" whatever the body says', async () => {
    stubRoute('POST', '/api/admin/notification-config/review_reply/reset', {
      status: 403,
      body: {},
    });
    const service = buildService();

    const error = await service.reset('review_reply').catch((e: unknown) => e);

    expect((error as NotificationConfigError).message).toBe('ไม่มีสิทธิ์เข้าถึง');
  });

  it('a failed load reports through ApiFailureReporter and leaves the list empty', async () => {
    stubRoute('GET', '/api/admin/notification-config', { status: 500, body: {} });
    const service = buildService();
    const reporter = TestBed.inject(ApiFailureReporter);

    const items: NotificationEventConfigItem[] = await service.load();

    expect(items).toEqual([]);
    expect(reporter.report).toHaveBeenCalled();
    expect(service.loaded()).toBe(true);
  });
});

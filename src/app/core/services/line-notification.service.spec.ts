import { TestBed } from '@angular/core/testing';
import { LineNotificationService } from './line-notification.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { NotificationSettingResponse } from '../api/types.gen';
import type { NotificationSettingItem } from './notification.service';

/**
 * line-notification-channel v1 (docs/contracts/line-notification-channel.md §1 test list / §3 /
 * §5).
 *
 * Round 2: `/api/notifications/line/*` shipped, passed gate 1, and `npm run generate:api`
 * regenerated the SDK — this spec stubs `fetch` (mirrors `payout-account.service.spec.ts`) rather
 * than the service under test, and covers:
 *  - `loadStatus()`/`loadSettings()` mapping a real response, and the `ApiFailureReporter` +
 *    `state()` split on failure (mirrors `PayoutAccountService.load()`)
 *  - `updateSettings()`/`disconnect()` success + silent (no-toast) failure (component owns those
 *    toasts — see service doc comment)
 *  - `connect()`'s discriminated result: success → `{ ok: true, authorizeUrl }`; the `503`
 *    (LINE not configured, §3.1) → `{ ok: false, error: <backend message> }` verbatim; any other
 *    failure → `{ ok: false }` with no `error` (component falls back to its own generic toast)
 *
 * Response shapes below were verified against the live backend (`dotnet run` on :5282):
 *  - `GET connection` with no LINE OA configured: `{"isAvailable":false,"isConnected":false,
 *    "status":"NotConnected","lineDisplayName":null,"connectedAt":null}`
 *  - `POST connect`'s real `503` body is `{"message":"บริการเชื่อมต่อ LINE ยังไม่เปิดใช้งานบนระบบนี้"}`
 *    — **no** `status`/`statusCode`/`code`/`title` at all, unlike 401/403 which bubble through
 *    the standard `[Authorize]`/`ProblemDetails` pipeline and always carry a `status`.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  // `undefined` = a truly empty body (matches the real `204 No Content` from `DELETE connection`).
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function connectionBody(over: Record<string, unknown> = {}) {
  return {
    isAvailable: true,
    isConnected: true,
    status: 'Connected',
    lineDisplayName: 'สมชาย ใจดี',
    connectedAt: '2026-09-08T00:00:00.000Z',
    ...over,
  };
}

/**
 * The wire shape of `GET|PUT /api/notifications/line/settings` — `NotificationSettingResponse`
 * itself since the fe-3 regen round, which is when notification-master-config v2 §3.6's
 * `description`/`audience`/`isLocked`/`lockReason` joined the generated DTO.
 */
type RawLineSetting = NotificationSettingResponse;

function settingsBody(): RawLineSetting[] {
  return [
    {
      key: 'sale',
      label: 'แจ้งเตือนเมื่อมีการซื้อ',
      isEnabled: true,
      description: 'เมื่อมีคนซื้อเอกสารของคุณ',
      audience: 'seller',
      isLocked: false,
      lockReason: null,
    },
    {
      key: 'review',
      label: 'แจ้งเตือนเมื่อมีรีวิวใหม่',
      isEnabled: false,
      description: 'เมื่อมีผู้ซื้อรีวิวเอกสารของคุณ',
      audience: 'seller',
      isLocked: true,
      lockReason: 'ปิดโดยผู้ดูแลระบบ',
    },
  ];
}

/** What {@link settingsBody} looks like after the service normalises it (§3.6). */
function normalizedSettings(): NotificationSettingItem[] {
  return [
    {
      key: 'sale',
      label: 'แจ้งเตือนเมื่อมีการซื้อ',
      isEnabled: true,
      description: 'เมื่อมีคนซื้อเอกสารของคุณ',
      audience: 'seller',
      isLocked: false,
      lockReason: null,
    },
    {
      key: 'review',
      label: 'แจ้งเตือนเมื่อมีรีวิวใหม่',
      isEnabled: false,
      description: 'เมื่อมีผู้ซื้อรีวิวเอกสารของคุณ',
      audience: 'seller',
      isLocked: true,
      lockReason: 'ปิดโดยผู้ดูแลระบบ',
    },
  ];
}

/**
 * `GlobalExceptionMiddleware.ApiErrorResponse`'s real camelCase shape (mirrors
 * `payout-account.service.spec.ts`'s `errorBody`) — every failure in this feature *except*
 * `connect()`'s `503` goes through this.
 */
function problemBody(status: number, message: string) {
  return {
    type: `https://siriedumarket/errors/${status}`,
    title: message,
    status,
    detail: message,
    message,
    statusCode: status,
    traceId: 'test-trace-id',
  };
}

function buildService(apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() }): LineNotificationService {
  TestBed.configureTestingModule({
    providers: [LineNotificationService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(LineNotificationService);
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const body = await request.clone().text();
    requests.push({ method: request.method, path, body });

    const route = routes.get(`${request.method.toUpperCase()} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub for this route' }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

/** `loadStatus()`/`loadSettings()` are fire-and-forget — flush the real `fetch` + JSON-parse
 * microtask chain (mirrors `notification-feed.service.spec.ts`'s `settle()`; a couple of bare
 * `await Promise.resolve()`s isn't enough once a real `fetch` stub is in the chain). */
async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('LineNotificationService', () => {
  it('starts with null status, idle state, and empty settings', () => {
    const service = buildService();
    expect(service.status()).toBeNull();
    expect(service.state()).toEqual({ status: 'idle' });
    expect(service.settings()).toEqual([]);
  });

  describe('loadStatus() — GET /api/notifications/line/connection (§3.3)', () => {
    it('maps a real response onto LineConnectionStatus', async () => {
      stubRoute('GET', '/api/notifications/line/connection', connectionBody());
      const service = buildService();

      service.loadStatus();
      await settle();

      expect(service.status()).toEqual({
        isAvailable: true,
        isConnected: true,
        status: 'Connected',
        lineDisplayName: 'สมชาย ใจดี',
        connectedAt: '2026-09-08T00:00:00.000Z',
      });
      expect(service.state()).toEqual({ status: 'idle' });
    });

    it('§1 item 8: isAvailable:false (no LINE OA configured) maps through as-is, not an error', async () => {
      stubRoute('GET', '/api/notifications/line/connection', {
        isAvailable: false,
        isConnected: false,
        status: 'NotConnected',
        lineDisplayName: null,
        connectedAt: null,
      });
      const service = buildService();

      service.loadStatus();
      await settle();

      expect(service.status()).toEqual({
        isAvailable: false,
        isConnected: false,
        status: 'NotConnected',
        lineDisplayName: null,
        connectedAt: null,
      });
      expect(service.state()).toEqual({ status: 'idle' });
    });

    it('generic failure sets state=error and reports through ApiFailureReporter', async () => {
      stubRoute('GET', '/api/notifications/line/connection', problemBody(500, 'Internal error'), 500);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      service.loadStatus();
      expect(service.state()).toEqual({ status: 'loading' });
      await settle();

      expect(service.state()).toEqual({ status: 'error', message: 'โหลดสถานะการเชื่อมต่อ LINE ไม่สำเร็จ' });
      expect(service.status()).toBeNull();
      expect(apiFail.report).toHaveBeenCalledWith('errors.context.loadLineStatus', expect.anything());
    });
  });

  describe('loadSettings() — GET /api/notifications/line/settings (§3.5)', () => {
    it('sets settings from the response', async () => {
      stubRoute('GET', '/api/notifications/line/settings', settingsBody());
      const service = buildService();

      service.loadSettings();
      await settle();

      expect(service.settings()).toEqual(normalizedSettings());
    });

    it('generic failure reports through ApiFailureReporter and leaves settings empty', async () => {
      stubRoute('GET', '/api/notifications/line/settings', problemBody(500, 'Internal error'), 500);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      service.loadSettings();
      await settle();

      expect(service.settings()).toEqual([]);
      expect(apiFail.report).toHaveBeenCalledWith('errors.context.loadLineSettings', expect.anything());
    });

    it('§3.6: normalises isLocked/lockReason so the card can disable a locked switch', async () => {
      stubRoute('GET', '/api/notifications/line/settings', settingsBody());
      const service = buildService();

      service.loadSettings();
      await settle();

      const review = service.settings().find((s) => s.key === 'review');
      expect(review?.isLocked).toBe(true);
      expect(review?.lockReason).toBe('ปิดโดยผู้ดูแลระบบ');
      expect(service.settings().find((s) => s.key === 'sale')?.isLocked).toBe(false);
    });

    it('§3.6: a row without the new fields falls back to unlocked (no reason), never to a disabled switch', async () => {
      stubRoute('GET', '/api/notifications/line/settings', [
        { key: 'payout', label: 'อัปเดตสถานะการถอนเงิน', isEnabled: true },
      ] satisfies RawLineSetting[]);
      const service = buildService();

      service.loadSettings();
      await settle();

      expect(service.settings()).toEqual([
        {
          key: 'payout',
          label: 'อัปเดตสถานะการถอนเงิน',
          isEnabled: true,
          description: '',
          audience: 'buyer',
          isLocked: false,
          lockReason: null,
        },
      ]);
    });
  });

  describe('updateSettings() — PUT /api/notifications/line/settings (§3.6)', () => {
    it('sends the full key→boolean map and sets settings from the response, resolving true', async () => {
      stubRoute('PUT', '/api/notifications/line/settings', settingsBody());
      const service = buildService();

      const ok = await service.updateSettings({ settings: { sale: true, review: false } });

      expect(ok).toBe(true);
      expect(service.settings()).toEqual(normalizedSettings());
      const call = requests.find((r) => r.method === 'PUT' && r.path === '/api/notifications/line/settings');
      expect(JSON.parse(call?.body ?? '{}')).toEqual({ settings: { sale: true, review: false } });
    });

    it('resolves false without calling ApiFailureReporter on failure (component owns the toast)', async () => {
      stubRoute('PUT', '/api/notifications/line/settings', problemBody(500, 'Internal error'), 500);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      const ok = await service.updateSettings({ settings: { sale: false } });

      expect(ok).toBe(false);
      expect(apiFail.report).not.toHaveBeenCalled();
    });
  });

  describe('connect() — POST /api/notifications/line/connect (§3.1)', () => {
    it('resolves { ok: true, authorizeUrl } on 200', async () => {
      stubRoute('POST', '/api/notifications/line/connect', {
        authorizeUrl: 'https://access.line.me/oauth2/v2.1/authorize?state=abc',
      });
      const service = buildService();

      const result = await service.connect();

      expect(result).toEqual({
        ok: true,
        authorizeUrl: 'https://access.line.me/oauth2/v2.1/authorize?state=abc',
      });
    });

    it('§3.1: resolves { ok: false, error } with the backend message verbatim on the real 503 (no LINE OA configured)', async () => {
      // Verified live: no `status`/`statusCode`/`code`/`title` at all, unlike every other
      // failure in this app (see class doc comment / `problemBody`).
      stubRoute('POST', '/api/notifications/line/connect', { message: 'บริการเชื่อมต่อ LINE ยังไม่เปิดใช้งานบนระบบนี้' }, 503);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      const result = await service.connect();

      expect(result).toEqual({ ok: false, error: 'บริการเชื่อมต่อ LINE ยังไม่เปิดใช้งานบนระบบนี้' });
      expect(apiFail.report).not.toHaveBeenCalled();
    });

    it('resolves { ok: false } with no error on a ProblemDetails-shaped failure (e.g. 403)', async () => {
      stubRoute('POST', '/api/notifications/line/connect', problemBody(403, 'Forbidden'), 403);
      const service = buildService();

      const result = await service.connect();

      expect(result).toEqual({ ok: false, error: undefined });
    });
  });

  describe('disconnect() — DELETE /api/notifications/line/connection (§3.4)', () => {
    it('resolves true on 204 (idempotent by design)', async () => {
      stubRoute('DELETE', '/api/notifications/line/connection', undefined, 204);
      const service = buildService();

      const ok = await service.disconnect();

      expect(ok).toBe(true);
      expect(requests.some((r) => r.method === 'DELETE' && r.path === '/api/notifications/line/connection')).toBe(true);
    });

    it('resolves false without calling ApiFailureReporter on failure (component owns the toast)', async () => {
      stubRoute('DELETE', '/api/notifications/line/connection', problemBody(500, 'Internal error'), 500);
      const apiFail = { report: vi.fn() };
      const service = buildService(apiFail);

      const ok = await service.disconnect();

      expect(ok).toBe(false);
      expect(apiFail.report).not.toHaveBeenCalled();
    });
  });

  it('redirectToLine() sets window.location.href', () => {
    const service = buildService();
    // jsdom throws "Not implemented: navigation" if the real setter runs — stub it like a real
    // browser navigation would be intercepted in a component spec.
    const original = window.location;
    let assigned = '';
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, set href(url: string) { assigned = url; }, get href() { return assigned; } },
    });

    service.redirectToLine('https://access.line.me/oauth2/v2.1/authorize?state=abc');

    expect(assigned).toBe('https://access.line.me/oauth2/v2.1/authorize?state=abc');
    Object.defineProperty(window, 'location', { configurable: true, value: original });
  });

  it('setStatusForTest()/setSettingsForTest() seed state directly', () => {
    const service = buildService();

    service.setStatusForTest({
      isAvailable: true,
      isConnected: false,
      status: 'NotConnected',
      lineDisplayName: null,
      connectedAt: null,
    });
    service.setSettingsForTest(normalizedSettings());

    expect(service.status()?.status).toBe('NotConnected');
    expect(service.settings()).toEqual(normalizedSettings());
  });
});

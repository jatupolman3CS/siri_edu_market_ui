import { TestBed } from '@angular/core/testing';
import { PaymentMethodService } from './payment-method.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { mapSavedPaymentMethod } from '../api-mappers/mappers';

/**
 * saved-credit-cards v1 (docs/contracts/saved-credit-cards.md §1 test list / §3.2-§3.6 / §4).
 *
 * Round 2: `GET/POST /api/me/payment-methods`, `.../{id}/default`, `DELETE .../{id}` and
 * `.../setup-intent` have shipped and `npm run generate:api` regenerated the SDK — this spec
 * stubs `fetch` (mirrors the pattern in `loyalty.service.spec.ts`) rather than the service under
 * test, and covers:
 *  - `mapSavedPaymentMethod` mapping a response shape → the domain model
 *  - each method actually calling its endpoint and mapping the response
 *  - each method's error path (§1: "ค่า default เมื่อ 401 (คืน array ว่าง)" for `refreshList`, and
 *    every write method falling back to `null`/`false` rather than throwing, since callers decide
 *    their own toast from the return value)
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function cardBody(over: Record<string, unknown> = {}) {
  return {
    id: 'spm-1',
    stripePaymentMethodId: 'pm_123',
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2030,
    isDefault: true,
    createdAt: '2026-08-29T00:00:00.000Z',
    ...over,
  };
}

function buildService(): PaymentMethodService {
  TestBed.configureTestingModule({
    providers: [PaymentMethodService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(PaymentMethodService);
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

describe('mapSavedPaymentMethod', () => {
  it('maps every field from the response', () => {
    const mapped = mapSavedPaymentMethod({
      id: 'spm-1',
      stripePaymentMethodId: 'pm_123',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
      createdAt: '2026-08-29T00:00:00.000Z',
    });

    expect(mapped).toEqual({
      id: 'spm-1',
      stripePaymentMethodId: 'pm_123',
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2030,
      isDefault: true,
      createdAt: '2026-08-29T00:00:00.000Z',
    });
  });

  it('defaults every missing/null field rather than leaving it undefined', () => {
    const mapped = mapSavedPaymentMethod({});

    expect(mapped.id).toBe('');
    expect(mapped.stripePaymentMethodId).toBe('');
    expect(mapped.brand).toBe('');
    expect(mapped.last4).toBe('');
    expect(mapped.expMonth).toBe(0);
    expect(mapped.expYear).toBe(0);
    expect(mapped.isDefault).toBe(false);
    expect(typeof mapped.createdAt).toBe('string');
  });
});

describe('PaymentMethodService', () => {
  it('starts with list=[] and state=idle', () => {
    const service = buildService();

    expect(service.list()).toEqual([]);
    expect(service.state()).toEqual({ status: 'idle' });
  });

  describe('refreshList() — GET /api/me/payment-methods (§3.2)', () => {
    it('fetches the list and maps every card, sorted as the backend sent them', async () => {
      stubRoute('GET', '/api/me/payment-methods', [
        cardBody({ id: 'spm-1', isDefault: true }),
        cardBody({ id: 'spm-2', isDefault: false, last4: '4444' }),
      ]);
      const service = buildService();

      await service.refreshList();

      expect(service.list().map((c) => c.id)).toEqual(['spm-1', 'spm-2']);
      expect(service.list()[0].isDefault).toBe(true);
      expect(service.state()).toEqual({ status: 'idle' });
      expect(requests.some((r) => r.method === 'GET' && r.path === '/api/me/payment-methods')).toBe(
        true,
      );
    });

    it('§1 "ค่า default เมื่อ 401": keeps list=[] and reports an error on a failed request', async () => {
      stubRoute('GET', '/api/me/payment-methods', { title: 'unauthorized', status: 401 }, 401);
      const apiFail = { report: vi.fn() };
      TestBed.configureTestingModule({
        providers: [PaymentMethodService, { provide: ApiFailureReporter, useValue: apiFail }],
      });
      const service = TestBed.inject(PaymentMethodService);

      await service.refreshList();

      expect(service.list()).toEqual([]);
      expect(service.state()).toEqual({ status: 'error', message: 'โหลดรายการบัตรไม่สำเร็จ' });
      expect(apiFail.report).toHaveBeenCalled();
    });
  });

  describe('confirmSaved() — POST /api/me/payment-methods (§3.3)', () => {
    it('sends stripePaymentMethodId and maps the response', async () => {
      stubRoute('POST', '/api/me/payment-methods', cardBody({ id: 'spm-9' }));
      const service = buildService();

      const result = await service.confirmSaved('pm_new');

      expect(result?.id).toBe('spm-9');
      const call = requests.find((r) => r.method === 'POST' && r.path === '/api/me/payment-methods');
      expect(JSON.parse(call?.body ?? '{}')).toEqual({ stripePaymentMethodId: 'pm_new' });
    });

    it('returns null (not a fake saved card) on failure — best-effort caller swallows this', async () => {
      stubRoute('POST', '/api/me/payment-methods', { title: 'not found', status: 404 }, 404);
      const service = buildService();

      await expect(service.confirmSaved('pm_stranger')).resolves.toBeNull();
    });
  });

  describe('setDefault() — POST /api/me/payment-methods/{id}/default (§3.4)', () => {
    it('maps the returned row on success', async () => {
      stubRoute('POST', '/api/me/payment-methods/spm-1/default', cardBody({ isDefault: true }));
      const service = buildService();

      const result = await service.setDefault('spm-1');

      expect(result?.isDefault).toBe(true);
    });

    it('reports the failure and returns null (no caller-level toast for this action)', async () => {
      stubRoute('POST', '/api/me/payment-methods/spm-1/default', { title: 'not found', status: 404 }, 404);
      const apiFail = { report: vi.fn() };
      TestBed.configureTestingModule({
        providers: [PaymentMethodService, { provide: ApiFailureReporter, useValue: apiFail }],
      });
      const service = TestBed.inject(PaymentMethodService);

      await expect(service.setDefault('spm-1')).resolves.toBeNull();
      expect(apiFail.report).toHaveBeenCalled();
    });
  });

  describe('remove() — DELETE /api/me/payment-methods/{id} (§3.5)', () => {
    it('returns true on 204 No Content', async () => {
      stubRoute('DELETE', '/api/me/payment-methods/spm-1', undefined, 204);
      const service = buildService();

      await expect(service.remove('spm-1')).resolves.toBe(true);
    });

    it('returns false (never optimistically reports success) on failure', async () => {
      stubRoute('DELETE', '/api/me/payment-methods/spm-1', { title: 'not found', status: 404 }, 404);
      const service = buildService();

      await expect(service.remove('spm-1')).resolves.toBe(false);
    });
  });

  describe('createSetupIntent() — POST /api/me/payment-methods/setup-intent (§3.6)', () => {
    it('returns the client secret on success', async () => {
      stubRoute('POST', '/api/me/payment-methods/setup-intent', {
        clientSecret: 'seti_123_secret_abc',
      });
      const service = buildService();

      await expect(service.createSetupIntent()).resolves.toBe('seti_123_secret_abc');
    });

    it('returns null (no client secret to hand to Stripe.js) when Stripe is not configured', async () => {
      stubRoute('POST', '/api/me/payment-methods/setup-intent', { title: 'not implemented', status: 501 }, 501);
      const service = buildService();

      await expect(service.createSetupIntent()).resolves.toBeNull();
    });
  });
});

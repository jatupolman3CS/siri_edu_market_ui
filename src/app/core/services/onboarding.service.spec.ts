import { TestBed } from '@angular/core/testing';
import { OnboardingService } from './onboarding.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * registration-onboarding v1 §3.5-3.7 / §4.5.
 *
 * Round 2 (wired): `GET /api/me/onboarding`, `PUT /api/me/onboarding/interests` and
 * `POST /api/me/onboarding/skip` all hit the real, regenerated SDK now (gate 1 confirmed backend
 * matches this contract, snapshot updated) — this spec stubs `fetch` directly (mirrors the pattern
 * in `subscription.service.spec.ts`) rather than the service under test.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  if (body === undefined) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function problemDetails(status: number, title: string) {
  return {
    type: `https://tools.ietf.org/html/rfc9110#section-15.5.5`,
    title,
    status,
    traceId: 'test-trace-id',
  };
}

function buildService(
  apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() },
): OnboardingService {
  TestBed.configureTestingModule({
    providers: [OnboardingService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(OnboardingService);
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const body = await request.clone().text();
    requests.push({ method: request.method, path: url.pathname, body });

    const route = routes.get(`${request.method.toUpperCase()} ${url.pathname}`);
    if (!route) return jsonResponse({ title: 'no stub for this route', status: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('OnboardingService', () => {
  it('getStatus returns completed status and categories', async () => {
    stubRoute('GET', '/api/me/onboarding', {
      isCompleted: true,
      interestCategoryIds: ['cat-1', 'cat-2'],
    });
    const service = buildService();

    const status = await service.getStatus();

    expect(status.isCompleted).toBe(true);
    expect(status.interestCategoryIds).toEqual(['cat-1', 'cat-2']);
  });

  it('getStatus reports error and returns false/empty on failure', async () => {
    stubRoute('GET', '/api/me/onboarding', problemDetails(500, 'Internal Server Error'), 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const status = await service.getStatus();

    expect(apiFail.report).toHaveBeenCalledWith('ดึงข้อมูล Onboarding', expect.anything());
    expect(status.isCompleted).toBe(false);
    expect(status.interestCategoryIds).toEqual([]);
  });

  it('updateInterests sends categoryIds and returns ok: true', async () => {
    stubRoute('PUT', '/api/me/onboarding/interests', {
      isCompleted: true,
      interestCategoryIds: ['cat-1'],
    });
    const service = buildService();

    const res = await service.updateInterests(['cat-1']);

    expect(requests).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        path: '/api/me/onboarding/interests',
        body: JSON.stringify({ categoryIds: ['cat-1'] }),
      }),
    );
    expect(res.ok).toBe(true);
  });

  it('updateInterests returns error when request fails', async () => {
    stubRoute(
      'PUT',
      '/api/me/onboarding/interests',
      problemDetails(400, 'category_not_found'),
      400,
    );
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const res = await service.updateInterests(['invalid-cat']);

    expect(apiFail.report).toHaveBeenCalledWith('บันทึกหมวดหมู่ที่สนใจ', expect.anything());
    expect(res.ok).toBe(false);
  });

  it('skip sends skip request and returns ok: true', async () => {
    stubRoute('POST', '/api/me/onboarding/skip', { isCompleted: true, interestCategoryIds: [] });
    const service = buildService();

    const res = await service.skip();

    expect(requests).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/api/me/onboarding/skip' }),
    );
    expect(res.ok).toBe(true);
  });

  it('skip returns error when request fails', async () => {
    stubRoute('POST', '/api/me/onboarding/skip', problemDetails(401, 'Unauthorized'), 401);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    const res = await service.skip();

    expect(apiFail.report).toHaveBeenCalledWith('ข้าม Onboarding', expect.anything());
    expect(res.ok).toBe(false);
  });
});

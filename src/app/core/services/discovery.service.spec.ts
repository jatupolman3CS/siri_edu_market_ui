import { TestBed } from '@angular/core/testing';
import { DiscoveryService } from './discovery.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1/§3.2/§4.2
 * (round 2 — crm-driven-discovery-fe-wire): `loadPopularTerms()`/`loadDiscovery()` call the real,
 * regenerated `GET /api/marketplace/{popular-searches,discovery}` now (gate 1 confirmed backend
 * matches this contract, snapshot updated) — this spec stubs `fetch` directly (mirrors
 * `platform-stats.service.spec.ts` / `crm.service.spec.ts`) rather than the service under test.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; search: string }[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname, search: url.search });

    const route = routes.get(`${request.method.toUpperCase()} ${url.pathname}`);
    if (!route) return jsonResponse({ title: 'no stub for this route', status: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

function buildService(apiFail: { report: ReturnType<typeof vi.fn> } = { report: vi.fn() }): DiscoveryService {
  TestBed.configureTestingModule({
    providers: [DiscoveryService, { provide: ApiFailureReporter, useValue: apiFail }],
  });
  return TestBed.inject(DiscoveryService);
}

function popularTermRow(term: string, over: Record<string, unknown> = {}) {
  return { term, rank: 1, isRising: false, ...over };
}

function documentRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    slug: id,
    title: `เอกสาร ${id}`,
    price: 99,
    format: 'pdf',
    ...over,
  };
}

function sectionRow(key: string, over: Record<string, unknown> = {}) {
  return {
    key,
    title: 'คณิตศาสตร์ที่คุณสนใจ',
    reason: 'เพราะคุณสนใจคณิตศาสตร์ 3 ครั้งที่ผ่านมา',
    facetType: 'category',
    facetValue: 'cat-1',
    facetLabel: 'คณิตศาสตร์',
    items: [documentRow('doc-1'), documentRow('doc-2'), documentRow('doc-3')],
    ...over,
  };
}

describe('DiscoveryService — loadPopularTerms() (§3.1, round 2)', () => {
  it('starts idle with empty popular terms', () => {
    const service = buildService();

    expect(service.popularTerms()).toEqual([]);
    expect(service.popularPersonalized()).toBe(false);
    expect(service.popularTermsState()).toEqual({ status: 'idle' });
  });

  it('maps items and personalized, and sends Take in the query', async () => {
    stubRoute('GET', '/api/marketplace/popular-searches', {
      items: [popularTermRow('pitch deck', { rank: 1, isRising: true }), popularTermRow('toeic', { rank: 2 })],
      personalized: true,
      windowDays: 7,
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadPopularTerms(5);

    expect(service.popularTerms()).toEqual([
      { term: 'pitch deck', rank: 1, isRising: true },
      { term: 'toeic', rank: 2, isRising: false },
    ]);
    expect(service.popularPersonalized()).toBe(true);
    expect(service.popularTermsState()).toEqual({ status: 'idle' });
    const call = requests.find((r) => r.path === '/api/marketplace/popular-searches');
    expect(call?.search).toContain('Take=5');
  });

  it('AC-19: an empty items response ([] — job not run yet) maps to [] without error', async () => {
    stubRoute('GET', '/api/marketplace/popular-searches', {
      items: [],
      personalized: false,
      windowDays: 7,
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadPopularTerms();

    expect(service.popularTerms()).toEqual([]);
    expect(service.popularTermsState()).toEqual({ status: 'idle' });
  });

  it('a failure falls back to an empty list, reports it, and settles idle (never a stuck error state)', async () => {
    stubRoute('GET', '/api/marketplace/popular-searches', { title: 'Server Error', status: 500 }, 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadPopularTerms();

    expect(service.popularTerms()).toEqual([]);
    expect(service.popularPersonalized()).toBe(false);
    expect(service.popularTermsState()).toEqual({ status: 'idle' });
    expect(apiFail.report).toHaveBeenCalledWith('errors.context.loadPopularSearches', expect.anything());
  });

  it('§4.2 client cache: a second loadPopularTerms() within 5 minutes does not re-fetch', async () => {
    stubRoute('GET', '/api/marketplace/popular-searches', {
      items: [popularTermRow('pitch deck')],
      personalized: false,
      windowDays: 7,
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadPopularTerms();
    const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await service.loadPopularTerms();

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });
});

describe('DiscoveryService — loadDiscovery() (§3.2, round 2)', () => {
  it('starts idle with discovery() === null', () => {
    const service = buildService();

    expect(service.discovery()).toBeNull();
    expect(service.discoveryState()).toEqual({ status: 'idle' });
  });

  it('maps strategy/strategyReason/gatePassed/sections/popularTerms/generatedAt in full', async () => {
    stubRoute('GET', '/api/marketplace/discovery', {
      strategy: 'crm-personalized',
      strategyReason: 'เพราะคุณสนใจคณิตศาสตร์',
      gatePassed: true,
      sections: [sectionRow('interest:category:cat-1')],
      popularTerms: [popularTermRow('pitch deck')],
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadDiscovery();

    const block = service.discovery();
    expect(block?.strategy).toBe('crm-personalized');
    expect(block?.strategyReason).toBe('เพราะคุณสนใจคณิตศาสตร์');
    expect(block?.gatePassed).toBe(true);
    expect(block?.generatedAt).toBe('2026-09-15T00:00:00Z');
    expect(block?.popularTerms).toEqual([{ term: 'pitch deck', rank: 1, isRising: false }]);
    expect(block?.sections).toHaveLength(1);
    expect(block?.sections[0]).toMatchObject({
      key: 'interest:category:cat-1',
      title: 'คณิตศาสตร์ที่คุณสนใจ',
      reason: 'เพราะคุณสนใจคณิตศาสตร์ 3 ครั้งที่ผ่านมา',
      facetType: 'category',
      facetValue: 'cat-1',
      facetLabel: 'คณิตศาสตร์',
    });
    expect(block?.sections[0].items.map((i) => i.id)).toEqual(['doc-1', 'doc-2', 'doc-3']);
  });

  it('maps an unknown/future strategy value to "popular-fallback" defensively (§4.4)', async () => {
    stubRoute('GET', '/api/marketplace/discovery', {
      strategy: 'some-future-strategy',
      strategyReason: 'เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน',
      gatePassed: false,
      sections: [],
      popularTerms: [],
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadDiscovery();

    expect(service.discovery()?.strategy).toBe('popular-fallback');
  });

  it('a section with facetType/facetValue/facetLabel all null (fallback row) maps through as null', async () => {
    stubRoute('GET', '/api/marketplace/discovery', {
      strategy: 'popular-fallback',
      strategyReason: 'เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน',
      gatePassed: false,
      sections: [
        sectionRow('fallback:popular', {
          title: 'ยอดนิยมตอนนี้',
          reason: 'เอกสารที่ผู้ซื้อเลือกมากที่สุดในช่วงนี้',
          facetType: null,
          facetValue: null,
          facetLabel: null,
        }),
      ],
      popularTerms: [],
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadDiscovery();

    expect(service.discovery()?.sections[0]).toMatchObject({
      facetType: null,
      facetValue: null,
      facetLabel: null,
    });
  });

  it('AC-15: sections: [] (no qualifying documents at all) maps to an empty array, not an error', async () => {
    stubRoute('GET', '/api/marketplace/discovery', {
      strategy: 'popular-fallback',
      strategyReason: 'เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน',
      gatePassed: false,
      sections: [],
      popularTerms: [],
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadDiscovery();

    expect(service.discovery()?.sections).toEqual([]);
  });

  it('a failure falls back to discovery() === null, reports it, and settles idle', async () => {
    stubRoute('GET', '/api/marketplace/discovery', { title: 'Server Error', status: 500 }, 500);
    const apiFail = { report: vi.fn() };
    const service = buildService(apiFail);

    await service.loadDiscovery();

    expect(service.discovery()).toBeNull();
    expect(service.discoveryState()).toEqual({ status: 'idle' });
    expect(apiFail.report).toHaveBeenCalledWith('errors.context.loadDiscovery', expect.anything());
  });

  it('§4.2 client cache: a second loadDiscovery() within 5 minutes does not re-fetch', async () => {
    stubRoute('GET', '/api/marketplace/discovery', {
      strategy: 'popular-fallback',
      strategyReason: 'เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน',
      gatePassed: false,
      sections: [],
      popularTerms: [],
      generatedAt: '2026-09-15T00:00:00Z',
    });
    const service = buildService();

    await service.loadDiscovery();
    const callsAfterFirst = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await service.loadDiscovery();

    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFirst);
  });
});

import { TestBed } from '@angular/core/testing';
import { BundleService, calcBundleSavePercent, calcBundleSaveAmount } from './bundle.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * document-bundle-cross-sell v1 (round 2 — SDK wired, spec §3.1 / §4):
 *  - `loadBundlesContainingDocument` calls the real
 *    `GET /api/marketplace/documents/{id}/bundles`, maps `BundleResponse[]` through `mapBundle`,
 *    and never throws — errors resolve to `[]` (the document-detail page loads this
 *    non-blocking and just hides the section on failure, per spec §4).
 *  - `calcBundleSavePercent` / `calcBundleSaveAmount` are the pure functions the page uses to
 *    build the "ประหยัด N%" badge and "ประหยัด ฿{n}" line, kept out of the template per §4.
 */

type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;

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
  return { items, page: 1, pageSize: 12, totalCount: items.length, totalPages: 1 };
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;

  // BundleService's constructor fires an initial `refreshBundles()` — stub it so that call
  // resolves quietly instead of hitting the "no stub" 404 path in every test.
  stubRoute('GET', '/api/marketplace/bundles', pagedResponse([]));
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

function buildService(): BundleService {
  TestBed.configureTestingModule({
    providers: [BundleService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(BundleService);
}

describe('BundleService — loadBundlesContainingDocument (SDK wired)', () => {
  it('calls GET /api/marketplace/documents/{id}/bundles and maps the response through mapBundle', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/documents/doc-1/bundles',
      pagedResponse([
        {
          id: 'bun-1',
          slug: 'bun-1',
          title: 'แพ็กคุ้ม',
          description: 'รวมเอกสารคุ้ม ๆ',
          coverUrl: 'https://example.test/cover.jpg',
          price: 150,
          originalPrice: 200,
          documentCount: 3,
          averageRating: 4.5,
          reviewCount: 10,
          downloads: 99,
          sellerId: 'seller-1',
          sellerName: 'ครูเอ',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ]),
    );
    const service = buildService();

    const result = await service.loadBundlesContainingDocument('doc-1');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('bun-1');
    expect(result[0].title).toBe('แพ็กคุ้ม');
    expect(result[0].price).toBe(150);
    expect(result[0].originalPrice).toBe(200);
    expect(result[0].documentCount).toBe(3);
  });

  it('sends limit as PageSize and Page=1', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1/bundles', pagedResponse([]));
    const service = buildService();

    await service.loadBundlesContainingDocument('doc-1', 5);

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const call = calls.find((args) => {
      const req = args[0];
      const url = req instanceof Request ? req.url : String(req);
      return url.includes('/documents/doc-1/bundles');
    });
    expect(call).toBeDefined();
    const req = call?.[0] as Request;
    const url = new URL(req.url);
    expect(url.searchParams.get('Page')).toBe('1');
    expect(url.searchParams.get('PageSize')).toBe('5');
  });

  it('resolves to [] instead of throwing when the request fails (e.g. 404)', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/documents/doc-missing/bundles',
      { title: 'Not Found', status: 404, statusCode: 404 },
      404,
    );
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [BundleService, { provide: ApiFailureReporter, useValue: apiFail }],
    });
    const service = TestBed.inject(BundleService);

    const result = await service.loadBundlesContainingDocument('doc-missing');

    expect(result).toEqual([]);
    expect(apiFail.report).toHaveBeenCalled();
  });

  it('resolves to [] when the document has no bundles (empty items)', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1/bundles', pagedResponse([]));
    const service = buildService();

    const result = await service.loadBundlesContainingDocument('doc-1');

    expect(result).toEqual([]);
  });
});

describe('BundleService — loadBundleDetail / getDocuments (Q-04)', () => {
  it('fetches GET /api/marketplace/bundles/{id} and caches its member documents', async () => {
    stubRoute('GET', '/api/marketplace/bundles/bun-1', {
      id: 'bun-1',
      slug: 'bun-1',
      title: 'แพ็กคุ้ม',
      description: 'รวมเอกสารคุ้ม ๆ',
      coverUrl: 'https://example.test/cover.jpg',
      price: 150,
      originalPrice: 200,
      averageRating: 4.5,
      reviewCount: 10,
      downloads: 99,
      createdAt: '2026-01-01T00:00:00Z',
      seller: {
        id: 'seller-1',
        studioName: 'ครูเอ',
        ownerName: 'ครูเอ',
        totalDocuments: 12,
      },
      documents: [
        { id: 'doc-1', slug: 'doc-1', title: 'เอกสาร 1', price: 80 },
        { id: 'doc-2', slug: 'doc-2', title: 'เอกสาร 2', price: 90 },
      ],
    });
    const service = buildService();

    expect(service.getById('bun-1')).toBeUndefined();
    expect(service.getDocuments('bun-1')).toEqual([]);

    service.loadBundleDetail('bun-1');
    await vi.waitFor(() => expect(service.getDocuments('bun-1')).toHaveLength(2));

    const documents = service.getDocuments('bun-1');
    expect(documents.map((d) => d.id)).toEqual(['doc-1', 'doc-2']);
    expect(documents[0].title).toBe('เอกสาร 1');

    const bundle = service.getById('bun-1');
    expect(bundle?.title).toBe('แพ็กคุ้ม');
    expect(bundle?.documentIds).toEqual(['doc-1', 'doc-2']);
    expect(bundle?.documentCount).toBe(2);
    expect(bundle?.seller.studioName).toBe('ครูเอ');
    expect(bundle?.seller.totalDocuments).toBe(12);
  });

  it('reports the failure and leaves the caches empty when the request fails', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/bundles/bun-missing',
      { title: 'Not Found', status: 404, statusCode: 404 },
      404,
    );
    const apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [BundleService, { provide: ApiFailureReporter, useValue: apiFail }],
    });
    const service = TestBed.inject(BundleService);

    service.loadBundleDetail('bun-missing');
    await vi.waitFor(() => expect(apiFail.report).toHaveBeenCalled());

    expect(service.getDocuments('bun-missing')).toEqual([]);
    expect(service.getById('bun-missing')).toBeUndefined();
  });

  it('is a no-op for an empty id', () => {
    const service = buildService();
    expect(() => service.loadBundleDetail('')).not.toThrow();
  });
});

describe('calcBundleSavePercent', () => {
  it('rounds (1 - price/originalPrice) * 100', () => {
    expect(calcBundleSavePercent(75, 100)).toBe(25);
  });

  it('returns 0 when originalPrice === price', () => {
    expect(calcBundleSavePercent(100, 100)).toBe(0);
  });

  it('returns 0 when originalPrice < price', () => {
    expect(calcBundleSavePercent(120, 100)).toBe(0);
  });
});

describe('calcBundleSaveAmount', () => {
  it('returns originalPrice - price when positive', () => {
    expect(calcBundleSaveAmount(75, 100)).toBe(25);
  });

  it('clamps to 0 when originalPrice <= price', () => {
    expect(calcBundleSaveAmount(100, 100)).toBe(0);
    expect(calcBundleSaveAmount(120, 100)).toBe(0);
  });
});

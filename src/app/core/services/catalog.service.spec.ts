import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

/**
 * F-14: CatalogService is the largest service in the app and had no spec, while carrying all
 * three bugs S-08 fixed.
 *
 * The regressions these guard against are the ones that only appear on a deep link or an F5,
 * which is exactly the path nobody exercises by clicking through from the home page:
 *   B-01  /categories never loaded anything
 *   B-02  a category fetched successfully was thrown away by a map()-only cache update, so
 *         getCategoryBySlug reported a 404 the server never sent
 *   B-03  a storefront filtered the home-page cache instead of asking the server
 */
type Route = { status?: number; body: unknown; delayMs?: number };

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

/** Q-07 item 2: like stubRoute, but resolves after `delayMs` — used to force a real race. */
function stubRouteDelayed(method: string, path: string, body: unknown, delayMs: number): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status: 200, delayMs });
}

function categoryDetail(over: Record<string, unknown> = {}) {
  return {
    id: 'math',
    slug: 'math',
    name: 'คณิตศาสตร์',
    description: 'หมวดคณิต',
    icon: '🔢',
    documentCount: 12,
    subcategories: [],
    ...over,
  };
}

function searchPage(items: unknown[] = []) {
  return { items, page: 1, pageSize: 24, totalCount: items.length, totalPages: 1 };
}

function documentRow(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    slug: id,
    title: `เอกสาร ${id}`,
    shortDescription: '',
    price: 100,
    isFree: false,
    format: 'pdf',
    resourceType: 'worksheet',
    averageRating: 4,
    reviewCount: 2,
    downloadCount: 10,
    categoryIds: ['math'],
    seller: { id: 'seller-1', studioName: 'Siri Studio' },
    createdAt: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function buildService(): CatalogService {
  TestBed.configureTestingModule({
    providers: [CatalogService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return TestBed.inject(CatalogService);
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
    if (route.delayMs) await new Promise((resolve) => setTimeout(resolve, route.delayMs));
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('CatalogService — category deep links (S-08 / B-02)', () => {
  it('keeps a category fetched on a cold cache instead of dropping it', async () => {
    // B-02 exactly: the cache is empty, as it is on a deep link, and the old map()-only update
    // discarded the category that had just arrived.
    stubRoute('GET', '/api/marketplace/categories/math', categoryDetail());
    const catalog = buildService();

    const loaded = await catalog.loadCategoryDetailBySlug('math');
    await settle();

    expect(loaded?.slug).toBe('math');
    expect(catalog.getCategoryBySlug('math')).toBeDefined();
  });

  it('does not report a 404 the server never sent', async () => {
    stubRoute('GET', '/api/marketplace/categories/math', categoryDetail());
    const catalog = buildService();

    await catalog.loadCategoryDetailBySlug('math');
    await settle();

    expect(catalog.getCategoryBySlug('math')?.name).toBe('คณิตศาสตร์');
  });

  it('updates a category already in the cache rather than duplicating it', async () => {
    stubRoute('GET', '/api/marketplace/categories/math', categoryDetail({ name: 'คณิตศาสตร์ (แก้)' }));
    const catalog = buildService();

    await catalog.loadCategoryDetailBySlug('math');
    await catalog.loadCategoryDetailBySlug('math');
    await settle();

    expect(catalog.categories().filter((c) => c.id === 'math')).toHaveLength(1);
    expect(catalog.getCategoryBySlug('math')?.name).toBe('คณิตศาสตร์ (แก้)');
  });

  it('hydrates the subcategories that came with the category', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/categories/math',
      categoryDetail({
        subcategories: [{ id: 'algebra', slug: 'algebra', name: 'พีชคณิต', documentCount: 3 }],
      }),
    );
    const catalog = buildService();

    await catalog.loadCategoryDetailBySlug('math');
    await settle();

    expect(catalog.getSubcategoryById('algebra')?.name).toBe('พีชคณิต');
  });

  it('reports a real failure instead of pretending the category is missing', async () => {
    stubRoute('GET', '/api/marketplace/categories/math', { status: 500 }, 500);
    const catalog = buildService();

    const loaded = await catalog.loadCategoryDetailBySlug('math');
    await settle();

    expect(loaded).toBeNull();
    expect(catalog.categoryDetailState().status).toBe('error');
  });

  it('does not call the API for an empty slug', async () => {
    const catalog = buildService();

    const loaded = await catalog.loadCategoryDetailBySlug('');

    expect(loaded).toBeNull();
    expect(requests.some((r) => r.path.startsWith('/api/marketplace/categories/'))).toBe(false);
  });
});

describe('CatalogService — loading the category list (S-08 / B-01)', () => {
  it('ensureCategories fetches once and not again after it succeeds', async () => {
    // /categories used to render an empty array forever because nothing called this. The guard
    // matters because four pages now do.
    stubRoute('GET', '/api/marketplace/categories', [categoryDetail()]);
    const catalog = buildService();

    catalog.ensureCategories();
    await settle();
    catalog.ensureCategories();
    await settle();

    const calls = requests.filter(
      (r) => r.method === 'GET' && r.path === '/api/marketplace/categories',
    );
    expect(calls).toHaveLength(1);
    expect(catalog.categories().length).toBe(1);
  });

  it('ensureCategories retries after a failure rather than staying empty forever', async () => {
    stubRoute('GET', '/api/marketplace/categories', { status: 500 }, 500);
    const catalog = buildService();

    catalog.ensureCategories();
    await settle();
    expect(catalog.categoriesState().status).toBe('error');

    stubRoute('GET', '/api/marketplace/categories', [categoryDetail()]);
    catalog.ensureCategories();
    await settle();

    expect(catalog.categories().length).toBe(1);
  });
});

describe('CatalogService — initForHome (Q-07 item 1, re-broke B-01)', () => {
  it('loads categories, not just the document list — home page reads categories() too', async () => {
    // initForHome() called syncListWithBackend() only; loadCategories() was never wired in
    // (unlike initForMarketplace(), which calls both), so the home page's "หมวดหมู่" section
    // stayed empty forever even though S-08 had already fixed the deep-link case via
    // ensureCategories().
    stubRoute('GET', '/api/marketplace/categories', [categoryDetail()]);
    stubRoute('GET', '/api/marketplace/catalog', { documents: searchPage([]) });
    const catalog = buildService();

    catalog.initForHome();
    await settle();

    expect(catalog.categories().length).toBe(1);
  });
});

describe('CatalogService — catalog vs search response race (Q-07 item 2)', () => {
  it('a slow initial /catalog response does not clobber a faster, newer /search response', async () => {
    // Simulates: the page loads (kicks off /catalog), and the user types a search keyword
    // before that /catalog response arrives. Every marketplace tab badge (marketplace.page.ts
    // `tabs()`) reads `documents()`/`freeResources()`/etc, all derived from the same
    // `_documents` signal — so if the slow /catalog response was allowed to win, it silently
    // clobbered the fresher /search result back to the pre-search document set, most visibly on
    // the "ทั้งหมด" badge since it reads the raw, unfiltered length.
    stubRouteDelayed(
      'GET',
      '/api/marketplace/catalog',
      { documents: searchPage([documentRow('doc-1'), documentRow('doc-2')]) },
      500,
    );
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-3')]));
    const catalog = buildService();

    catalog.loadCatalog(); // slow /catalog fetch starts (in flight for 500ms)
    catalog.setFilters({ search: 'คณิต' }); // debounced 320ms, then a fast /search fetch

    await new Promise((resolve) => setTimeout(resolve, 900)); // both requests have long settled

    expect(catalog.documents().map((d) => d.id)).toEqual(['doc-3']);
  });
});

describe('CatalogService — storefront documents (S-08 / B-03)', () => {
  it('asks the server for one seller instead of filtering the cached page', async () => {
    // B-03: a storefront opened directly showed nothing, because the shared cache only ever
    // held the home/marketplace page. The fix was a server-side SellerId filter.
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.loadSellerDocuments('seller-1');
    await settle();

    const search = requests.find((r) => r.path === '/api/marketplace/search');
    expect(search).toBeDefined();
    expect(search!.query.get('SellerId')).toBe('seller-1');
  });

  it('keeps the seller list separate from the shared marketplace list', async () => {
    // Kept out of documents() on purpose: a storefront must not overwrite what the marketplace
    // page is showing.
    stubRoute(
      'GET',
      '/api/marketplace/search',
      searchPage([documentRow('doc-1'), documentRow('doc-2')]),
    );
    const catalog = buildService();

    catalog.loadSellerDocuments('seller-1');
    await settle();

    expect(catalog.sellerDocuments().length).toBe(2);
    expect(catalog.documents().length).toBe(0);
  });

  it('empties the seller list rather than leaving the previous seller on screen', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.loadSellerDocuments('seller-1');
    await settle();
    expect(catalog.sellerDocuments().length).toBe(1);

    catalog.loadSellerDocuments('');
    await settle();

    expect(catalog.sellerDocuments()).toEqual([]);
  });

  it('reports a failed storefront load instead of showing an empty shop', async () => {
    stubRoute('GET', '/api/marketplace/search', { status: 500 }, 500);
    const catalog = buildService();

    catalog.loadSellerDocuments('seller-1');
    await settle();

    expect(catalog.sellerDocumentsState().status).toBe('error');
    expect(catalog.sellerDocuments()).toEqual([]);
  });

  it('scopes a category page to the category on the server too', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.loadCategoryDocuments('math');
    await settle();

    const search = requests.find((r) => r.path === '/api/marketplace/search');
    expect(search!.query.get('CategoryId')).toBe('math');
    expect(catalog.categoryDocuments().length).toBe(1);
  });
});

describe('CatalogService — document preview and questions (F-01)', () => {
  it('loads a preview through the service rather than the page', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1/preview', {
      documentId: 'doc-1',
      previewImageUrls: ['https://cdn/p1.jpg'],
    });
    const catalog = buildService();

    const preview = await catalog.loadDocumentPreview('doc-1');

    expect(preview.previewImageUrls).toEqual(['https://cdn/p1.jpg']);
  });

  it('submits a question to the document it was asked on', async () => {
    stubRoute('POST', '/api/marketplace/documents/doc-1/qna', null, 204);
    const catalog = buildService();

    await catalog.askDocumentQuestion('doc-1', 'ไฟล์แก้ไขได้ไหมคะ');

    expect(
      requests.some(
        (r) => r.method === 'POST' && r.path === '/api/marketplace/documents/doc-1/qna',
      ),
    ).toBe(true);
  });

  it('lets a failed question surface rather than swallowing it', async () => {
    stubRoute('POST', '/api/marketplace/documents/doc-1/qna', { status: 500 }, 500);
    const catalog = buildService();

    await expect(catalog.askDocumentQuestion('doc-1', 'คำถาม')).rejects.toBeDefined();
  });

  it('reports a document report to the right document (F-09)', async () => {
    stubRoute('POST', '/api/marketplace/documents/doc-1/report', null, 204);
    const catalog = buildService();

    await catalog.reportDocument('doc-1', 'copyright', 'เอกสารนี้เป็นของฉัน');

    expect(
      requests.some(
        (r) => r.method === 'POST' && r.path === '/api/marketplace/documents/doc-1/report',
      ),
    ).toBe(true);
  });
});

describe('CatalogService — marketplace results panel (marketplace-paged-results v1)', () => {
  it('AC-1/AC-2: resetFilters() loads page 1 from /marketplace/search with default page size 24', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.resetFilters();
    await settle();

    const search = requests.find((r) => r.path === '/api/marketplace/search');
    expect(search).toBeDefined();
    expect(search!.query.get('Page')).toBe('1');
    expect(search!.query.get('PageSize')).toBe('24');
    expect(catalog.marketplaceResults().map((d) => d.id)).toEqual(['doc-1']);
  });

  it('AC-2: applying a search term resets to page 1 even from another page', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1'), documentRow('doc-2')]));
    const catalog = buildService();

    catalog.resetFilters();
    await settle();
    // response must echo page 2 back — the stub's `searchPage()` helper hardcodes page: 1,
    // which would otherwise mask whether the pager actually moved to page 2.
    stubRoute('GET', '/api/marketplace/search', {
      items: [documentRow('doc-2')],
      page: 2,
      pageSize: 24,
      totalCount: 2,
      totalPages: 1,
    });
    catalog.loadMarketplaceResultsPage(2);
    await settle();
    expect(catalog.marketplaceResultsPage()).toBe(2);

    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-3')]));
    catalog.setFilters({ search: 'คณิต' }); // debounced 320ms (search-only patch)
    await new Promise((resolve) => setTimeout(resolve, 500));

    const last = requests.filter((r) => r.path === '/api/marketplace/search').pop();
    expect(last!.query.get('Q')).toBe('คณิต');
    expect(last!.query.get('Page')).toBe('1');
    expect(catalog.marketplaceResultsPage()).toBe(1);
  });

  it('AC-3: loading the results panel does not touch documents()/newArrivals()', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    stubRoute('GET', '/api/marketplace/catalog', { documents: searchPage([]) });
    const catalog = buildService();

    catalog.setTab('all');
    await settle();

    expect(catalog.documents()).toEqual([]);
    expect(catalog.newArrivals()).toEqual([]);
  });

  it('AC-4: changing a filter resets the results panel to page 1 and refetches', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.resetFilters();
    await settle();
    catalog.loadMarketplaceResultsPage(1);
    await settle();

    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-2')]));
    catalog.setFilters({ freeOnly: true });
    await settle();

    expect(catalog.marketplaceResultsPage()).toBe(1);
    expect(catalog.marketplaceResults().map((d) => d.id)).toEqual(['doc-2']);
  });

  it('AC-5: loadMarketplaceResultsPage requests a new page without resetting filters', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.resetFilters();
    await settle();
    catalog.setFilters({ freeOnly: true });
    await settle();

    catalog.loadMarketplaceResultsPage(2);
    await settle();

    const last = requests.filter((r) => r.path === '/api/marketplace/search').pop();
    expect(last!.query.get('Page')).toBe('2');
    expect(last!.query.get('FreeOnly')).toBe('true');
  });

  it('AC-6: setMarketplacePageSize fetches with the new page size and resets to page 1', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1')]));
    const catalog = buildService();

    catalog.resetFilters();
    await settle();
    catalog.loadMarketplaceResultsPage(2);
    await settle();

    // response must echo pageSize: 48 back — the stub's `searchPage()` helper hardcodes
    // pageSize: 24, which would otherwise mask whether the pager state actually updated.
    stubRoute('GET', '/api/marketplace/search', {
      items: [documentRow('doc-1')],
      page: 1,
      pageSize: 48,
      totalCount: 1,
      totalPages: 1,
    });
    catalog.setMarketplacePageSize(48);
    await settle();

    const last = requests.filter((r) => r.path === '/api/marketplace/search').pop();
    expect(last!.query.get('PageSize')).toBe('48');
    expect(last!.query.get('Page')).toBe('1');
    expect(catalog.marketplaceResultsPage()).toBe(1);
    expect(catalog.marketplaceResultsPageSize()).toBe(48);
  });

  it('AC-8: an error surfaces in marketplaceResultsState and retry re-fetches the same (not page-1) page', async () => {
    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-1'), documentRow('doc-2')]));
    const catalog = buildService();

    catalog.resetFilters();
    await settle();
    catalog.loadMarketplaceResultsPage(2);
    await settle();

    stubRoute('GET', '/api/marketplace/search', { status: 500 }, 500);
    catalog.loadMarketplaceResultsPage(3);
    await settle();

    expect(catalog.marketplaceResultsState().status).toBe('error');

    stubRoute('GET', '/api/marketplace/search', searchPage([documentRow('doc-9')]));
    catalog.retryMarketplaceResults();
    await settle();

    const last = requests.filter((r) => r.path === '/api/marketplace/search').pop();
    expect(last!.query.get('Page')).toBe('3');
    expect(catalog.marketplaceResultsState().status).toBe('idle');
    expect(catalog.marketplaceResults().map((d) => d.id)).toEqual(['doc-9']);
  });
});

describe('CatalogService — document detail 404 vs generic failure (QA bug #8)', () => {
  it('flags documentDetailNotFound (not a generic error) on a real 404', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/documents/missing-doc',
      { title: 'Not Found', status: 404 },
      404,
    );
    const catalog = buildService();

    catalog.loadDocumentDetail('missing-doc');
    await settle();

    expect(catalog.documentDetailNotFound()).toBe(true);
    expect(catalog.documentDetailState().status).toBe('error');
  });

  it('does not flag documentDetailNotFound on a real (retryable) server failure', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/documents/doc-1',
      { title: 'Server Error', status: 500 },
      500,
    );
    const catalog = buildService();

    catalog.loadDocumentDetail('doc-1');
    await settle();

    expect(catalog.documentDetailNotFound()).toBe(false);
    expect(catalog.documentDetailState().status).toBe('error');
  });

  it('clears a stale documentDetailNotFound flag once a load succeeds', async () => {
    stubRoute(
      'GET',
      '/api/marketplace/documents/missing-doc',
      { title: 'Not Found', status: 404 },
      404,
    );
    const catalog = buildService();
    catalog.loadDocumentDetail('missing-doc');
    await settle();
    expect(catalog.documentDetailNotFound()).toBe(true);

    stubRoute('GET', '/api/marketplace/documents/doc-1', {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสาร doc-1',
    });
    catalog.loadDocumentDetail('doc-1');
    await settle();

    expect(catalog.documentDetailNotFound()).toBe(false);
    expect(catalog.documentDetailState().status).toBe('idle');
    expect(catalog.getById('doc-1')?.title).toBe('เอกสาร doc-1');
  });
});

describe('CatalogService — loadDocumentDetail entrySource + view-tracking (seller-analytics-insights v1 round 2, AC-16)', () => {
  it('accepts an optional entrySource without changing document-detail loading behavior', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1', {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสาร doc-1',
    });
    stubRoute('POST', '/api/marketplace/documents/doc-1/view', null, 204);
    const catalog = buildService();

    catalog.loadDocumentDetail('doc-1', { source: 'search', searchTerm: 'เลข ม.3' });
    await settle();

    expect(catalog.getById('doc-1')?.title).toBe('เอกสาร doc-1');
    expect(catalog.documentDetailState().status).toBe('idle');
  });

  it('still loads correctly when entrySource is omitted (AC-19 fallback: no source sent is fine)', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1', {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสาร doc-1',
    });
    stubRoute('POST', '/api/marketplace/documents/doc-1/view', null, 204);
    const catalog = buildService();

    catalog.loadDocumentDetail('doc-1');
    await settle();

    expect(catalog.getById('doc-1')?.title).toBe('เอกสาร doc-1');
  });

  it('AC-16: fires exactly one POST .../view request after a successful document load', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1', {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสาร doc-1',
    });
    stubRoute('POST', '/api/marketplace/documents/doc-1/view', null, 204);
    const catalog = buildService();

    // The page renders off documentDetailState() the instant the GET resolves — logDocumentView()
    // is fired without being awaited, so the caller never blocks on this second request.
    catalog.loadDocumentDetail('doc-1', { source: 'direct' });
    await settle();

    expect(catalog.documentDetailState().status).toBe('idle');
    const viewRequests = requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/marketplace/documents/doc-1/view',
    );
    expect(viewRequests.length).toBe(1);
  });

  it('AC-16: a failed view-tracking call never surfaces as an error and is not retried', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1', {
      id: 'doc-1',
      slug: 'doc-1',
      title: 'เอกสาร doc-1',
    });
    stubRoute('POST', '/api/marketplace/documents/doc-1/view', { status: 500 }, 500);
    const catalog = buildService();

    catalog.loadDocumentDetail('doc-1', { source: 'direct' });
    await settle();

    // The document itself still loaded fine — a broken analytics call must never flip this to 'error'.
    expect(catalog.documentDetailState().status).toBe('idle');
    const viewRequests = requests.filter(
      (r) => r.method === 'POST' && r.path === '/api/marketplace/documents/doc-1/view',
    );
    expect(viewRequests.length).toBe(1);
  });

  it('a failed document load never attempts view-tracking either (only a successful load counts as a view)', async () => {
    stubRoute('GET', '/api/marketplace/documents/doc-1', { status: 500 }, 500);
    const catalog = buildService();

    catalog.loadDocumentDetail('doc-1', { source: 'search', searchTerm: 'math' });
    await settle();

    expect(catalog.documentDetailState().status).toBe('error');
    expect(requests.some((r) => r.path.endsWith('/view'))).toBe(false);
  });
});

describe('CatalogService — loadRecommended (personalized-recommendations v1, round 2)', () => {
  it('populates recommended and recommendedStrategy from a "purchase-history" response', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [documentRow('doc-1'), documentRow('doc-2')],
      strategy: 'purchase-history',
    });
    const catalog = buildService();

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommended().map((d) => d.id)).toEqual(['doc-1', 'doc-2']);
    expect(catalog.recommendedStrategy()).toBe('purchase-history');
    const last = requests.filter((r) => r.path === '/api/marketplace/recommended').pop();
    expect(last!.query.get('Take')).toBe('8');
  });

  it('populates recommended and recommendedStrategy from a "popular-fallback" response', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [documentRow('doc-9')],
      strategy: 'popular-fallback',
    });
    const catalog = buildService();

    catalog.loadRecommended(4);
    await settle();

    expect(catalog.recommended().map((d) => d.id)).toEqual(['doc-9']);
    expect(catalog.recommendedStrategy()).toBe('popular-fallback');
    const last = requests.filter((r) => r.path === '/api/marketplace/recommended').pop();
    expect(last!.query.get('Take')).toBe('4');
  });

  it('treats an empty items response as "no section" without touching recommendedStrategy incorrectly', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [],
      strategy: 'popular-fallback',
    });
    const catalog = buildService();

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommended()).toEqual([]);
    expect(catalog.recommendedStrategy()).toBe('popular-fallback');
  });

  it('on failure, clears both signals and reports via ApiFailureReporter (no throw, no toast of its own)', async () => {
    stubRoute('GET', '/api/marketplace/recommended', { title: 'Server Error', status: 500 }, 500);
    const catalog = buildService();
    const reporter = TestBed.inject(ApiFailureReporter);

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommended()).toEqual([]);
    expect(catalog.recommendedStrategy()).toBeNull();
    expect(reporter.report).toHaveBeenCalledWith('โหลดคำแนะนำสำหรับคุณ', expect.anything());
  });

  it('a later failed reload clears out a previously-successful recommendation list', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [documentRow('doc-1')],
      strategy: 'purchase-history',
    });
    const catalog = buildService();
    catalog.loadRecommended();
    await settle();
    expect(catalog.recommended().length).toBe(1);

    stubRoute('GET', '/api/marketplace/recommended', { title: 'Server Error', status: 500 }, 500);
    catalog.loadRecommended();
    await settle();

    expect(catalog.recommended()).toEqual([]);
    expect(catalog.recommendedStrategy()).toBeNull();
  });
});

describe('CatalogService — loadRecommended strategy widening (crm-driven-discovery v1 §3.3/§4.2/§4.4)', () => {
  it.each(['crm-personalized', 'declared-interest'] as const)(
    'passes a known %s strategy straight through (4-value union, round 1)',
    async (strategy) => {
      stubRoute('GET', '/api/marketplace/recommended', {
        items: [documentRow('doc-1')],
        strategy,
      });
      const catalog = buildService();

      catalog.loadRecommended();
      await settle();

      expect(catalog.recommendedStrategy()).toBe(strategy);
    },
  );

  it('maps an unknown/future strategy value to "popular-fallback" defensively', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [documentRow('doc-1')],
      strategy: 'some-future-strategy',
    });
    const catalog = buildService();

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommendedStrategy()).toBe('popular-fallback');
  });

  it('§3.3 maps strategyReason/gatePassed and builds the explanations Map keyed by documentId', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [documentRow('doc-1'), documentRow('doc-2')],
      strategy: 'crm-personalized',
      strategyReason: 'เพราะคุณสนใจคณิตศาสตร์',
      gatePassed: true,
      explanations: [
        {
          documentId: 'doc-1',
          reason: 'เพราะคุณสนใจคณิตศาสตร์',
          relevanceScore: 0.72,
          matchedFacetType: 'category',
          matchedFacetValue: 'cat-1',
          matchedFacetLabel: 'คณิตศาสตร์',
        },
      ],
    });
    const catalog = buildService();

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommendedReason()).toBe('เพราะคุณสนใจคณิตศาสตร์');
    expect(catalog.recommendedGatePassed()).toBe(true);
    expect(catalog.recommendedExplanations()).toEqual(
      new Map([
        [
          'doc-1',
          {
            documentId: 'doc-1',
            reason: 'เพราะคุณสนใจคณิตศาสตร์',
            relevanceScore: 0.72,
            matchedFacetType: 'category',
            matchedFacetValue: 'cat-1',
            matchedFacetLabel: 'คณิตศาสตร์',
          },
        ],
      ]),
    );
    // §3.3 "ต้องทนกรณีหาไม่เจอ": doc-2 has no explanation row — lookup must not throw.
    expect(catalog.recommendedExplanations().get('doc-2')).toBeUndefined();
  });

  it('§3.3 "popular-fallback" branch: strategyReason/gatePassed=false and explanations stays empty', async () => {
    stubRoute('GET', '/api/marketplace/recommended', {
      items: [documentRow('doc-9')],
      strategy: 'popular-fallback',
      strategyReason: 'เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน',
      gatePassed: false,
      explanations: [],
    });
    const catalog = buildService();

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommendedReason()).toBe('เอกสารยอดนิยมที่ผู้ซื้อคนอื่นเลือกกัน');
    expect(catalog.recommendedGatePassed()).toBe(false);
    expect(catalog.recommendedExplanations()).toEqual(new Map());
  });

  it('resets recommendedReason/recommendedGatePassed/recommendedExplanations to their empty defaults on failure', async () => {
    stubRoute('GET', '/api/marketplace/recommended', { title: 'Server Error', status: 500 }, 500);
    const catalog = buildService();

    catalog.loadRecommended();
    await settle();

    expect(catalog.recommendedReason()).toBe('');
    expect(catalog.recommendedGatePassed()).toBe(false);
    expect(catalog.recommendedExplanations()).toEqual(new Map());
  });
});

describe('CatalogService — seller follower count & profile cache', () => {
  it('updateSellerFollowerCount only mutates sellerProfile if sellerId matches', async () => {
    stubRoute('GET', '/api/sellers/seller-1/profile', {
      id: 'seller-1',
      studioName: 'Studio 1',
      followerCount: 10,
    });
    const catalog = buildService();

    await catalog.loadSellerProfile('seller-1');
    expect(catalog.sellerProfile()?.followerCount).toBe(10);

    // Call updateSellerFollowerCount for a DIFFERENT seller
    catalog.updateSellerFollowerCount(1, 'seller-2');
    expect(catalog.sellerProfile()?.followerCount).toBe(10); // unaffected!

    // Call updateSellerFollowerCount for matching seller
    catalog.updateSellerFollowerCount(1, 'seller-1');
    expect(catalog.sellerProfile()?.followerCount).toBe(11); // incremented!

    // Call updateSellerFollowerCount without sellerId (targets current profile)
    catalog.updateSellerFollowerCount(-1);
    expect(catalog.sellerProfile()?.followerCount).toBe(10); // decremented!
  });

  it('updateSellerFollowerCount updates sellerProfiles cache', async () => {
    stubRoute('GET', '/api/sellers/seller-1/profile', {
      id: 'seller-1',
      studioName: 'Studio 1',
      followerCount: 5,
    });
    const catalog = buildService();

    await catalog.fetchSellerProfile('seller-1');
    expect(catalog.sellerProfiles().get('seller-1')?.followerCount).toBe(5);

    catalog.updateSellerFollowerCount(1, 'seller-1');
    expect(catalog.sellerProfiles().get('seller-1')?.followerCount).toBe(6);
  });

  it('fetchSellerProfile deduplicates concurrent in-flight requests for the same seller', async () => {
    stubRouteDelayed('GET', '/api/sellers/seller-race/profile', {
      id: 'seller-race',
      studioName: 'Race Studio',
      followerCount: 3,
    }, 50);
    const catalog = buildService();

    const p1 = catalog.fetchSellerProfile('seller-race');
    const p2 = catalog.fetchSellerProfile('seller-race');
    const [res1, res2] = await Promise.all([p1, p2]);

    expect(res1?.studioName).toBe('Race Studio');
    expect(res2?.studioName).toBe('Race Studio');
    const profileCalls = requests.filter((r) => r.path === '/api/sellers/seller-race/profile');
    expect(profileCalls.length).toBe(1);
  });

  it('fetchSellerProfile negative-caches 404 so subsequent calls do not re-request', async () => {
    stubRoute('GET', '/api/sellers/seller-404/profile', { status: 404, message: 'Not found' }, 404);
    const catalog = buildService();

    const first = await catalog.fetchSellerProfile('seller-404');
    expect(first).toBeNull();

    const second = await catalog.fetchSellerProfile('seller-404');
    expect(second).toBeNull();

    const profileCalls = requests.filter((r) => r.path === '/api/sellers/seller-404/profile');
    expect(profileCalls.length).toBe(1);
  });

  it('loadSellerProfilesForDocuments deduplicates and skips failed or cached sellers', async () => {
    stubRoute('GET', '/api/sellers/s-fail/profile', { status: 404 }, 404);
    stubRoute('GET', '/api/sellers/s-ok/profile', { id: 's-ok', studioName: 'OK Studio' });
    const catalog = buildService();

    const docs = [
      { id: 'd1', seller: { id: 's-fail' } } as any,
      { id: 'd2', seller: { id: 's-ok' } } as any,
      { id: 'd3', seller: { id: 's-ok' } } as any, // duplicate in same batch
    ];

    catalog.loadSellerProfilesForDocuments(docs);
    await settle();

    // Re-trigger loadSellerProfilesForDocuments (e.g. from reactive effect or re-render)
    catalog.loadSellerProfilesForDocuments(docs);
    await settle();

    const sFailCalls = requests.filter((r) => r.path === '/api/sellers/s-fail/profile');
    const sOkCalls = requests.filter((r) => r.path === '/api/sellers/s-ok/profile');
    expect(sFailCalls.length).toBe(1);
    expect(sOkCalls.length).toBe(1);
  });

  it('updateSellerFollowerCount updates seller profile and syncs to document details', async () => {
    stubRoute('GET', '/api/sellers/s-follow/profile', {
      id: 's-follow',
      studioName: 'Follow Studio',
      followerCount: 10,
    });
    const catalog = buildService();

    await catalog.fetchSellerProfile('s-follow');
    expect(catalog.sellerProfiles().get('s-follow')?.followerCount).toBe(10);

    // Follower added
    catalog.updateSellerFollowerCount(1, 's-follow');
    expect(catalog.sellerProfiles().get('s-follow')?.followerCount).toBe(11);

    // Follower removed
    catalog.updateSellerFollowerCount(-1, 's-follow');
    expect(catalog.sellerProfiles().get('s-follow')?.followerCount).toBe(10);

    // Explicit follower count set
    catalog.setSellerFollowerCount('s-follow', 25);
    expect(catalog.sellerProfiles().get('s-follow')?.followerCount).toBe(25);
  });
});


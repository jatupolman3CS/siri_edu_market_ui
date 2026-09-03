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

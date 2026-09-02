import { TestBed } from '@angular/core/testing';
import { LibraryService } from './library.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { AuthService } from './auth.service';

/**
 * library-is-reviewed v1 (AC-9): the "ยังไม่ได้รีวิว" tab has to be a fresh `GET /api/library`
 * call, not `Array.filter()` over whatever page happened to already be in memory — that reads
 * fine with a handful of items and silently breaks (empty tab, wrong count) once a buyer has
 * enough library items to span more than one page. These specs pin that down at the service
 * layer, where `libraryFilter` and the pager actually live.
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

function libraryPage(items: unknown[]) {
  return { items, page: 1, pageSize: 24, totalCount: items.length, totalPages: 1 };
}

function row(documentId: string, over: Record<string, unknown> = {}) {
  return {
    documentId,
    title: `เอกสาร ${documentId}`,
    purchasedAt: '2026-08-01T00:00:00Z',
    orderNumber: `ORD-${documentId}`,
    downloadCount: 1,
    ...over,
  };
}

function buildService(): LibraryService {
  TestBed.configureTestingModule({
    providers: [
      LibraryService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      // AuthService itself pulls in Router / NzMessageService / Google OAuth — a plain stub of
      // the two members LibraryService actually reads keeps this a unit test of LibraryService.
      { provide: AuthService, useValue: { accessToken: () => 'test-token', isAuthenticated: () => true } },
    ],
  });

  return TestBed.inject(LibraryService);
}

function libraryGetCount(): number {
  return requests.filter((r) => r.method === 'GET' && r.path === '/api/library').length;
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
    requests.push({ method: request.method, path, search: url.search });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('LibraryService — libraryFilter', () => {
  it('starts on the "all" filter', () => {
    const library = buildService();

    expect(library.libraryFilter()).toBe('all');
  });

  it('AC-9: switching the filter issues a new GET /api/library instead of reusing the loaded page', async () => {
    stubRoute('GET', '/api/library', libraryPage([row('doc-1'), row('doc-2')]));
    const library = buildService();

    await library.refreshLibrary();
    expect(libraryGetCount()).toBe(1);

    await library.setLibraryFilter('unreviewed');

    expect(library.libraryFilter()).toBe('unreviewed');
    expect(libraryGetCount()).toBe(2);
  });

  it('replaces the loaded items with the fresh page rather than appending to them', async () => {
    stubRoute('GET', '/api/library', libraryPage([row('doc-1'), row('doc-2')]));
    const library = buildService();
    await library.refreshLibrary();
    expect(library.library().length).toBe(2);

    // A different response body proves the second call's result is what ends up in state,
    // not the first page's items still sitting there with the new one appended.
    stubRoute('GET', '/api/library', libraryPage([row('doc-3')]));
    await library.setLibraryFilter('unreviewed');

    expect(library.library().length).toBe(1);
    expect(library.library()[0].document.id).toBe('doc-3');
  });

  it('does not re-fetch when set to the filter that is already active', async () => {
    stubRoute('GET', '/api/library', libraryPage([row('doc-1')]));
    const library = buildService();
    await library.refreshLibrary();
    expect(libraryGetCount()).toBe(1);

    await library.setLibraryFilter('all');

    expect(libraryGetCount()).toBe(1);
  });

  it('falls back to isReviewed=false when the response omits the field', async () => {
    stubRoute('GET', '/api/library', libraryPage([row('doc-1')]));
    const library = buildService();
    await library.refreshLibrary();
    await settle();

    expect(library.library()[0].isReviewed).toBe(false);
    expect(library.library()[0].myRating).toBeUndefined();
  });

  it('AC-3/AC-10: carries isReviewed/myRating through when the response has them', async () => {
    stubRoute(
      'GET',
      '/api/library',
      libraryPage([row('doc-1', { isReviewed: true, myReviewId: 'rev-1', myRating: 5 })]),
    );
    const library = buildService();
    await library.refreshLibrary();
    await settle();

    expect(library.library()[0].isReviewed).toBe(true);
    expect(library.library()[0].myReviewId).toBe('rev-1');
    expect(library.library()[0].myRating).toBe(5);
  });

  it('AC-4: sends unreviewedOnly=true as a query param when the "unreviewed" tab is active', async () => {
    stubRoute('GET', '/api/library', libraryPage([row('doc-1')]));
    const library = buildService();

    await library.setLibraryFilter('unreviewed');
    await settle();

    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/library');
    expect(call?.search).toContain('unreviewedOnly=true');
  });

  it('AC-5: does not send unreviewedOnly on the "all" tab', async () => {
    stubRoute('GET', '/api/library', libraryPage([row('doc-1')]));
    const library = buildService();

    await library.refreshLibrary();
    await settle();

    const call = requests.find((r) => r.method === 'GET' && r.path === '/api/library');
    expect(call?.search).not.toContain('unreviewedOnly');
  });
});

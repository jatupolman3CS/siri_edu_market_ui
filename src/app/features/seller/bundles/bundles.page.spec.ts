import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerBundlesPage } from './bundles.page';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * F-14: the bundle editor is the one page in this wave with arithmetic of its own — the running
 * total of the members' list prices, and the saving it advertises.
 *
 * The server recomputes both and rejects a bundle that is not cheaper than buying separately
 * (F-04), so what these tests protect is not correctness of the money — it is that the seller is
 * shown the same numbers the server will judge them by, instead of finding out from a rejection.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];
let warnings: string[];

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

function candidate(id: string, price: number, title = `เอกสาร ${id}`) {
  return { documentId: id, title, price, coverUrl: `https://cdn/${id}.png` };
}

function stubEmptyList(candidates: unknown[] = []): void {
  stubRoute('GET', '/api/seller/bundles', []);
  stubRoute('GET', '/api/seller/bundles/candidates', candidates);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderPage() {
  TestBed.configureTestingModule({
    imports: [SellerBundlesPage],
    providers: [
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      {
        provide: NzMessageService,
        useValue: {
          success: vi.fn(),
          error: vi.fn(),
          warning: (text: string) => warnings.push(text),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(SellerBundlesPage);
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  warnings = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    requests.push({ method: request.method, path, body: await request.clone().text() });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('SellerBundlesPage', () => {
  it('loads the seller bundles and the documents they can contain', async () => {
    stubEmptyList([candidate('doc-1', 100)]);
    const fixture = renderPage();
    await settle();

    expect(requests.some((r) => r.path === '/api/seller/bundles')).toBe(true);
    expect(requests.some((r) => r.path === '/api/seller/bundles/candidates')).toBe(true);
    expect(fixture.componentInstance.candidates().length).toBe(1);
  });

  it('sums the list prices of the selected documents', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80), candidate('doc-3', 50)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.toggleDocument('doc-1');
    page.toggleDocument('doc-2');

    expect(page.originalPrice()).toBe(200);
  });

  it('ignores an unselected document in the total', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.toggleDocument('doc-1');
    page.toggleDocument('doc-2');
    page.toggleDocument('doc-2');

    expect(page.originalPrice()).toBe(120);
  });

  it('reports the saving in baht and percent', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.toggleDocument('doc-1');
    page.toggleDocument('doc-2');
    page.price.set(150);

    expect(page.savingAmount()).toBe(50);
    expect(page.savingPercent()).toBe(25);
  });

  it('reports no saving when the price is not below the list total', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.toggleDocument('doc-1');
    page.toggleDocument('doc-2');
    page.price.set(200);

    expect(page.savingAmount()).toBe(0);
  });

  it('names each rule the server would reject the bundle for', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    expect(page.validationError()).toContain('ชื่อ');

    page.title.set('ชุดข้อสอบ');
    expect(page.validationError()).toContain('คำอธิบาย');

    page.description.set('คำอธิบาย');
    expect(page.validationError()).toContain('อย่างน้อย 2');

    page.toggleDocument('doc-1');
    page.toggleDocument('doc-2');
    expect(page.validationError()).toContain('มากกว่า 0');

    page.price.set(250);
    expect(page.validationError()).toContain('ถูกกว่า');

    page.price.set(150);
    expect(page.validationError()).toBeNull();
  });

  it('refuses to submit an invalid bundle and says why', async () => {
    stubEmptyList([candidate('doc-1', 120)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.title.set('ชุดข้อสอบ');
    page.description.set('คำอธิบาย');
    page.toggleDocument('doc-1');
    page.price.set(50);

    await page.save();

    expect(warnings.some((w) => w.includes('อย่างน้อย 2'))).toBe(true);
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('POSTs a new bundle with the documents and price the seller chose', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    stubRoute('POST', '/api/seller/bundles', { id: 'bundle-1' });
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.title.set('ชุดข้อสอบ');
    page.description.set('คำอธิบาย');
    page.toggleDocument('doc-1');
    page.toggleDocument('doc-2');
    page.price.set(150);

    await page.save();

    const post = requests.find((r) => r.method === 'POST' && r.path === '/api/seller/bundles');
    expect(post).toBeDefined();
    const body = JSON.parse(post!.body);
    expect(body.price).toBe(150);
    expect(body.documentIds).toEqual(['doc-1', 'doc-2']);
    // OriginalPrice is never sent — the server computes it, so a seller cannot advertise a
    // saving they did not give.
    expect(body.originalPrice).toBeUndefined();
  });

  it('PUTs when editing an existing bundle rather than creating a second one', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    stubRoute('PUT', '/api/seller/bundles/bundle-1', { id: 'bundle-1' });
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.startEdit({
      id: 'bundle-1',
      title: 'เดิม',
      description: 'เดิม',
      coverUrl: '',
      price: 150,
      originalPrice: 200,
      items: [
        { documentId: 'doc-1', title: 'a', price: 120, coverUrl: '' },
        { documentId: 'doc-2', title: 'b', price: 80, coverUrl: '' },
      ],
    });
    page.price.set(140);

    await page.save();

    expect(requests.some((r) => r.method === 'PUT' && r.path === '/api/seller/bundles/bundle-1')).toBe(true);
    expect(requests.some((r) => r.method === 'POST' && r.path === '/api/seller/bundles')).toBe(false);
  });

  it('loads an existing bundle into the form when editing', async () => {
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.startEdit({
      id: 'bundle-1',
      title: 'ชุดเดิม',
      description: 'คำอธิบายเดิม',
      coverUrl: 'https://cdn/cover.png',
      price: 150,
      items: [{ documentId: 'doc-1', title: 'a', price: 120, coverUrl: '' }],
    });

    expect(page.title()).toBe('ชุดเดิม');
    expect(page.selectedDocumentIds()).toEqual(['doc-1']);
    expect(page.formOpen()).toBe(true);
  });

  it('will not delete a bundle an order references, and says why', async () => {
    // The server refuses this too; the guard only saves a round trip and explains the disabled
    // button.
    stubEmptyList();
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    await page.remove({ id: 'bundle-1', canDelete: false });

    expect(warnings.some((w) => w.includes('คำสั่งซื้อ'))).toBe(true);
    expect(requests.some((r) => r.method === 'DELETE')).toBe(false);
  });

  it('deletes a bundle nobody has bought', async () => {
    stubEmptyList();
    stubRoute('DELETE', '/api/seller/bundles/bundle-1', null, 204);
    const fixture = renderPage();
    await settle();

    await fixture.componentInstance.remove({ id: 'bundle-1', canDelete: true });

    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === '/api/seller/bundles/bundle-1'),
    ).toBe(true);
  });

  it('binds the rendered form to the signals the validation reads', async () => {
    // The template uses [(ngModel)] against signals. If that binding did not write through,
    // every field would read empty no matter what the seller typed and the save button would
    // stay disabled forever — with nothing in the build to say so.
    stubEmptyList([candidate('doc-1', 120), candidate('doc-2', 80)]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.startCreate();
    fixture.detectChanges();
    await settle();

    const titleInput: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="title"]',
    );
    expect(titleInput).toBeTruthy();

    titleInput.value = 'ชุดข้อสอบคณิต';
    titleInput.dispatchEvent(new Event('input'));
    await settle();
    fixture.detectChanges();

    expect(page.title()).toBe('ชุดข้อสอบคณิต');
  });

  it('does not swallow a failed load', async () => {
    stubRoute('GET', '/api/seller/bundles', { status: 500 }, 500);
    stubRoute('GET', '/api/seller/bundles/candidates', []);
    const fixture = renderPage();
    await settle();

    expect(fixture.componentInstance.bundles()).toEqual([]);
    expect(fixture.componentInstance.loading()).toBe(false);
  });
});

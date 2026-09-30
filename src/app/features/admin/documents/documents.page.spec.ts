import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminDocumentsPage } from './documents.page';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

/**
 * responsive-ui v1.4 G-14(d) — /admin/documents phone cards. Below 375 the card's first row used to
 * hold the 44x44 row checkbox (F72), the title and the status pill, which left the title 74-87px.
 * The page stylesheet moves the status to its own row there; these specs pin the markup that rule
 * depends on (one `td.rt-status` next to a `td.rt-title` that carries the checkbox) and the rule.
 */
let realFetch: typeof globalThis.fetch;

function listItem(over: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    title: 'ชีทสรุปฟิสิกส์ ม.4 บทที่ 1-5 ฉบับเต็ม',
    shortDescription: 'สั้น',
    status: 'pending',
    sellerName: 'ครูพิม',
    price: 199,
    isFeatured: false,
    openReportCount: 0,
    rating: 0,
    reviewCount: 0,
    downloadCount: 0,
    updatedAt: '2026-09-01T00:00:00Z',
    ...over,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function render(items = [listItem()]) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const body =
      request.method === 'GET' && path === '/api/admin/documents'
        ? { items, page: 1, pageSize: 20, totalCount: items.length, totalPages: 1 }
        : {};
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;

  TestBed.configureTestingModule({
    imports: [AdminDocumentsPage],
    providers: [
      provideRouter([]),
      { provide: NzMessageService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(AdminDocumentsPage);
  fixture.detectChanges();
  await settle();
  fixture.detectChanges();
  return fixture;
}

/** Every CSS rule text the page's stylesheet added to the document (component styles are global <style>s). */
function documentCssText(): string {
  return Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join('\n');
}

beforeEach(() => {
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AdminDocumentsPage — phone card title width (responsive-ui v1.4 G-14(d))', () => {
  it('renders each row as an .rtable card with the checkbox inside the title cell and one status cell', async () => {
    const fixture = await render();
    const row = (fixture.nativeElement as HTMLElement).querySelector('table.rtable > tbody > tr') as HTMLTableRowElement;
    const cells = Array.from(row.children);
    const title = row.querySelector(':scope > td.rt-title');

    expect(title?.textContent).toContain('ชีทสรุปฟิสิกส์ ม.4');
    expect(title?.querySelector('label[nz-checkbox]')).not.toBeNull();
    expect(row.querySelectorAll(':scope > td.rt-status').length).toBe(1);
    expect(cells.indexOf(row.querySelector(':scope > td.rt-status') as Element)).toBe(
      cells.indexOf(title as Element) + 1,
    );
  });

  it('below 375 gives the title the whole first row and moves the status to its own row', async () => {
    await render();
    const css = documentCssText().replace(/\s+/g, ' ');
    const media = /@media \(max-width: 374\.98px\) \{(.*?)\} \}/.exec(css)?.[1] ?? '';

    expect(media).toMatch(/td\.rt-title[^{]*\{ grid-column: 1 ?\/ ?-1; \}/);
    expect(media).toMatch(/td\.rt-status[^{]*\{ grid-column: 1 ?\/ ?-1; grid-row: 2; justify-self: start;/);
  });
});

/** The query string of every `GET /api/admin/documents` the page sent, in order. */
function listRequests(): URLSearchParams[] {
  return vi
    .mocked(globalThis.fetch)
    .mock.calls.map(([input, init]) => (input instanceof Request ? input : new Request(input, init)))
    .filter((request) => request.method === 'GET' && new URL(request.url).pathname === '/api/admin/documents')
    .map((request) => new URL(request.url).searchParams);
}

describe('AdminDocumentsPage — table viewport (responsive-ui v1.6 R-27, v1.6.1 R-27 item 12)', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => listItem({ id: `doc-${i + 1}` }));

  it('starts at 10 rows per page: the first list request carries PageSize=10 and the selector shows 10', async () => {
    const fixture = await render(rows(12));
    const requests = listRequests();
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0].get('PageSize')).toBe('10');
    expect(requests[0].get('Page')).toBe('1');

    const pagination = fixture.debugElement.query(By.directive(PaginationComponent)).componentInstance as PaginationComponent;
    expect(pagination.pageSize()).toBe(10);
    const select = (fixture.nativeElement as HTMLElement).querySelector('app-pagination select') as HTMLSelectElement;
    expect(select.value).toBe('10');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['10', '20', '50', '100']);
  });

  it('puts the table in a named table viewport with the pagination after it, outside', async () => {
    const fixture = await render(rows(12));
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = (root.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;
    const pagination = root.querySelector('app-pagination') as HTMLElement;

    expect(wrapper.classList).toContain('rt-viewport');
    expect(wrapper.classList).toContain('table-scroll');
    expect(wrapper.contains(pagination)).toBe(false);
    expect(wrapper.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const viewport = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
    expect(viewport.rtLabel()).toBe('จัดการเอกสารทั้งหมดในระบบ');
  });

  it('a new page, page size or applied filter scrolls the table to its top; a draft or the same query does not', async () => {
    const fixture = await render(rows(12));
    const page = fixture.componentInstance;
    const wrapper = ((fixture.nativeElement as HTMLElement).querySelector('table.rtable') as HTMLTableElement)
      .parentElement as HTMLElement;
    const scrollTopAfter = async (act: () => void): Promise<number> => {
      wrapper.scrollTop = 300;
      act();
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();
      return wrapper.scrollTop;
    };

    expect(await scrollTopAfter(() => page.onPageChange(2))).toBe(0);
    expect(await scrollTopAfter(() => page.onPageSizeChange(50))).toBe(0);
    // Typing in the search box changes nothing until the search is applied.
    expect(await scrollTopAfter(() => page.q.set('ฟิสิกส์'))).toBe(300);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(0);
    expect(listRequests().at(-1)?.get('Q')).toBe('ฟิสิกส์');
    // The same query again (as after a bulk action) keeps the admin's place.
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(300);
    expect(await scrollTopAfter(() => page.status.set('pending'))).toBe(300);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(0);
  });

  it('keeps the header select-all out of the rounded corner: 44px box, no negative margin, 12px cell padding (GR3-f)', async () => {
    const fixture = await render(rows(3));
    const selectAll = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="table-select-all"]') as HTMLElement;
    const classes = (selectAll.getAttribute('class') ?? '').split(/\s+/);
    const cellClasses = (selectAll.closest('th')?.getAttribute('class') ?? '').split(/\s+/);

    expect(selectAll.closest('thead')).not.toBeNull();
    expect(classes).toEqual(
      expect.arrayContaining(['[@media(pointer:coarse)]:min-w-11', '[@media(pointer:coarse)]:min-h-11']),
    );
    // R-27 item 12, first way: no negative margin on the target and at least px-3 py-3 on its cell.
    expect(classes.filter((c) => /(^|:)-m[trblxy]?-/.test(c))).toEqual([]);
    expect(cellClasses).toEqual(expect.arrayContaining(['px-3', 'py-3']));
    expect(selectAll.closest('th')?.parentElement?.firstElementChild).toBe(selectAll.closest('th'));
  });
});

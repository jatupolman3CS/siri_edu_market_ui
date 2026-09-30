import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AdminSellersPage } from './sellers.page';
import { AdminService } from '../../../core/services';
import type { AdminSellerRow } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

/**
 * backend-wide-pagination-and-seller-directory v1 §1 — AC-11..AC-14. Drives the page against a
 * mocked `AdminService.searchSellers()` (same pattern as `document-generation.page.spec.ts`), so
 * this exercises the table/filter/paging wiring only, independent of the real SDK-backed service.
 */
function seller(overrides: Partial<AdminSellerRow> = {}): AdminSellerRow {
  return {
    id: 'seller-1',
    studioName: 'ร้านครูใจดี',
    ownerName: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    avatarUrl: null,
    isVerified: true,
    totalDocuments: 12,
    totalSales: 340,
    totalRevenue: 15000,
    joinedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderPage(result: Partial<PagedResult<AdminSellerRow>> = {}) {
  TestBed.configureTestingModule({
    imports: [AdminSellersPage],
    providers: [provideRouter([])],
  });

  const admin = TestBed.inject(AdminService);
  const searchSpy = vi.spyOn(admin, 'searchSellers').mockResolvedValue({
    items: result.items ?? [seller()],
    page: result.page ?? 1,
    pageSize: result.pageSize ?? 20,
    totalCount: result.totalCount ?? (result.items ?? [seller()]).length,
    totalPages: result.totalPages ?? 1,
  });

  const fixture = TestBed.createComponent(AdminSellersPage);
  fixture.detectChanges();
  return { fixture, admin, searchSpy };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('AdminSellersPage (backend-wide-pagination-and-seller-directory v1)', () => {
  it('renders sellers as a <table> with the required columns (AC-11)', async () => {
    const { fixture } = renderPage({ items: [seller()] });
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).toBeTruthy();
    expect(el.querySelector('.card-soft.p-6, article')).toBeFalsy();

    const text = el.textContent ?? '';
    expect(text).toContain('ร้านครูใจดี');
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('somchai@example.com');
    expect(text).toContain('ยืนยันแล้ว');

    const storeLink = el.querySelector('a[href="/store/seller-1"]');
    expect(storeLink).toBeTruthy();
  });

  it('typing a search term and clicking "ค้นหา" calls the API with Q and resets page to 1 (AC-12)', async () => {
    const { fixture, searchSpy } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.page.set(3);
    page.q.set('ครูใจดี');
    page.applyFilters();
    await settle();

    expect(page.page()).toBe(1);
    expect(searchSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, q: 'ครูใจดี' }),
    );
  });

  it('prev/next respect totalPages and disable at the boundaries (AC-13)', async () => {
    const { fixture, searchSpy } = renderPage({ page: 1, totalPages: 3, totalCount: 60 });
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    expect(page.page()).toBe(1);
    expect(page.totalPagesSafe()).toBe(3);

    // At page 1, "ก่อนหน้า" must be a no-op.
    page.prevPage();
    await settle();
    expect(page.page()).toBe(1);

    page.nextPage();
    await settle();
    expect(page.page()).toBe(2);
    expect(searchSpy).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));

    page.page.set(3);
    page.nextPage();
    await settle();
    expect(page.page()).toBe(3); // no-op past totalPages
  });

  it('never renders a fake rating or bio field (AC-14)', async () => {
    const { fixture } = renderPage({ items: [seller()] });
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('★');
    expect(text).not.toContain('คะแนน');
    expect(text).not.toContain('ติดต่อ:');
  });
});

describe('AdminSellersPage — table viewport (responsive-ui v1.6 R-27)', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => seller({ id: `seller-${i + 1}` }));

  it('starts at 10 rows per page: the first list request carries pageSize 10 and the selector shows 10', async () => {
    const { fixture, searchSpy } = renderPage({ items: rows(12), totalCount: 40, totalPages: 4 });
    await settle();
    fixture.detectChanges();

    expect(searchSpy).toHaveBeenCalled();
    expect(searchSpy.mock.calls[0][0]).toEqual(expect.objectContaining({ page: 1, pageSize: 10 }));
    const pagination = fixture.debugElement.query(By.directive(PaginationComponent)).componentInstance as PaginationComponent;
    expect(pagination.pageSize()).toBe(10);
    const select = (fixture.nativeElement as HTMLElement).querySelector('app-pagination select') as HTMLSelectElement;
    expect(select.value).toBe('10');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['10', '20', '50', '100']);
  });

  it('puts the table in a named table viewport with the pagination after it, outside', async () => {
    const { fixture } = renderPage({ items: rows(12) });
    await settle();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = (root.querySelector('table.rtable') as HTMLTableElement).parentElement as HTMLElement;
    const pagination = root.querySelector('app-pagination') as HTMLElement;

    expect(wrapper.classList).toContain('rt-viewport');
    expect(wrapper.contains(pagination)).toBe(false);
    expect(wrapper.compareDocumentPosition(pagination) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const viewport = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
    expect(viewport.rtLabel()).toBe('ผู้ขายในระบบ');
  });

  it('a new page, page size or applied filter scrolls the table to its top; a draft or the same query does not', async () => {
    const { fixture } = renderPage({ items: rows(12), totalCount: 40, totalPages: 4 });
    await settle();
    fixture.detectChanges();
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
    expect(await scrollTopAfter(() => page.q.set('ครูใจดี'))).toBe(300);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(0);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(300);
    expect(await scrollTopAfter(() => page.verifiedOnly.set(true))).toBe(300);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(0);
  });
});

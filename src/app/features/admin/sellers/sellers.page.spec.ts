import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminSellersPage } from './sellers.page';
import { AdminService } from '../../../core/services';
import type { AdminSellerRow } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';

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

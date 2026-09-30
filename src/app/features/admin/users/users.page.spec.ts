import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AdminUsersPage } from './users.page';
import { AdminService } from '../../../core/services';
import type { AdminUserRow } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

function userRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'user-1',
    displayName: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    avatarUrl: null,
    roles: ['buyer', 'seller'],
    studioName: 'ร้านครูสมชาย',
    isEmailVerified: true,
    accountStatus: 'active',
    suspendedUntil: null,
    totalPurchaseAmount: 1500,
    totalOrderCount: 4,
    totalSalesAmount: 8500,
    totalSalesCount: 12,
    joinedAt: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderPage(result: Partial<PagedResult<AdminUserRow>> = {}) {
  TestBed.configureTestingModule({
    imports: [AdminUsersPage],
    providers: [provideRouter([])],
  });

  const admin = TestBed.inject(AdminService);
  const searchSpy = vi.spyOn(admin, 'searchUsers').mockResolvedValue({
    items: result.items ?? [userRow()],
    page: result.page ?? 1,
    pageSize: result.pageSize ?? 20,
    totalCount: result.totalCount ?? (result.items ?? [userRow()]).length,
    totalPages: result.totalPages ?? 1,
  });

  const fixture = TestBed.createComponent(AdminUsersPage);
  fixture.detectChanges();
  return { fixture, admin, searchSpy };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('AdminUsersPage', () => {
  it('renders users in a table with required columns', async () => {
    const { fixture } = renderPage({ items: [userRow()] });
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('table')).toBeTruthy();

    const text = el.textContent ?? '';
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('somchai@example.com');
    expect(text).toContain('ผู้ซื้อ');
    expect(text).toContain('ผู้ขาย');
    expect(text).toContain('ปกติ');

    const detailLink = el.querySelector('a[href="/admin/users/user-1"]');
    expect(detailLink).toBeTruthy();
  });

  it('renders correct status pill for active, suspended, and banned', async () => {
    const { fixture } = renderPage({
      items: [
        userRow({ id: 'u-1', accountStatus: 'active' }),
        userRow({ id: 'u-2', accountStatus: 'suspended' }),
        userRow({ id: 'u-3', accountStatus: 'banned' }),
      ],
    });
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent ?? '';
    expect(text).toContain('ปกติ');
    expect(text).toContain('ระงับชั่วคราว');
    expect(text).toContain('แบนถาวร');
  });

  it('filters by query, role, and status, and resets page to 1', async () => {
    const { fixture, searchSpy } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.page.set(3);
    page.q.set('somchai');
    page.role.set('seller');
    page.status.set('suspended');
    page.applyFilters();
    await settle();

    expect(page.page()).toBe(1);
    expect(searchSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: 1,
        q: 'somchai',
        role: 'seller',
        status: 'suspended',
      }),
    );
  });

  it('renders empty state when no items', async () => {
    const { fixture } = renderPage({ items: [], totalCount: 0, totalPages: 0 });
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข');
  });

  it('handles page and pageSize changes', async () => {
    const { fixture, searchSpy } = renderPage({ totalPages: 5, totalCount: 100 });
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.onPageChange(2);
    await settle();
    expect(page.page()).toBe(2);
    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));

    page.onPageSizeChange(50);
    await settle();
    expect(page.pageSize()).toBe(50);
    expect(page.page()).toBe(1);
    expect(searchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 }));
  });
});

describe('AdminUsersPage — responsive table + filter sheet (responsive-ui v1 U4-2 / U4-5)', () => {
  it('renders an .rtable: one title, one status, max 2 keys, secondaries behind the ⋯ button', async () => {
    const { fixture } = renderPage({ items: [userRow()] });
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const table = el.querySelector('table') as HTMLTableElement;
    expect(table.classList.contains('rtable')).toBe(true);
    expect(table.className).not.toMatch(/min-w-\[/);
    expect(table.querySelectorAll('thead th.rt-more').length).toBe(1);

    const row = table.querySelector('tbody tr') as HTMLTableRowElement;
    expect(row.querySelectorAll('td.rt-title').length).toBe(1);
    expect(row.querySelectorAll('td.rt-status').length).toBe(1);
    const keys = row.querySelectorAll('td.rt-key');
    expect(keys.length).toBe(2);
    keys.forEach((k) => expect(k.getAttribute('data-label')).toBeTruthy());
    expect(row.querySelectorAll('td.rt-secondary').length).toBe(2);
    expect(row.querySelector('td.rt-more app-row-more')).not.toBeNull();
    expect(row.querySelector('td.rt-action a[href="/admin/users/user-1"]')).not.toBeNull();
  });

  it('counts the sheet filters (sort excluded) and clears them without touching the search', async () => {
    const { fixture } = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.q.set('somchai');
    page.sort.set('oldest');
    expect(page.activeFilterCount()).toBe(0);

    page.role.set('seller');
    page.status.set('banned');
    page.joinedFrom.set('2026-01-01');
    expect(page.activeFilterCount()).toBe(3);

    page.clearFilters();
    expect(page.activeFilterCount()).toBe(0);
    expect(page.q()).toBe('somchai');
    expect(page.sort()).toBe('oldest');
  });

  it('renders the filter fields inline and offers the phone ตัวกรอง (n) button', async () => {
    const { fixture } = renderPage();
    await settle();
    fixture.componentInstance.role.set('admin');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="filter-inline"] select')).not.toBeNull();
    expect(el.querySelector('[data-testid="filter-sheet-button"]')?.textContent).toContain('(1)');
  });
});

describe('AdminUsersPage — table viewport (responsive-ui v1.6 R-27)', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => userRow({ id: `user-${i + 1}` }));

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
    expect(viewport.rtLabel()).toBe('ผู้ใช้ทั้งหมด');
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
    expect(await scrollTopAfter(() => page.q.set('somchai'))).toBe(300);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(0);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(300);
    expect(await scrollTopAfter(() => page.role.set('seller'))).toBe(300);
    expect(await scrollTopAfter(() => page.applyFilters())).toBe(0);
  });
});

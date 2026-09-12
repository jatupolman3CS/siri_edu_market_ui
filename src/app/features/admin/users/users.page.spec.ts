import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminUsersPage } from './users.page';
import { AdminService } from '../../../core/services';
import type { AdminUserRow } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';

function userRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: 'user-1',
    displayName: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    roles: ['buyer', 'seller'],
    accountStatus: 'active',
    suspendedUntil: null,
    createdDate: '2026-01-15T00:00:00Z',
    lastLoginDate: '2026-09-01T00:00:00Z',
    avatarUrl: null,
    totalPurchaseAmount: 1500,
    totalSalesAmount: 8500,
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

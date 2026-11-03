import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminTransactionsPage, TRANSACTION_SEARCH_DEBOUNCE_MS } from './transactions.page';
import { AdminService } from '../../../core/services';
import type { AdminTransaction } from '../../../core/models';

/**
 * responsive-ui v1 U4-2 — /admin/transactions renders its table as `.rtable` so it turns into
 * cards below 744px and fits without horizontal scroll at 744–1279 (secondary columns behind ⋯).
 */
function tx(over: Partial<AdminTransaction> = {}): AdminTransaction {
  return {
    id: 'tx-1',
    orderNumber: 'ORD-0001',
    buyerName: 'ผู้ซื้อ ก',
    sellerName: 'ร้าน ข',
    documentTitle: 'ชีทสรุปฟิสิกส์ ม.4',
    amount: 199,
    fee: 20,
    netAmount: 179,
    paymentMethod: 'promptpay',
    status: 'fulfilled',
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  } as AdminTransaction;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function render(items: AdminTransaction[]) {
  TestBed.configureTestingModule({
    imports: [AdminTransactionsPage],
    providers: [{ provide: NzMessageService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }],
  });
  const admin = TestBed.inject(AdminService);
  vi.spyOn(admin, 'refreshDashboard').mockResolvedValue(undefined);
  vi.spyOn(admin, 'listTransactionsPaged').mockResolvedValue({
    items,
    page: 1,
    pageSize: 10,
    totalCount: items.length,
    totalPages: 1,
  } as Awaited<ReturnType<AdminService['listTransactionsPaged']>>);

  const fixture = TestBed.createComponent(AdminTransactionsPage);
  fixture.detectChanges();
  await settle();
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminTransactionsPage — responsive table (responsive-ui v1 U4-2)', () => {
  it('uses .rtable without a fixed min-width', async () => {
    const fixture = await render([tx()]);
    const table = (fixture.nativeElement as HTMLElement).querySelector('table') as HTMLTableElement;
    expect(table.classList.contains('rtable')).toBe(true);
    expect(table.className).not.toMatch(/min-w-\[/);
  });

  it('marks title / status / 2 keys / secondaries / ⋯ / action on every row', async () => {
    const fixture = await render([tx()]);
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr') as HTMLTableRowElement;

    expect(row.querySelector('td.rt-title')?.textContent).toContain('ชีทสรุปฟิสิกส์ ม.4');
    expect(row.querySelectorAll('td.rt-status').length).toBe(1);
    const keys = Array.from(row.querySelectorAll('td.rt-key'));
    expect(keys.length).toBe(2);
    expect(keys.every((k) => !!k.getAttribute('data-label'))).toBe(true);
    expect(row.querySelectorAll('td.rt-secondary').length).toBe(5);
    expect(row.querySelector('td.rt-more app-row-more')).not.toBeNull();
    expect(row.querySelector('td.rt-action button')).not.toBeNull();
  });

  it('status filter is a single-line .chip-row using the contrast-safe primary fill', async () => {
    const fixture = await render([tx()]);
    const root = fixture.nativeElement as HTMLElement;
    const row = root.querySelector('.chip-row') as HTMLElement;
    expect(row).not.toBeNull();
    const active = row.querySelector('button.bg-primary');
    expect(active).not.toBeNull();
    expect(row.querySelector('button.bg-brand-500')).toBeNull();
  });

  it('R-27: the table sits in a table viewport that a new page or page size scrolls back to the top (v1.6)', async () => {
    const fixture = await render([tx()]);
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = (root.querySelector('table') as HTMLTableElement).parentElement as HTMLElement;
    expect(wrapper.classList.contains('rt-viewport')).toBe(true);
    // The pagination is a sibling after the wrapper, never inside it.
    expect(wrapper.querySelector('app-pagination')).toBeNull();
    expect(root.querySelector('app-pagination')).not.toBeNull();

    wrapper.scrollTop = 300;
    fixture.componentInstance.onPageChange(2);
    fixture.detectChanges();
    await settle();
    expect(wrapper.scrollTop).toBe(0);

    wrapper.scrollTop = 300;
    fixture.componentInstance.onPageSizeChange(50);
    fixture.detectChanges();
    await settle();
    expect(wrapper.scrollTop).toBe(0);
  });
});

/**
 * wave-l0-hardening v2 §4.3 / AC-Q6-8: search (debounced 300 ms) and the status chips reload
 * from page 1 and hand `{ q, status }` to `AdminService.listTransactionsPaged`, which maps them
 * to the SDK's `Q` / `Status` (covered in `admin.service.spec.ts`) — these specs pin what the
 * page asks for.
 */
describe('AdminTransactionsPage — search + status filter (wave-l0-hardening §4.3)', () => {
  function listSpy() {
    return vi.mocked(TestBed.inject(AdminService).listTransactionsPaged);
  }

  afterEach(() => vi.useRealTimers());

  it('first load sends no filters', async () => {
    await render([tx()]);
    expect(listSpy()).toHaveBeenCalledTimes(1);
    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, {});
  });

  it('typing waits 300 ms, then reloads page 1 with the trimmed q (one call for a burst of keystrokes)', async () => {
    const fixture = await render([tx()]);
    const page = fixture.componentInstance;
    page.onPageChange(3);
    await settle();
    listSpy().mockClear();

    vi.useFakeTimers();
    page.onSearchChange('O');
    page.onSearchChange('ORD');
    page.onSearchChange('  ORD-0001 ');
    expect(page.search()).toBe('  ORD-0001 ');
    vi.advanceTimersByTime(TRANSACTION_SEARCH_DEBOUNCE_MS - 1);
    expect(listSpy()).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(listSpy()).toHaveBeenCalledTimes(1);
    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, { q: 'ORD-0001' });
    expect(page.page()).toBe(1);
    expect(page.appliedSearch()).toBe('ORD-0001');
  });

  it('the search box is wired to the debounce (ngModelChange), not a direct two-way bind', async () => {
    const fixture = await render([tx()]);
    listSpy().mockClear();
    vi.useFakeTimers();

    const input = (fixture.nativeElement as HTMLElement).querySelector('input[type="search"]') as HTMLInputElement;
    input.value = 'ผู้ซื้อ';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(TRANSACTION_SEARCH_DEBOUNCE_MS);

    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, { q: 'ผู้ซื้อ' });
  });

  it('clearing the search drops q; re-typing the same applied value does not reload again', async () => {
    const fixture = await render([tx()]);
    const page = fixture.componentInstance;
    vi.useFakeTimers();
    page.onSearchChange('abc');
    vi.advanceTimersByTime(TRANSACTION_SEARCH_DEBOUNCE_MS);
    listSpy().mockClear();

    page.onSearchChange('abc ');
    vi.advanceTimersByTime(TRANSACTION_SEARCH_DEBOUNCE_MS);
    expect(listSpy()).not.toHaveBeenCalled();

    page.onSearchChange('   ');
    vi.advanceTimersByTime(TRANSACTION_SEARCH_DEBOUNCE_MS);
    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, {});
  });

  it('a status chip reloads page 1 at once with status=[slug]; "ทั้งหมด" sends no status', async () => {
    const fixture = await render([tx()]);
    const page = fixture.componentInstance;
    page.onPageChange(2);
    await settle();
    listSpy().mockClear();
    const root = fixture.nativeElement as HTMLElement;
    const chips = Array.from(root.querySelectorAll('.chip-row button')) as HTMLButtonElement[];
    expect(chips.length).toBe(page.statuses.length);

    chips[page.statuses.findIndex((s) => s.value === 'paid')].click();
    await settle();
    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, { status: ['paid'] });
    expect(page.page()).toBe(1);

    chips[page.statuses.findIndex((s) => s.value === 'all')].click();
    await settle();
    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, {});
    expect(listSpy()).toHaveBeenCalledTimes(2);

    // Clicking the chip that is already active is a no-op.
    chips[page.statuses.findIndex((s) => s.value === 'all')].click();
    await settle();
    expect(listSpy()).toHaveBeenCalledTimes(2);
  });

  it('a chip clicked mid-debounce takes the typed search with it and cancels the pending reload', async () => {
    const fixture = await render([tx()]);
    const page = fixture.componentInstance;
    listSpy().mockClear();
    vi.useFakeTimers();

    page.onSearchChange('ฟิสิกส์');
    page.onStatusChange('refunded');
    expect(listSpy()).toHaveBeenCalledTimes(1);
    expect(listSpy()).toHaveBeenLastCalledWith(1, 10, { q: 'ฟิสิกส์', status: ['refunded'] });

    vi.advanceTimersByTime(TRANSACTION_SEARCH_DEBOUNCE_MS);
    expect(listSpy()).toHaveBeenCalledTimes(1);
  });

  it('paging keeps the active filters', async () => {
    const fixture = await render([tx()]);
    const page = fixture.componentInstance;
    page.onStatusChange('fulfilled');
    await settle();

    page.onPageChange(2);
    await settle();
    expect(listSpy()).toHaveBeenLastCalledWith(2, 10, { status: ['fulfilled'] });
  });

  it('a slow earlier response never overwrites the newer filter result', async () => {
    const fixture = await render([]);
    const page = fixture.componentInstance;
    let releaseSlow: (v: Awaited<ReturnType<AdminService['listTransactionsPaged']>>) => void = () => {};
    const slow = new Promise<Awaited<ReturnType<AdminService['listTransactionsPaged']>>>((r) => (releaseSlow = r));
    listSpy()
      .mockImplementationOnce(() => slow)
      .mockResolvedValueOnce({ items: [tx({ id: 'new' })], page: 1, pageSize: 10, totalCount: 1, totalPages: 1 });

    page.onStatusChange('paid');
    page.onStatusChange('refunded');
    await settle();
    releaseSlow({ items: [tx({ id: 'stale' })], page: 1, pageSize: 10, totalCount: 1, totalPages: 1 });
    await settle();

    expect(page.items().map((t) => t.id)).toEqual(['new']);
    expect(page.loading()).toBe(false);
  });

  it('the table viewport scrolls back to the top when the applied filter changes', async () => {
    const fixture = await render([tx()]);
    const root = fixture.nativeElement as HTMLElement;
    const wrapper = (root.querySelector('table') as HTMLTableElement).parentElement as HTMLElement;

    wrapper.scrollTop = 300;
    fixture.componentInstance.onStatusChange('paid');
    fixture.detectChanges();
    await settle();
    expect(wrapper.scrollTop).toBe(0);
  });
});

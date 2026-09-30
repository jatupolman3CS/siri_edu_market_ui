import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminTransactionsPage } from './transactions.page';
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
    expect(row.querySelector('button.bg-pink-500')).toBeNull();
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

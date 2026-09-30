import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AdminDashboardPage } from './dashboard.page';
import { AdminService } from '../../../core/services';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

/**
 * real-data-stats v1 §3.6/§4.7 — Admin dashboard:
 *  - GMV/ค่าธรรมเนียม/คืนเงิน trend badges hidden entirely (not "+0%") when the corresponding
 *    field is null
 *  - "ธุรกรรมสำเร็จ" never gets a trend badge — no field exists for it
 *  - "เฉลี่ยอนุมัติภายใน 18 ชม." is removed outright (no numeric replacement, §5)
 */
type Trends = {
  revenueTrendPercent: number | null;
  feesTrendPercent: number | null;
  refundTrendPercent: number | null;
};

function render(trends: Trends, over: Record<string, unknown> = {}) {
  const fakeAdmin = {
    dashboard: () => ({ totalRevenue: 100000, totalFees: 10000, successCount: 5, refundCount: 1 }),
    totalRevenue: () => 0,
    totalFees: () => 0,
    successCount: () => 0,
    refundCount: () => 0,
    dashboardTrends: () => trends,
    pendingDocuments: () => [],
    transactions: () => [],
    refreshDashboard: vi.fn(async () => {}),
    refreshTransactions: vi.fn(async () => {}),
    refreshPendingDocuments: vi.fn(async () => {}),
    pendingBadgeCount: () => null,
    dashboardState: () => ({ status: 'success' }),
    ...over,
  };

  TestBed.configureTestingModule({
    imports: [AdminDashboardPage],
    providers: [provideRouter([]), { provide: AdminService, useValue: fakeAdmin }],
  });

  const fixture = TestBed.createComponent(AdminDashboardPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminDashboardPage — trend badges (real-data-stats v1 §3.6/§4.7)', () => {
  it('hides every trend badge when all three fields are null', () => {
    const fixture = render({ revenueTrendPercent: null, feesTrendPercent: null, refundTrendPercent: null });

    const page = fixture.componentInstance;
    expect(page.revenueTrendDisplay()).toBeNull();
    expect(page.feesTrendDisplay()).toBeNull();
    expect(page.refundTrendDisplay()).toBeNull();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('+24%');
    expect(text).not.toContain('-12%');
  });

  it('shows the formatted trend once the backend sends real values', () => {
    const fixture = render({ revenueTrendPercent: 24, feesTrendPercent: 24, refundTrendPercent: -12 });

    const page = fixture.componentInstance;
    expect(page.revenueTrendDisplay()).toBe('+24.0%');
    expect(page.feesTrendDisplay()).toBe('+24.0%');
    expect(page.refundTrendDisplay()).toBe('-12.0%');
  });

  it('never renders a trend badge for "ธุรกรรมสำเร็จ" — no field exists for it', () => {
    const fixture = render({ revenueTrendPercent: 24, feesTrendPercent: 24, refundTrendPercent: -12 });

    const root = fixture.nativeElement as HTMLElement;
    const cards = Array.from(root.querySelectorAll('app-stat-card'));
    const successCard = cards.find((c) => (c.textContent ?? '').includes('ธุรกรรมสำเร็จ'));
    expect(successCard?.textContent ?? '').not.toMatch(/[+-]\d/);
  });
});

describe('AdminDashboardPage — remove-only copy (real-data-stats v1 §4.7/§5)', () => {
  it('drops "เฉลี่ยอนุมัติภายใน 18 ชม." outright, with no numeric replacement', () => {
    const fixture = render({ revenueTrendPercent: null, feesTrendPercent: null, refundTrendPercent: null });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('เฉลี่ยอนุมัติภายใน');
    expect(text).not.toContain('18 ชม.');
  });
});

const NO_TRENDS: Trends = { revenueTrendPercent: null, feesTrendPercent: null, refundTrendPercent: null };
const TX = [
  { id: 't1', documentTitle: 'Doc A', status: 'awaiting_payment', amount: 100, buyerName: 'Buyer A', orderNumber: 'ORD-1' },
  { id: 't2', documentTitle: 'Doc B', status: 'cancelled', amount: 50, buyerName: 'Buyer B', orderNumber: 'ORD-2' },
  { id: 't3', documentTitle: 'Doc C', status: 'paid', amount: 70, buyerName: 'Buyer C', orderNumber: 'ORD-3' },
];

describe('AdminDashboardPage — i18n (responsive-ui v1.4 F20/F28/F29, G-31)', () => {
  it('translates the recent-transaction status pills instead of printing admin.txStatus* key paths (F20)', () => {
    const fixture = render(NO_TRENDS, { transactions: () => TX });
    const root = fixture.nativeElement as HTMLElement;
    const pills = Array.from(root.querySelectorAll('table.rtable td.rt-status .pill')).map((p) => p.textContent?.trim());
    expect(pills).toEqual(['รอชำระ', 'ยกเลิก', 'ชำระแล้ว']);
    expect(root.textContent).not.toMatch(/admin\.\w/);
    expect(fixture.componentInstance.statusLabel('unknown_status')).toBe('unknown_status');
  });

  it('shows counts with the common.items unit, never the "selected" text of seller.itemsCount (F28)', () => {
    const fixture = render(NO_TRENDS);
    const root = fixture.nativeElement as HTMLElement;
    const cards = Array.from(root.querySelectorAll('app-stat-card'));
    // value and unit are separate spans (the unit comes from the stat-card `unit` input)
    const valueAndUnit = (card: Element) =>
      Array.from(card.querySelectorAll('.card-tile-body > span')).map((s) => s.textContent?.trim());
    expect(valueAndUnit(cards[2])).toEqual(['5', 'รายการ']);
    expect(valueAndUnit(cards[3])).toEqual(['1', 'รายการ']);
    expect(cards.map((c) => c.textContent).join(' ')).not.toContain('ที่เลือก');
  });

  it('labels the buyer column ผู้ซื้อ (admin.transactions.colBuyer), not ผู้ขาย (F29)', () => {
    const fixture = render(NO_TRENDS, { transactions: () => TX });
    const root = fixture.nativeElement as HTMLElement;
    const ths = Array.from(root.querySelectorAll('table.rtable thead th')).map((th) => th.textContent?.trim());
    expect(ths).toContain('ผู้ซื้อ');
    expect(ths).not.toContain('ผู้ขาย');
    const labels = Array.from(root.querySelectorAll('table.rtable td.rt-key')).map((td) => td.getAttribute('data-label'));
    expect(labels).toContain('ผู้ซื้อ');
    expect(labels).not.toContain('ผู้ขาย');
  });

  it('counts pending documents from the server total when known, else the loaded rows', () => {
    const withTotal = render(NO_TRENDS, { pendingBadgeCount: () => 1234 });
    expect((withTotal.nativeElement as HTMLElement).textContent).toContain('1234 รายการรอตรวจสอบ');
    TestBed.resetTestingModule();
    const fallback = render(NO_TRENDS, { pendingDocuments: () => [] });
    expect((fallback.nativeElement as HTMLElement).textContent).toContain('0 รายการรอตรวจสอบ');
  });
});

describe('AdminDashboardPage — data states (responsive-ui v1.4 R-17, G-27)', () => {
  it('shows skeleton stat cards while GET /api/admin/dashboard is pending — no zeroed stats, no health claim', () => {
    const fixture = render(NO_TRENDS, { dashboard: () => null, dashboardState: () => ({ status: 'loading' }) });
    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.dashboardView()).toBe('loading');
    expect(root.querySelector('[data-testid="admin-dashboard-loading"]')?.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('[data-testid="admin-health-loading"]')).not.toBeNull();
    expect(root.querySelectorAll('app-stat-card').length).toBe(0);
    expect(root.querySelector('[data-testid="admin-dashboard-error"]')).toBeNull();
    expect(root.textContent).not.toContain('บริการทั้งหมดทำงานปกติ');
  });

  it('treats the initial idle state (before the first answer) as loading', () => {
    const fixture = render(NO_TRENDS, { dashboard: () => null, dashboardState: () => ({ status: 'idle' }) });
    expect(fixture.componentInstance.dashboardView()).toBe('loading');
  });

  it('shows a message and a common.retry button that re-issues the dashboard GET on failure', () => {
    const refreshDashboard = vi.fn(async () => {});
    const fixture = render(NO_TRENDS, {
      dashboard: () => null,
      dashboardState: () => ({ status: 'error', message: 'x' }),
      refreshDashboard,
    });
    const root = fixture.nativeElement as HTMLElement;
    const error = root.querySelector('[data-testid="admin-dashboard-error"]');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('โหลดข้อมูลไม่สำเร็จ');
    expect(root.querySelectorAll('app-stat-card').length).toBe(0);
    expect(root.textContent).not.toContain('บริการทั้งหมดทำงานปกติ');
    expect(refreshDashboard).toHaveBeenCalledTimes(1);

    const retry = root.querySelector<HTMLButtonElement>('[data-testid="admin-dashboard-retry"]');
    expect(retry?.textContent?.trim()).toBe('ลองใหม่อีกครั้ง');
    expect(retry?.classList).toContain('btn-pink'); // 44px on coarse pointers (styles.scss touch rule)
    retry!.click();
    expect(refreshDashboard).toHaveBeenCalledTimes(2);
  });

  it('keeps showing loaded stats while a later refresh is in flight', () => {
    const fixture = render(NO_TRENDS, { dashboardState: () => ({ status: 'loading' }) });
    expect(fixture.componentInstance.dashboardView()).toBe('data');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('app-stat-card').length).toBe(4);
  });
});

describe('AdminDashboardPage — table viewport (responsive-ui v1.6 R-27)', () => {
  it('puts the recent-transactions table in a named table viewport with no reset key (at most 5 rows)', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...TX[0], id: `t${i + 1}`, orderNumber: `ORD-${i + 1}` }));
    const fixture = render(NO_TRENDS, { transactions: () => many });
    const root = fixture.nativeElement as HTMLElement;
    const table = root.querySelector('table.rtable') as HTMLTableElement;
    const wrapper = table.parentElement as HTMLElement;

    expect(wrapper.classList).toContain('rt-viewport');
    expect(table.querySelectorAll('tbody > tr').length).toBe(5);
    const viewport = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
    expect(viewport.rtLabel()).toBe('ธุรกรรมล่าสุด');
    expect(viewport.rtResetKey()).toBeUndefined();
  });
});

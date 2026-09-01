import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminDashboardPage } from './dashboard.page';
import { AdminService } from '../../../core/services';

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

function render(trends: Trends) {
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

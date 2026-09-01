import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthLayoutComponent } from './auth-layout.component';
import { PlatformStatsService } from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import type { PlatformStats } from '../../../core/models';

/**
 * real-data-stats v1 §4.3 — Auth layout marketing stats (shared by all 5 auth pages):
 *  - "12k+ เอกสาร" / "3.2k ครีเอเตอร์" read `PlatformStatsService.stats()`, skeleton while loading
 *  - "98% รีวิวบวก" is dropped entirely (not "0%") when positiveReviewPercent is null/undefined
 */
function render(stats: PlatformStats | undefined) {
  const fakeStats = {
    stats: () => stats,
    statsState: () => idleActionState(),
    loadStats: vi.fn(),
  };

  TestBed.configureTestingModule({
    imports: [AuthLayoutComponent],
    providers: [provideRouter([]), { provide: PlatformStatsService, useValue: fakeStats }],
  });

  const fixture = TestBed.createComponent(AuthLayoutComponent);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AuthLayoutComponent — marketing stats (real-data-stats v1 §4.3)', () => {
  it('calls loadStats() once on construction', () => {
    const fakeStats = { stats: () => undefined, statsState: () => idleActionState(), loadStats: vi.fn() };
    TestBed.configureTestingModule({
      imports: [AuthLayoutComponent],
      providers: [provideRouter([]), { provide: PlatformStatsService, useValue: fakeStats }],
    });
    TestBed.createComponent(AuthLayoutComponent).detectChanges();

    expect(fakeStats.loadStats).toHaveBeenCalledTimes(1);
  });

  it('shows a skeleton (never "0") while stats() is undefined', () => {
    const fixture = render(undefined);

    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent ?? '').not.toContain('0+');
    expect(root.querySelectorAll('.animate-pulse').length).toBe(2);
  });

  it('renders the real counters and drops "รีวิวบวก" entirely when positiveReviewPercent is undefined', () => {
    const fixture = render({
      totalApprovedDocuments: 12000,
      totalSellers: 3200,
      totalDownloads: 98000,
      reviewCount: 0,
      feeRatePercent: 10,
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('12k+');
    expect(text).toContain('3.2k');
    expect(text).not.toContain('รีวิวบวก');
  });

  it('shows "N% รีวิวบวก" once positiveReviewPercent has a value', () => {
    const fixture = render({
      totalApprovedDocuments: 12000,
      totalSellers: 3200,
      totalDownloads: 98000,
      reviewCount: 8400,
      positiveReviewPercent: 98,
      feeRatePercent: 10,
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('98%');
    expect(text).toContain('รีวิวบวก');
  });
});

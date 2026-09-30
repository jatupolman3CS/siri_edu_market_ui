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

/**
 * `bg-gradient-pink-strong` is now the dark primary → primary-hover gradient (it used to be light
 * pink). ng-zorro's global CSS colours h1–h6 near-black, so the aside heading must carry its own
 * text-white, and the "Welcome" pill must not be a light white/15 layer (≈ 3.6:1 over the circles).
 */
describe('AuthLayoutComponent — marketing aside contrast', () => {
  it('gives the heading its own white text and keeps the pill dark', () => {
    const fixture = render(undefined);
    const aside = (fixture.nativeElement as HTMLElement).querySelector('aside') as HTMLElement;

    expect(aside.classList).toContain('bg-gradient-pink-strong');
    expect(aside.querySelector('h2')?.classList).toContain('text-white');
    const pill = aside.querySelector('span.rounded-full') as HTMLElement;
    expect(pill.className).not.toMatch(/bg-white\//);
    expect(pill.classList).toContain('bg-primary-hover/80');
  });
});

/**
 * responsive-ui v1.4 §4.6 F (F1): below 640 the back link shows only the arrow — the label stays
 * the accessible name (sr-only) and shows from 640. A visible, wrapping label still overflowed the
 * page under text scaling.
 */
describe('AuthLayoutComponent — back-to-market link (F1)', () => {
  it('keeps the label as a sr-only span that becomes visible from sm', () => {
    const fixture = render(undefined);
    const link = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="auth-back-link"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/');
    expect(link.classList.contains('tap-target')).toBe(true);
    const label = link.querySelector('span.sr-only') as HTMLElement;
    expect(label).not.toBeNull();
    expect(label.classList.contains('sm:not-sr-only')).toBe(true);
    expect(label.textContent?.trim()).toBe('กลับสู่หน้าตลาด');
    expect(link.querySelector('span[aria-hidden="true"]')?.textContent).toBe('←');
  });
});

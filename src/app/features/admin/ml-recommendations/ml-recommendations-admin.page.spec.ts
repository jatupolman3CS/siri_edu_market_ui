import { TestBed } from '@angular/core/testing';
import { MlRecommendationsAdminPage } from './ml-recommendations-admin.page';
import { AdminService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { AdminMlRecommendationOverview } from '../../../core/models';

/**
 * ml-embedding-recommendations v1 §3.2/§4.2/§4.4 (`docs/contracts/ml-embedding-recommendations.md`)
 * — "สถานะระบบแนะนำสินค้า (Bought Together)": light, single-module, read-only monitoring card.
 * No actions anywhere on this page (§5 out of scope #3 — everything is config-driven, no
 * "คำนวณใหม่เดี๋ยวนี้" button).
 */
function buildOverview(overrides: Partial<AdminMlRecommendationOverview> = {}): AdminMlRecommendationOverview {
  return {
    documentsWithEmbeddingCount: 120,
    documentsWithBoughtTogetherCount: 80,
    totalSimilarityPairs: 640,
    averageCoPurchaseCount: 3.25,
    lastComputedAt: '2026-09-15T03:00:00Z',
    embeddingDimensions: 32,
    minCoPurchaseThreshold: 1,
    ...overrides,
  };
}

function render(overview: AdminMlRecommendationOverview | null) {
  const admin = { getMlRecommendationOverview: vi.fn(async () => overview) };
  const apiFail = { report: vi.fn() };

  TestBed.configureTestingModule({
    imports: [MlRecommendationsAdminPage],
    providers: [
      { provide: AdminService, useValue: admin },
      { provide: ApiFailureReporter, useValue: apiFail },
    ],
  });

  const fixture = TestBed.createComponent(MlRecommendationsAdminPage);
  fixture.detectChanges();
  return { fixture, admin, apiFail };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('MlRecommendationsAdminPage', () => {
  it('loads the overview on init and renders every stat card', async () => {
    const { fixture, admin } = render(buildOverview());
    await settle();
    fixture.detectChanges();

    expect(admin.getMlRecommendationOverview).toHaveBeenCalledTimes(1);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สถานะระบบแนะนำสินค้า (Bought Together)');
    expect(text).toContain('120 เอกสาร');
    expect(text).toContain('80 เอกสาร');
    expect(text).toContain('640 คู่');
    expect(text).toContain('32 มิติ');
    expect(text).not.toContain('ยังไม่เคยคำนวณ');
  });

  it('shows the "ยังไม่เคยคำนวณ" warning banner when lastComputedAt is null', async () => {
    const { fixture } = render(buildOverview({ lastComputedAt: null }));
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่เคยคำนวณ');
  });

  it('renders defaults (never fabricated numbers) when the overview call fails/returns null', async () => {
    const { fixture } = render(null);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('0 เอกสาร');
    expect(text).toContain('ยังไม่เคยคำนวณ');
  });

  it('has no wallet-style edit action anywhere on this read-only page', async () => {
    const { fixture } = render(buildOverview());
    await settle();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button').length).toBe(0);
  });
});

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RecommendationTracePanelComponent } from './recommendation-trace-panel.component';
import { CrmService } from '../../../core/services';
import type { AdminRecommendationTrace } from '../../../core/models';
import { TableViewportDirective } from '../../directives/table-viewport.directive';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.5/§4.3/§1.4 — "render gate
 * ผ่าน/ไม่ผ่าน + เหตุผล + ตาราง candidate".
 *
 * Drives the component against a stubbed `CrmService` (same style as `CrmUserPanelComponent`'s
 * spec) rather than the network layer — `CrmService.loadRecommendationTrace()`'s own SDK wiring
 * is covered separately in `crm.service.spec.ts` (round 2, after regen).
 */
function buildTrace(overrides: Partial<AdminRecommendationTrace> = {}): AdminRecommendationTrace {
  return {
    userId: 'user-1',
    displayName: 'สมชาย ใจดี',
    trackingEnabled: true,
    computedAt: '2026-09-14T00:00:00Z',
    interestConfidence: 0.62,
    minConfidence: 0.3,
    topFacetScore: 0.8,
    minTopFacetScore: 0.4,
    profileAgeDays: 3,
    gatePassed: true,
    gateFailReason: null,
    strategy: 'crm-personalized',
    strategyReason: 'เพราะคุณสนใจคณิตศาสตร์ ระดับ ป.1-3',
    candidateCount: 10,
    qualifiedCount: 4,
    minQualifiedItems: 3,
    userFacets: [],
    candidates: [
      {
        documentId: 'doc-1',
        title: 'สรุปคณิต ป.2',
        relevanceScore: 0.72,
        rawScore: 1.44,
        passed: true,
        excludedReason: null,
        matchedFacets: [
          { facetType: 'category', facetValue: 'math', facetLabel: 'คณิตศาสตร์', userScore: 0.9, weight: 0.8, contribution: 0.72 },
        ],
      },
      {
        documentId: 'doc-2',
        title: 'แบบฝึกหัดวิทยาศาสตร์',
        relevanceScore: 0.2,
        rawScore: 0.2,
        passed: false,
        excludedReason: 'คะแนนความเกี่ยวข้องต่ำกว่าเกณฑ์',
        matchedFacets: [],
      },
    ],
    ...overrides,
  };
}

function buildCrmFake(trace: AdminRecommendationTrace | null) {
  return {
    recommendationTrace: () => trace,
    loadingRecommendationTrace: () => false,
    loadRecommendationTrace: vi.fn(async () => {}),
  };
}

function render(crmFake: ReturnType<typeof buildCrmFake>, userId = 'user-1') {
  TestBed.configureTestingModule({
    imports: [RecommendationTracePanelComponent],
    providers: [{ provide: CrmService, useValue: crmFake }],
  });
  const fixture = TestBed.createComponent(RecommendationTracePanelComponent);
  fixture.componentRef.setInput('userId', userId);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('RecommendationTracePanelComponent', () => {
  it('loads the trace for the userId given through the input signal', () => {
    const crmFake = buildCrmFake(buildTrace());
    render(crmFake, 'user-42');
    expect(crmFake.loadRecommendationTrace).toHaveBeenCalledWith('user-42');
  });

  it('shows the "ผ่านเกณฑ์" banner and candidate table when gatePassed is true', () => {
    const fixture = render(buildCrmFake(buildTrace()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ผ่านเกณฑ์การวิเคราะห์ — ระบบแนะนำแบบเฉพาะบุคคลให้ผู้ใช้รายนี้');
    expect(text).toContain('สรุปคณิต ป.2');
    expect(text).toContain('แบบฝึกหัดวิทยาศาสตร์');
    expect(text).toContain('คะแนนความเกี่ยวข้องต่ำกว่าเกณฑ์');
  });

  it('shows the "ไม่ผ่านเกณฑ์" banner with gateFailReason when gatePassed is false', () => {
    const fixture = render(
      buildCrmFake(buildTrace({ gatePassed: false, gateFailReason: 'ความมั่นใจในการวิเคราะห์ต่ำกว่าเกณฑ์' })),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ไม่ผ่านเกณฑ์ — ความมั่นใจในการวิเคราะห์ต่ำกว่าเกณฑ์');
    expect(text).not.toContain('ผ่านเกณฑ์การวิเคราะห์ — ระบบแนะนำแบบเฉพาะบุคคล');
  });

  it('expands a candidate row on click to show its matchedFacets breakdown', () => {
    const fixture = render(buildCrmFake(buildTrace()));
    let text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('คะแนนผู้ใช้');

    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr') as HTMLTableRowElement;
    row.click();
    fixture.detectChanges();

    text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('คะแนนผู้ใช้');
  });

  it('shows the candidates empty state when there are none to analyze', () => {
    const fixture = render(buildCrmFake(buildTrace({ candidates: [] })));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีเอกสารที่เข้าข่ายให้วิเคราะห์');
  });

  it('shows the empty state when there is no trace yet', () => {
    const fixture = render(buildCrmFake(null));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่พบข้อมูลการวิเคราะห์คำแนะนำของผู้ใช้รายนี้');
  });
});

/**
 * responsive-ui v1.6 R-27 (§4.5 v1.6 inventory row 18): the candidates table lists every candidate,
 * so its viewport has a name but no reset key and no pagination. Expansion rows count as rows.
 */
describe('RecommendationTracePanelComponent — table viewport (responsive-ui v1.6 R-27)', () => {
  it('puts the candidates table in an rt-viewport wrapper named by its section heading', () => {
    const fixture = render(buildCrmFake(buildTrace()));
    const el = fixture.nativeElement as HTMLElement;
    const table = el.querySelector('table') as HTMLTableElement;
    const wrapper = table.parentElement as HTMLElement;
    expect(wrapper.classList.contains('rt-viewport')).toBe(true);

    const directive = fixture.debugElement.query(By.directive(TableViewportDirective)).injector.get(TableViewportDirective);
    const heading = wrapper.closest('section')?.querySelector('h3');
    expect(directive.rtLabel()).toBe('เอกสารที่พิจารณา');
    expect(directive.rtLabel()).toBe(heading?.textContent?.trim());
    expect(directive.rtLabelledBy()).toBeNull();
    expect(directive.rtResetKey()).toBeUndefined();
    expect(el.querySelector('app-pagination')).toBeNull();
  });

  it('expanding a candidate row keeps the table\'s scroll position (no reset key)', async () => {
    const fixture = render(buildCrmFake(buildTrace()));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const wrapper = (el.querySelector('table') as HTMLTableElement).parentElement as HTMLElement;
    wrapper.scrollTop = 300;
    expect(wrapper.scrollTop).toBe(300);

    (el.querySelector('tbody tr') as HTMLTableRowElement).click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(el.querySelectorAll('tbody tr').length).toBe(3);
    expect((el.querySelector('table') as HTMLTableElement).parentElement).toBe(wrapper);
    expect(wrapper.scrollTop).toBe(300);
  });
});

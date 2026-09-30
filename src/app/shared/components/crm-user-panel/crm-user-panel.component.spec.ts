import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip';
import { CrmUserPanelComponent } from './crm-user-panel.component';
import { CrmService } from '../../../core/services';
import type { CrmUserDetail } from '../../../core/models';

/**
 * crm-core v1 §1.3/§4.3/§4.4 (`docs/contracts/crm-core.md`) — "render facet/segment/เหตุผล
 * ครบจาก input signal" + the §4.3 "ผู้ใช้รายนี้ปฏิเสธการติดตามพฤติกรรม" banner.
 *
 * Round 1: `CrmService.loadUserDetail()` is a `TODO(contract)` stub — drives the component
 * against a stubbed `CrmService`, same style as this wave's other round-1-stubbed specs.
 */

function buildDetail(overrides: Partial<CrmUserDetail> = {}): CrmUserDetail {
  return {
    userId: 'user-1',
    displayName: 'สมชาย ใจดี',
    email: 'somchai@example.com',
    trackingEnabled: true,
    computedAt: '2026-09-13T09:00:00Z',
    interestConfidence: 0.62,
    engagementScore: 24.5,
    signalCount: 18,
    lastActivityAt: '2026-09-12T09:00:00Z',
    lastPurchaseAt: '2026-09-01T09:00:00Z',
    purchaseCount: 2,
    declaredCategories: [{ value: 'cat-1', label: 'คณิตศาสตร์' }],
    facets: [
      {
        facetType: 'category',
        value: 'cat-1',
        label: 'คณิตศาสตร์',
        score: 20,
        normalizedScore: 1,
        signalCount: 2,
        topSignal: 'purchase',
        isDeclared: true,
        lastSignalAt: '2026-09-01T09:00:00Z',
      },
    ],
    segments: [
      { code: 'repeat_buyer', label: 'ซื้อซ้ำ', kind: 'lifecycle', reason: 'ซื้อไปแล้ว 2 รายการ' },
    ],
    signalBreakdown: {
      documentViews: 10,
      searches: 5,
      purchases: 2,
      subscriptionAccesses: 0,
      wishlistItems: 1,
      cartItems: 0,
      sellerFollows: 0,
      reviews: 0,
      declaredInterests: 1,
    },
    ...overrides,
  };
}

function buildCrmFake(detail: CrmUserDetail | null) {
  return {
    userDetail: () => detail,
    loadingUserDetail: () => false,
    loadUserDetail: vi.fn(async () => {}),
  };
}

function render(crmFake: ReturnType<typeof buildCrmFake>, userId = 'user-1') {
  TestBed.configureTestingModule({
    imports: [CrmUserPanelComponent],
    providers: [{ provide: CrmService, useValue: crmFake }, provideNoopAnimations()],
  });
  const fixture = TestBed.createComponent(CrmUserPanelComponent);
  fixture.componentRef.setInput('userId', userId);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('CrmUserPanelComponent', () => {
  it('loads the detail for the userId given through the input signal', () => {
    const crmFake = buildCrmFake(buildDetail());
    render(crmFake, 'user-42');
    expect(crmFake.loadUserDetail).toHaveBeenCalledWith('user-42');
  });

  it('renders facets, their reason, segments (with reason), and declared categories from the input data', () => {
    const fixture = render(buildCrmFake(buildDetail()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('มาจากการซื้อเอกสาร');
    expect(text).toContain('ซื้อซ้ำ');
    expect(text).toContain('ความมั่นใจในการวิเคราะห์ 62%');

    // The reason is an nz-tooltip (opens on tap/hover/focus), not a native title= that touch
    // browsers never show (responsive fix F70).
    const segmentDe = fixture.debugElement.query(By.directive(NzTooltipDirective));
    expect(segmentDe).toBeTruthy();
    expect(segmentDe.injector.get(NzTooltipDirective).title).toBe('ซื้อไปแล้ว 2 รายการ');
    const segmentEl = segmentDe.nativeElement as HTMLElement;
    expect(segmentEl.hasAttribute('title')).toBe(false);
    expect(segmentEl.getAttribute('tabindex')).toBe('0');
    // Screen readers get the reason in the pill's own text.
    expect(segmentEl.textContent).toContain('ซื้อไปแล้ว 2 รายการ');
  });

  it('shows the segment reason tooltip when the pill receives keyboard focus and hides it on blur', () => {
    const fixture = render(buildCrmFake(buildDetail()));
    const segmentDe = fixture.debugElement.query(By.directive(NzTooltipDirective));
    const tooltip = segmentDe.injector.get(NzTooltipDirective);
    const show = vi.spyOn(tooltip, 'show');
    const hide = vi.spyOn(tooltip, 'hide');

    segmentDe.triggerEventHandler('focus', new FocusEvent('focus'));
    expect(show).toHaveBeenCalled();

    segmentDe.triggerEventHandler('blur', new FocusEvent('blur'));
    expect(hide).toHaveBeenCalled();
  });

  it('shows the "ปฏิเสธการติดตามพฤติกรรม" banner instead of facets when trackingEnabled is false', () => {
    const fixture = render(buildCrmFake(buildDetail({ trackingEnabled: false, facets: [] })));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ผู้ใช้รายนี้ปฏิเสธการติดตามพฤติกรรม — ไม่มีข้อมูลให้วิเคราะห์');
    expect(text).not.toContain('ความมั่นใจในการวิเคราะห์');
  });

  it('shows the empty state when there is no detail yet', () => {
    const fixture = render(buildCrmFake(null));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่พบโปรไฟล์ CRM ของผู้ใช้รายนี้');
  });
});

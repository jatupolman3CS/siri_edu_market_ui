import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CrmAdminPage } from './crm-admin.page';
import { CrmService } from '../../../core/services';
import type { CrmOverview } from '../../../core/models';

/**
 * crm-core v1 §1.3/§4.3 (`docs/contracts/crm-core.md`) — AC-23: every segment code the backend
 * returns must render, including `userCount = 0` (must not be hidden).
 *
 * Round 1: `CrmService.loadOverview()` is a `TODO(contract)` stub — drives the page against a
 * stubbed `CrmService` (same style as `crm-admin`'s sibling specs elsewhere in this wave).
 */

function buildOverview(overrides: Partial<CrmOverview> = {}): CrmOverview {
  return {
    profileCount: 120,
    computedProfileCount: 80,
    trackingOptOutCount: 5,
    lastComputedAt: '2026-09-13T10:00:00Z',
    averageConfidence: 0.35,
    signalRowCount: 4200,
    segments: [
      { code: 'dormant', label: 'ไม่ได้ใช้งานมาสักพัก', kind: 'lifecycle', description: 'ไม่มีความเคลื่อนไหวเกิน 90 วัน', userCount: 12 },
      { code: 'loyal_buyer', label: 'ลูกค้าประจำ', kind: 'lifecycle', description: 'ซื้อ 5 รายการขึ้นไป', userCount: 3 },
      { code: 'exam_prep', label: 'เตรียมสอบ', kind: 'interest', description: 'สนใจเนื้อหาเตรียมสอบ', userCount: 0 },
    ],
    topSearchTerms: [],
    topFacets: [],
    ...overrides,
  };
}

function buildCrmFake(overview: CrmOverview | null) {
  return {
    adminOverview: () => overview,
    loadingOverview: () => false,
    loadOverview: vi.fn(async () => {}),
  };
}

function render(crmFake: ReturnType<typeof buildCrmFake>) {
  TestBed.configureTestingModule({
    imports: [CrmAdminPage],
    providers: [provideRouter([]), { provide: CrmService, useValue: crmFake }],
  });
  const fixture = TestBed.createComponent(CrmAdminPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('CrmAdminPage', () => {
  it('AC-23: renders every segment the backend returns, including one with userCount = 0', () => {
    const fixture = render(buildCrmFake(buildOverview()));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่ได้ใช้งานมาสักพัก');
    expect(text).toContain('ลูกค้าประจำ');
    expect(text).toContain('เตรียมสอบ');

    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('loads the overview once on init', () => {
    const crmFake = buildCrmFake(buildOverview());
    render(crmFake);
    expect(crmFake.loadOverview).toHaveBeenCalledTimes(1);
  });

  it('shows the "ยังไม่เคยประมวลผล" banner when lastComputedAt is null', () => {
    const fixture = render(buildCrmFake(buildOverview({ lastComputedAt: null })));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่เคยประมวลผล — ตรวจสอบว่างาน job.crm-profile-rebuild เปิดอยู่');
  });

  it('shows the empty state instead of a table when there is no overview yet', () => {
    const fixture = render(buildCrmFake(null));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีข้อมูล');
  });
});

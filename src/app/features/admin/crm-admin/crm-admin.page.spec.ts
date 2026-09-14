import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CrmAdminPage } from './crm-admin.page';
import { CrmService } from '../../../core/services';
import type { AdminDemandGap, CrmOverview } from '../../../core/models';

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

function buildDemandGap(overrides: Partial<AdminDemandGap> = {}): AdminDemandGap {
  return {
    term: 'ฟิสิกส์ ม.6',
    searchCount: 40,
    zeroResultCount: 30,
    zeroResultRate: 0.75,
    userCount: 6,
    lastSeenDate: '2026-09-13',
    matchedFacetLabel: 'วิทยาศาสตร์',
    ...overrides,
  };
}

function buildCrmFake(overview: CrmOverview | null, demandGaps: AdminDemandGap[] = []) {
  return {
    adminOverview: () => overview,
    loadingOverview: () => false,
    loadOverview: vi.fn(async () => {}),
    demandGaps: () => demandGaps,
    demandGapsPage: () => 1,
    demandGapsPageSize: () => 20,
    demandGapsTotalCount: () => demandGaps.length,
    demandGapsTotalPages: () => 1,
    demandGapsLoading: () => false,
    loadDemandGaps: vi.fn(async () => {}),
    onDemandGapsPageChange: vi.fn(async () => {}),
    onDemandGapsPageSizeChange: vi.fn(async () => {}),
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

/**
 * crm-targeted-document-alerts v2 §4.1/§4.3 (`docs/contracts/crm-targeted-document-alerts.md`,
 * F-12, ข้อ 11) — the one card this page gains: a link into the new admin-only page.
 */
describe('CrmAdminPage — การ์ดลิงก์ไปหน้าการแจ้งเตือนเอกสารตรงความสนใจ', () => {
  it('renders the card with its Thai copy and a link to /admin/crm/document-alerts', () => {
    const fixture = render(buildCrmFake(buildOverview()));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('การแจ้งเตือนเอกสารตรงความสนใจ');
    expect(el.textContent).toContain('ดูว่าเอกสารใหม่ถูกดันเข้าหาลูกค้ากลุ่มไหนบ้าง');

    const link = Array.from(el.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/admin/crm/document-alerts',
    );
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('ดูรายละเอียด');
  });
});

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.4/§4.3/§1.4 (F-10, ข้อ 13)
 * — "ตาราง 'คำค้นที่หาแล้วไม่เจอ' render ครบ และ empty state เป็น 'ยังไม่มีข้อมูล'".
 */
describe('CrmAdminPage — คำค้นที่หาแล้วไม่เจอ (crm-driven-discovery v1 §3.4)', () => {
  it('loads the demand gaps once on init', () => {
    const crmFake = buildCrmFake(buildOverview());
    render(crmFake);
    expect(crmFake.loadDemandGaps).toHaveBeenCalledTimes(1);
  });

  it('renders every row with its term/searchCount/zeroResultCount/percent/userCount/matchedFacetLabel', () => {
    const fixture = render(
      buildCrmFake(buildOverview(), [
        buildDemandGap({ term: 'ฟิสิกส์ ม.6', searchCount: 40, zeroResultCount: 30, zeroResultRate: 0.75, userCount: 6, matchedFacetLabel: 'วิทยาศาสตร์' }),
      ]),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คำค้นที่หาแล้วไม่เจอ (30 วันล่าสุด)');
    expect(text).toContain('ฟิสิกส์ ม.6');
    expect(text).toContain('40');
    expect(text).toContain('30');
    expect(text).toContain('75%');
    expect(text).toContain('6');
    expect(text).toContain('วิทยาศาสตร์');
  });

  it('renders "—" for matchedFacetLabel when it is null', () => {
    const fixture = render(buildCrmFake(buildOverview(), [buildDemandGap({ matchedFacetLabel: null })]));

    const row = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr');
    const lastRow = row[row.length - 1];
    expect(lastRow.textContent).toContain('—');
  });

  it('shows the "ยังไม่มีข้อมูล" empty state when there are no demand gaps', () => {
    const fixture = render(buildCrmFake(buildOverview(), []));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีข้อมูล');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CrmDocumentAlertsAdminPage } from './crm-document-alerts-admin.page';
import { CrmService } from '../../../core/services';
import type { CrmDocumentAlertOverview } from '../../../core/models';

/**
 * crm-targeted-document-alerts v2 §3.3, §4.1, §4.3 (`docs/contracts/crm-targeted-document-alerts.md`,
 * F-12, ข้อ 11) — AC-27: page renders all 6 stat cards + the recent-documents table + the
 * "ยังไม่มีข้อมูล" empty state + the 7/14/30-day range picker.
 *
 * Backend gate 1 had already passed and `openapi.snapshot.json` was updated before this page was
 * built, so `CrmService.loadDocumentAlerts` is wired to the real SDK from the start — no
 * `TODO(contract)` round here, same as every other page in this describe file style.
 */

function buildOverview(overrides: Partial<CrmDocumentAlertOverview> = {}): CrmDocumentAlertOverview {
  return {
    days: 7,
    pendingCount: 12,
    sentCount: 34,
    suppressedCount: 3,
    digestCount: 9,
    recipientCount: 21,
    documentCount: 5,
    averageMatchScore: 0.68,
    lastQueuedAt: '2026-09-15T03:00:00Z',
    lastSentAt: '2026-09-15T04:00:00Z',
    documents: [
      {
        documentId: 'doc-1',
        documentTitle: 'แบบฝึกหัดคณิตศาสตร์ ป.4 ชุดที่ 2',
        studioName: 'ร้านครูใจดี',
        queuedAt: '2026-09-15T02:00:00Z',
        matchedCount: 8,
        sentCount: 6,
        averageMatchScore: 0.72,
      },
      {
        documentId: 'doc-2',
        documentTitle: 'ใบงานวิทยาศาสตร์ ป.4',
        studioName: 'ร้านวิทย์สนุก',
        queuedAt: '2026-09-14T09:00:00Z',
        matchedCount: 4,
        sentCount: 2,
        averageMatchScore: 0.61,
      },
    ],
    ...overrides,
  };
}

function buildCrmFake(overview: CrmDocumentAlertOverview | null) {
  return {
    documentAlerts: () => overview,
    loadingDocumentAlerts: () => false,
    loadDocumentAlerts: vi.fn(async () => {}),
  };
}

function render(crmFake: ReturnType<typeof buildCrmFake>) {
  TestBed.configureTestingModule({
    imports: [CrmDocumentAlertsAdminPage],
    providers: [provideRouter([]), { provide: CrmService, useValue: crmFake }],
  });
  const fixture = TestBed.createComponent(CrmDocumentAlertsAdminPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('CrmDocumentAlertsAdminPage', () => {
  it('loads document alerts for the default 7-day range once on init', () => {
    const crmFake = buildCrmFake(buildOverview());
    render(crmFake);
    expect(crmFake.loadDocumentAlerts).toHaveBeenCalledTimes(1);
    expect(crmFake.loadDocumentAlerts).toHaveBeenCalledWith(7);
  });

  it('AC-27: renders all 6 stat cards with their values', () => {
    const fixture = render(buildCrmFake(buildOverview()));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('รอส่ง');
    expect(text).toContain('12 รายการ');
    expect(text).toContain('ส่งแล้วในช่วงนี้');
    expect(text).toContain('34 รายการ');
    expect(text).toContain('จำนวนสรุปที่ส่ง');
    expect(text).toContain('9 ฉบับ');
    expect(text).toContain('ผู้รับ (ไม่ซ้ำ)');
    expect(text).toContain('21 คน');
    expect(text).toContain('คะแนนความตรงเฉลี่ย');
    expect(text).toContain('68%');
    expect(text).toContain('ประมวลผลล่าสุด');
  });

  it('AC-27: renders the recent-documents table with every column', () => {
    const fixture = render(buildCrmFake(buildOverview()));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('เอกสารล่าสุดที่ถูกดันเข้าหาผู้ที่สนใจ');
    const rows = el.querySelectorAll('tbody tr');
    expect(rows.length).toBe(2);

    const firstRow = rows[0].textContent ?? '';
    expect(firstRow).toContain('แบบฝึกหัดคณิตศาสตร์ ป.4 ชุดที่ 2');
    expect(firstRow).toContain('ร้านครูใจดี');
    expect(firstRow).toContain('8 คน');
    expect(firstRow).toContain('6 คน');
    expect(firstRow).toContain('72%');
  });

  it('AC-27: shows the "ยังไม่มีข้อมูล" empty state when there are no documents', () => {
    const fixture = render(buildCrmFake(buildOverview({ documents: [] })));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ยังไม่มีข้อมูล');
  });

  it('shows the "ยังไม่เคยมีเอกสารเข้าคิว" banner when lastQueuedAt is null', () => {
    const fixture = render(buildCrmFake(buildOverview({ lastQueuedAt: null })));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'ยังไม่เคยมีเอกสารเข้าคิว — ตรวจสอบว่างาน job.new-document-alerts เปิดอยู่',
    );
  });

  it('shows the empty state instead of stats/table when there is no overview yet', () => {
    const fixture = render(buildCrmFake(null));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ยังไม่มีข้อมูล');
  });

  it('AC-27: reloads with the newly selected day range when a range button is clicked', async () => {
    const crmFake = buildCrmFake(buildOverview());
    const fixture = render(crmFake);
    const el = fixture.nativeElement as HTMLElement;

    const button14 = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === '14 วัน');
    expect(button14).toBeTruthy();
    button14?.click();
    await fixture.whenStable();

    expect(crmFake.loadDocumentAlerts).toHaveBeenCalledTimes(2);
    expect(crmFake.loadDocumentAlerts).toHaveBeenLastCalledWith(14);
  });

  it('reloads the current day range again when "รีเฟรช" is clicked', async () => {
    const crmFake = buildCrmFake(buildOverview());
    const fixture = render(crmFake);
    const el = fixture.nativeElement as HTMLElement;

    const refreshButton = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'รีเฟรช');
    expect(refreshButton).toBeTruthy();
    refreshButton?.click();
    await fixture.whenStable();

    expect(crmFake.loadDocumentAlerts).toHaveBeenCalledTimes(2);
    expect(crmFake.loadDocumentAlerts).toHaveBeenLastCalledWith(7);
  });

  it('shows the PDPA disclaimer and a link to /admin/notification-config', () => {
    const fixture = render(buildCrmFake(buildOverview()));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain(
      'ข้อมูลนี้เป็นตัวเลขรวมเท่านั้น ระบบไม่เปิดเผยรายชื่อผู้รับให้ผู้ขายหรือผู้ดูแลระบบผ่านหน้านี้',
    );
    const link = Array.from(el.querySelectorAll('a')).find(
      (a) => a.getAttribute('href') === '/admin/notification-config',
    );
    expect(link).toBeTruthy();
  });
});

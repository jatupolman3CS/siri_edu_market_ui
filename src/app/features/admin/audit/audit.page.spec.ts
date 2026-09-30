import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAuditLogResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AdminAuditPage } from './audit.page';
import { AUDIT_ACTION_KEYS, AUDIT_ENTITY_KEYS, humanizeAuditValue } from './audit-labels';

/**
 * responsive-ui v1.6.1 GR3-e (§4.8 v1.6.1, §1.5 v1.6.1, R-21): `/admin/audit` showed raw action
 * codes (`payout.requested`, `user.suspend` …) and raw entity types (`User`, `AdsCampaign` …).
 * Every code and type now goes through a static code → key map; an unknown one renders humanized.
 */

type Row = [value: string, key: string, th: string, en: string];

/** §4.8 v1.6.1: the 30 action codes (27 written by the backend today + 3 legacy), key, th, en. */
const ACTIONS: Row[] = [
  ['document.approve', 'admin.audit.actionDocumentApprove', 'อนุมัติเอกสาร', 'Approve document'],
  ['document.reject', 'admin.audit.actionDocumentReject', 'ปฏิเสธเอกสาร', 'Reject document'],
  ['document.patch', 'admin.audit.actionDocumentPatch', 'แก้ไขข้อมูลเอกสาร', 'Edit document info'],
  ['document.bulk', 'admin.audit.actionDocumentBulk', 'จัดการเอกสารเป็นกลุ่ม', 'Bulk document action'],
  ['document.report.create', 'admin.audit.actionDocumentReportCreate', 'รายงานปัญหาเอกสาร', 'Create document report'],
  ['document.report.resolve', 'admin.audit.actionDocumentReportResolve', 'จัดการรายงานปัญหา', 'Resolve report'],
  ['document.report.resolve_all', 'admin.audit.actionDocumentReportResolveAll', 'จัดการรายงานปัญหาทั้งหมด', 'Resolve all reports'],
  ['order.refund', 'admin.audit.actionOrderRefund', 'คืนเงินคำสั่งซื้อ', 'Refund order'],
  ['payout.approve', 'admin.audit.actionPayoutApprove', 'อนุมัติการถอนเงิน', 'Approve payout'],
  ['payout.reject', 'admin.audit.actionPayoutReject', 'ปฏิเสธการถอนเงิน', 'Reject payout'],
  ['user.suspend', 'admin.audit.actionUserSuspend', 'ระงับบัญชีผู้ใช้ชั่วคราว', 'Suspend user'],
  ['user.ban', 'admin.audit.actionUserBan', 'แบนบัญชีผู้ใช้ถาวร', 'Ban user permanently'],
  ['user.reinstate', 'admin.audit.actionUserReinstate', 'ปลดระงับบัญชีผู้ใช้', 'Reinstate user'],
  ['payout.requested', 'admin.audit.actionPayoutRequested', 'ขอถอนเงิน', 'Request payout'],
  ['payout.cancelled', 'admin.audit.actionPayoutCancelled', 'ยกเลิกคำขอถอนเงิน', 'Cancel payout request'],
  ['payout.status_changed', 'admin.audit.actionPayoutStatusChanged', 'อัปเดตสถานะการถอนเงิน', 'Update payout status'],
  ['payout.slip_uploaded', 'admin.audit.actionPayoutSlipUploaded', 'อัปโหลดสลิปการโอนเงิน', 'Upload payout slip'],
  ['payout.complete_manual', 'admin.audit.actionPayoutCompleteManual', 'ยืนยันการโอนเงินด้วยตนเอง', 'Complete payout manually'],
  ['payout.completed_auto', 'admin.audit.actionPayoutCompletedAuto', 'ยืนยันการโอนเงินอัตโนมัติ', 'Auto-complete payout'],
  ['seller_payout_account.create', 'admin.audit.actionSellerPayoutAccountCreate', 'เพิ่มบัญชีรับเงินของผู้ขาย', 'Add seller payout account'],
  ['seller_payout_account.update', 'admin.audit.actionSellerPayoutAccountUpdate', 'แก้ไขบัญชีรับเงินของผู้ขาย', 'Update seller payout account'],
  ['seller_payout_account.reveal', 'admin.audit.actionSellerPayoutAccountReveal', 'แสดงเลขบัญชีรับเงินเต็ม', 'Reveal payout account number'],
  ['ads_campaign.created', 'admin.audit.actionAdsCampaignCreated', 'สร้างแคมเปญโฆษณา', 'Create ad campaign'],
  ['ads_campaign.cancelled', 'admin.audit.actionAdsCampaignCancelled', 'ยกเลิกแคมเปญโฆษณา', 'Cancel ad campaign'],
  ['ads_campaign.stopped', 'admin.audit.actionAdsCampaignStopped', 'ระงับแคมเปญโฆษณา', 'Stop ad campaign'],
  ['ads_campaign.auto_refunded', 'admin.audit.actionAdsCampaignAutoRefunded', 'คืนเงินแคมเปญโฆษณาอัตโนมัติ', 'Auto-refund ad campaign'],
  ['ads_placement.updated', 'admin.audit.actionAdsPlacementUpdated', 'แก้ไขตำแหน่งโฆษณา', 'Update ad placement'],
  ['affiliate.settings_updated', 'admin.audit.actionAffiliateSettingsUpdated', 'แก้ไขการตั้งค่าลิงก์พันธมิตร', 'Update affiliate link settings'],
  ['feedback.status.change', 'admin.audit.actionFeedbackStatusChange', 'เปลี่ยนสถานะเรื่องแจ้งปัญหา', 'Change feedback status'],
  ['feedback.delete', 'admin.audit.actionFeedbackDelete', 'ลบเรื่องแจ้งปัญหา', 'Delete feedback'],
];

/** §4.8 v1.6.1: the 9 entity types, key, th, en. */
const ENTITIES: Row[] = [
  ['Document', 'admin.audit.entityDocument', 'เอกสาร', 'Document'],
  ['Payout', 'admin.audit.entityPayout', 'การถอนเงิน', 'Payout'],
  ['Order', 'admin.audit.entityOrder', 'คำสั่งซื้อ', 'Order'],
  ['User', 'admin.audit.entityUser', 'ผู้ใช้', 'User'],
  ['AdsCampaign', 'admin.audit.entityAdsCampaign', 'แคมเปญโฆษณา', 'Ad campaign'],
  ['AdsPlacement', 'admin.audit.entityAdsPlacement', 'ตำแหน่งโฆษณา', 'Ad placement'],
  ['AffiliateLink', 'admin.audit.entityAffiliateLink', 'ลิงก์พันธมิตร', 'Affiliate link'],
  ['SellerPayoutAccount', 'admin.audit.entitySellerPayoutAccount', 'บัญชีรับเงินของผู้ขาย', 'Seller payout account'],
  ['Feedback', 'admin.audit.entityFeedback', 'เรื่องแจ้งปัญหา', 'Feedback'],
];

const ACTION_DEFAULT = { th: 'การกระทำ', en: 'Action' };
const ENTITY_DEFAULT = { th: 'รายการ', en: 'Item' };

function entry(action: string, entityType: string, i: number): AdminAuditLogResponse {
  return {
    id: `audit-${i}`,
    actorUserId: 'admin-1',
    actorName: 'แอดมิน',
    action,
    entityType,
    entityId: `entity-${i}`,
    entityTitle: null,
    detailsJson: null,
    createdAt: '2026-09-30T03:00:00Z',
  };
}

function setup(entries: AdminAuditLogResponse[] = []) {
  const listAuditLog = vi.fn(async () => ({
    items: entries,
    page: 1,
    pageSize: 50,
    totalCount: entries.length,
    totalPages: 1,
  }));
  TestBed.configureTestingModule({
    imports: [AdminAuditPage],
    providers: [
      provideRouter([]),
      { provide: AdminService, useValue: { listAuditLog } },
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
    ],
  });
  const translation = TestBed.inject(TranslationService);
  translation.setLanguage('th');
  const fixture = TestBed.createComponent(AdminAuditPage);
  return { fixture, page: fixture.componentInstance, translation, listAuditLog };
}

async function settle(fixture: ReturnType<typeof setup>['fixture']): Promise<void> {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('AdminAuditPage — audit labels (responsive-ui v1.6.1 GR3-e)', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.translation.setLanguage('th');
    TestBed.resetTestingModule();
  });

  it('maps exactly the 30 codes and 9 types of §4.8 v1.6.1, each to its own key', () => {
    expect(AUDIT_ACTION_KEYS.size).toBe(30);
    expect(AUDIT_ENTITY_KEYS.size).toBe(9);
    expect([...AUDIT_ACTION_KEYS.entries()].sort()).toEqual(ACTIONS.map(([code, key]) => [code, key]).sort());
    expect([...AUDIT_ENTITY_KEYS.entries()].sort()).toEqual(ENTITIES.map(([type, key]) => [type, key]).sort());
  });

  it.each(ACTIONS)('case 1 — actionLabel(%s) shows its key (%s) in th and en', (code, key, th, en) => {
    const { page, translation } = ctx;
    translation.setLanguage('th');
    expect(translation.t(key)).toBe(th);
    expect(page.actionLabel(code)).toBe(th);

    translation.setLanguage('en');
    expect(translation.t(key)).toBe(en);
    expect(page.actionLabel(code)).toBe(en);
  });

  it.each(ENTITIES)('case 2 — entityTypeLabel(%s) shows its key (%s) in th and en', (type, key, th, en) => {
    const { page, translation } = ctx;
    translation.setLanguage('th');
    expect(translation.t(key)).toBe(th);
    expect(page.entityTypeLabel(type)).toBe(th);

    translation.setLanguage('en');
    expect(translation.t(key)).toBe(en);
    expect(page.entityTypeLabel(type)).toBe(en);
  });

  it('case 3 — unknown values render humanized, with the same text in both languages', () => {
    const { page, translation } = ctx;
    for (const lang of ['th', 'en'] as const) {
      translation.setLanguage(lang);
      expect(page.actionLabel('report.export_started')).toBe('Report export started');
      expect(page.actionLabel('feedback.bulkClose')).toBe('Feedback bulk close');
      expect(page.entityTypeLabel('ReportExport')).toBe('Report export');
      // One helper serves both: an unknown code as a type, and an unknown type as a code.
      expect(page.entityTypeLabel('report.export_started')).toBe('Report export started');
      expect(page.actionLabel('ReportExport')).toBe('Report export');
    }
  });

  it('case 3 — the humanizer follows the three steps of §4.8 v1.6.1', () => {
    expect(humanizeAuditValue('report.export_started')).toBe('Report export started');
    expect(humanizeAuditValue('feedback.bulkClose')).toBe('Feedback bulk close');
    expect(humanizeAuditValue('ReportExport')).toBe('Report export');
    expect(humanizeAuditValue('ads-campaign..v2Paused')).toBe('Ads campaign v2 paused');
    expect(humanizeAuditValue('  user__bulk--ban  ')).toBe('User bulk ban');
    expect(humanizeAuditValue('._-')).toBe('');
  });

  it('case 4 — an empty or missing value gives the default label; so does one that humanizes to nothing', () => {
    const { page, translation } = ctx;
    for (const lang of ['th', 'en'] as const) {
      translation.setLanguage(lang);
      expect(page.actionLabel(undefined)).toBe(ACTION_DEFAULT[lang]);
      expect(page.actionLabel('')).toBe(ACTION_DEFAULT[lang]);
      expect(page.actionLabel('._-')).toBe(ACTION_DEFAULT[lang]);
      expect(page.entityTypeLabel(undefined)).toBe(ENTITY_DEFAULT[lang]);
      expect(page.entityTypeLabel('')).toBe(ENTITY_DEFAULT[lang]);
      expect(page.entityTypeLabel(' _ ')).toBe(ENTITY_DEFAULT[lang]);
    }
  });

  it('a code that only looks like an object key is not a match (static map, no prototype lookups)', () => {
    const { page } = ctx;
    expect(page.actionLabel('constructor')).toBe('Constructor');
    expect(page.entityTypeLabel('toString')).toBe('To string');
  });
});

describe('AdminAuditPage — rendered rows show no raw code, type or key (U4-9)', () => {
  afterEach(() => {
    TestBed.inject(TranslationService).setLanguage('th');
    TestBed.resetTestingModule();
  });

  it('every action pill and entity label shows its translation in th and en; unknowns are humanized', async () => {
    const entries = [
      ...ACTIONS.map(([code], i) => entry(code, ENTITIES[i % ENTITIES.length][0], i)),
      entry('report.export_started', 'ReportExport', ACTIONS.length),
    ];
    const ctx = setup(entries);
    await settle(ctx.fixture);
    expect(ctx.listAuditLog).toHaveBeenCalledTimes(1);

    for (const lang of ['th', 'en'] as const) {
      ctx.translation.setLanguage(lang);
      ctx.fixture.detectChanges();
      const root = ctx.fixture.nativeElement as HTMLElement;
      const items = Array.from(root.querySelectorAll('ul > li'));
      expect(items.length).toBe(entries.length);

      const pills = items.map((li) => (li.querySelector('.pill')?.textContent ?? '').trim());
      const expectedPills = [...ACTIONS.map((row) => (lang === 'th' ? row[2] : row[3])), 'Report export started'];
      expect(pills).toEqual(expectedPills);

      items.forEach((li, i) => {
        const type = entries[i].entityType ?? '';
        const known = ENTITIES.find(([t]) => t === type);
        const label = known ? (lang === 'th' ? known[2] : known[3]) : 'Report export';
        expect(li.textContent).toContain(label);
      });

      for (const pill of pills) {
        expect(pill).not.toMatch(/[._]/);
      }
      const text = root.textContent ?? '';
      expect(text).not.toContain('admin.audit.');
      for (const [code] of ACTIONS) {
        expect(text).not.toContain(code);
      }
      for (const raw of ['SellerPayoutAccount', 'AdsCampaign', 'AdsPlacement', 'AffiliateLink', 'ReportExport']) {
        expect(text).not.toContain(raw);
      }
    }
  });
});

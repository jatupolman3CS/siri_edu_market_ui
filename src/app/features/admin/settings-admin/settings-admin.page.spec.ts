import { TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminSettingsPage } from './settings-admin.page';
import {
  AdminService,
  type AdminWatermarkCopy,
  type PlatformSettings,
  type SystemConfigJobToggle,
} from '../../../core/services/admin.service';

/**
 * system-config-job-toggle v1 (docs/contracts/system-config-job-toggle.md §4).
 *
 * Drives the page against a stubbed `AdminService` (via `vi.spyOn`) — same pattern as
 * `categories-admin.page.spec.ts` — since `AdminService.loadJobToggles`/`updateJobToggle`
 * are still `TODO(contract)` stubs awaiting SDK regen (see admin.service.ts §"Background job
 * toggles"). This spec exercises the page's rendering/wiring only, not the real HTTP call
 * (there is no real SDK call to exercise yet).
 *
 * `seedJobToggles` reaches into `AdminService`'s private `_jobToggles` signal (the same one
 * `loadJobToggles`/`updateJobToggle` write to on success) to simulate a successful load without
 * depending on the stub body, which deliberately still throws `TODO(contract)`.
 */
let messages: { success: string[]; warning: string[]; error: string[] };

function jobToggle(overrides: Partial<SystemConfigJobToggle> = {}): SystemConfigJobToggle {
  return {
    jobKey: 'job.application-log-cleanup.enabled',
    category: 'BackgroundJob',
    displayName: 'ล้าง Log ระบบอัตโนมัติ (Application Log)',
    description: 'ลบแถวใน APPLICATION_LOG ที่เก่ากว่าระยะเวลาที่กำหนด (ค่าเริ่มต้น 30 วัน) ทำงานทุก 24 ชั่วโมง',
    enabled: true,
    updatedAt: null,
    ...overrides,
  };
}

const fourJobToggles: SystemConfigJobToggle[] = [
  jobToggle(),
  jobToggle({
    jobKey: 'job.external-call-log-cleanup.enabled',
    displayName: 'ล้าง Log การเรียกระบบภายนอก (External Call Log)',
    description:
      'ลบแถวใน EXTERNAL_CALL_LOG ที่เก่ากว่าระยะเวลาที่กำหนด (ค่าเริ่มต้น 90 วัน) ทำงานทุก 24 ชั่วโมง',
  }),
  jobToggle({
    jobKey: 'job.maintenance-cleanup.enabled',
    displayName: 'ล้าง Token และคำสั่งซื้อค้างชำระ (Maintenance Cleanup)',
    description:
      'ลบ token ที่หมดอายุ และยกเลิกคำสั่งซื้อที่ค้างชำระนานเกินกำหนด ทำงานทุก 6 ชั่วโมง (ปรับความถี่ได้ที่ appsettings)',
  }),
  jobToggle({
    jobKey: 'job.anonymous-session-cleanup.enabled',
    displayName: 'ล้างเซสชันผู้เยี่ยมชมที่ไม่ล็อกอิน (Anonymous Session)',
    description: 'ลบแถวใน ANONYMOUS_SESSION ที่หมดอายุแล้ว ทำงานทุก 24 ชั่วโมง',
    enabled: false,
    updatedAt: '2026-08-01T03:04:05Z',
  }),
];

function seedJobToggles(admin: AdminService, list: SystemConfigJobToggle[]): void {
  const target = admin as unknown as { _jobToggles: WritableSignal<SystemConfigJobToggle[]> };
  target._jobToggles.set(list);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** watermark-completion v1 §3.2: a fully-populated settings response. */
function platformSettings(overrides: Partial<PlatformSettings> = {}): PlatformSettings {
  return {
    feeRatePercent: 12,
    vatPercent: 7,
    payoutMinTHB: 500,
    payoutSchedule: 'monthly-15',
    watermarkPolicy: 'required_when_supported',
    watermarkDefaultEnabled: true,
    watermarkForensicEnabled: true,
    watermarkCopyRetentionDays: 90,
    watermarkDefaultSubtitle: null,
    ...overrides,
  };
}

/** watermark-completion v1 §3.3: one row of `GET /api/admin/watermark-copies`. */
function watermarkCopy(overrides: Partial<AdminWatermarkCopy> = {}): AdminWatermarkCopy {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    watermarkToken: 'WMK-ABC12345',
    documentId: '22222222-2222-2222-2222-222222222222',
    documentTitle: 'สรุปเคมี ม.6',
    documentFormat: 'pdf',
    sellerId: '33333333-3333-3333-3333-333333333333',
    sellerName: 'ร้านครูเคมี',
    recipientUserId: '44444444-4444-4444-4444-444444444444',
    recipientName: 'สมชาย ใจดี',
    recipientEmail: 'somchai@example.com',
    orderId: '55555555-5555-5555-5555-555555555555',
    accessSource: 'purchase',
    watermarkApplied: true,
    watermarkMode: 'raster',
    failureReason: null,
    storageKey: 'docs/watermarked/2222/WMK-ABC12345.pdf',
    sizeBytes: 1024,
    renderDurationMs: 820,
    createdAt: '2026-09-01T04:05:06Z',
    lastAccessedAt: '2026-09-10T08:09:10Z',
    purgedAt: null,
    ...overrides,
  };
}

function renderPage(settings: PlatformSettings | null = null) {
  messages = { success: [], warning: [], error: [] };

  TestBed.configureTestingModule({
    imports: [AdminSettingsPage],
    providers: [
      {
        provide: NzMessageService,
        useValue: {
          success: (m: string) => messages.success.push(m),
          warning: (m: string) => messages.warning.push(m),
          error: (m: string) => messages.error.push(m),
        },
      },
    ],
  });

  const admin = TestBed.inject(AdminService);
  vi.spyOn(admin, 'loadSettings').mockResolvedValue(settings);
  vi.spyOn(admin, 'loadStorageUsage').mockResolvedValue(null);
  vi.spyOn(admin, 'loadJobToggles').mockImplementation(async () => {
    seedJobToggles(admin, fourJobToggles);
    return fourJobToggles;
  });

  const fixture = TestBed.createComponent(AdminSettingsPage);
  fixture.detectChanges();
  return { fixture, admin };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('AdminSettingsPage — background job toggles (system-config-job-toggle v1)', () => {
  it('AC-8: renders all 4 jobs with their Thai display names, description and updatedAt', async () => {
    const { fixture } = renderPage();
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('งานอัตโนมัติเบื้องหลัง (Background Jobs)');
    for (const job of fourJobToggles) {
      expect(text).toContain(job.displayName as string);
      expect(text).toContain(job.description as string);
    }
    // null updatedAt renders the Thai placeholder, not blank/`null`.
    expect(text).toContain('ยังไม่เคยเปลี่ยนแปลง');
  });

  it('flips a switch through admin.updateJobToggle with the right jobKey/enabled, then toasts success', async () => {
    const { fixture, admin } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const updateSpy = vi.spyOn(admin, 'updateJobToggle').mockResolvedValue({
      ...fourJobToggles[0],
      enabled: false,
    });

    await page.toggleJob(fourJobToggles[0], false);

    expect(updateSpy).toHaveBeenCalledWith('job.application-log-cleanup.enabled', false);
    expect(messages.success).toContain('อัปเดตสถานะงานเรียบร้อย');
    expect(page.savingJobKey()).toBeNull();
  });

  it('on failure, does not toast success and clears the in-flight guard (AdminService already reported the error)', async () => {
    const { fixture, admin } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    vi.spyOn(admin, 'updateJobToggle').mockRejectedValue(new Error('boom'));

    await page.toggleJob(fourJobToggles[3], true);

    expect(messages.success).toEqual([]);
    expect(page.savingJobKey()).toBeNull();
  });

  it('guards against double-click: a second toggle while one is in flight is ignored', async () => {
    const { fixture, admin } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    let resolveFirst!: (v: SystemConfigJobToggle) => void;
    const updateSpy = vi
      .spyOn(admin, 'updateJobToggle')
      .mockImplementation(() => new Promise((resolve) => (resolveFirst = resolve)));

    const first = page.toggleJob(fourJobToggles[0], false);
    const second = page.toggleJob(fourJobToggles[1], false);

    expect(updateSpy).toHaveBeenCalledTimes(1);

    resolveFirst({ ...fourJobToggles[0], enabled: false });
    await Promise.all([first, second]);
  });
});

describe('AdminSettingsPage — watermark policy card (watermark-completion v1 §4.1)', () => {
  it('renders the 5 policy controls with the Thai copy from §4.1', async () => {
    const { fixture } = renderPage(platformSettings());
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('นโยบายลายน้ำ');
    expect(text).toContain('ให้ผู้ขายเลือกเอง');
    expect(text).toContain('บังคับเมื่อไฟล์รองรับ');
    expect(text).toContain('บังคับทุกกรณี');
    expect(text).toContain('เปิดลายน้ำเป็นค่าเริ่มต้นสำหรับเอกสารใหม่');
    expect(text).toContain('ฝังรหัสสำเนารายผู้ซื้อ (ตรวจสอบย้อนหลังได้)');
    expect(text).toContain('ปิดแล้วจะใช้ไฟล์ลายน้ำร่วมไฟล์เดียวต่อเอกสาร และจะสืบหาผู้เผยแพร่ไม่ได้');
    expect(text).toContain('เก็บไฟล์สำเนาไว้กี่วัน');
    expect(text).toContain('เลยกำหนดแล้วระบบจะลบเฉพาะไฟล์ ข้อมูลรหัสสำเนายังอยู่');
    expect(text).toContain('ข้อความลายน้ำเริ่มต้นของระบบ');
  });

  it('§3.2/§4.1: PUT carries only the watermark fields the admin touched', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    const saveSpy = vi.spyOn(admin, 'saveSettings').mockResolvedValue(platformSettings());

    page.patch('watermarkPolicy', 'required_always');
    await page.save();

    expect(saveSpy).toHaveBeenCalledWith({
      feeRatePercent: 12,
      vatPercent: 7,
      payoutMinTHB: 500,
      payoutSchedule: 'monthly-15',
      watermarkPolicy: 'required_always',
    });
    expect(messages.success).toContain('บันทึกการตั้งค่าเรียบร้อย');
  });

  it('§3.2: an untouched watermark section is not sent at all (nullable = leave as is)', async () => {
    const { fixture, admin } = renderPage(platformSettings({ watermarkPolicy: 'seller_choice' }));
    await settle();
    const page = fixture.componentInstance;
    const saveSpy = vi.spyOn(admin, 'saveSettings').mockResolvedValue(platformSettings());

    page.patch('vatPercent', 10);
    await page.save();

    expect(saveSpy).toHaveBeenCalledWith({
      feeRatePercent: 12,
      vatPercent: 10,
      payoutMinTHB: 500,
      payoutSchedule: 'monthly-15',
    });
  });

  it('§3.2: an empty subtitle is sent as "" (clear), not dropped', async () => {
    const { fixture, admin } = renderPage(
      platformSettings({ watermarkDefaultSubtitle: 'ห้ามเผยแพร่ต่อ' }),
    );
    await settle();
    const page = fixture.componentInstance;
    const saveSpy = vi.spyOn(admin, 'saveSettings').mockResolvedValue(platformSettings());

    page.patch('watermarkDefaultSubtitle', '   ');
    await page.save();

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ watermarkDefaultSubtitle: '' }),
    );
  });

  it('§2.2: refuses to send a retention outside 7–3650 instead of waiting for the 400', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    const saveSpy = vi.spyOn(admin, 'saveSettings').mockResolvedValue(platformSettings());

    page.patch('watermarkCopyRetentionDays', 4000);
    await page.save();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(messages.error.join(' ')).toContain('7');
  });
});

describe('AdminSettingsPage — watermark copy lookup (watermark-completion v1 §4.2)', () => {
  it('looks the token up through AdminService and renders the row', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    const searchSpy = vi
      .spyOn(admin, 'searchWatermarkCopies')
      .mockResolvedValue([watermarkCopy()]);

    page.copyToken.set('  WMK-ABC12345  ');
    await page.searchWatermarkCopy();
    fixture.detectChanges();

    expect(searchSpy).toHaveBeenCalledWith({ token: 'WMK-ABC12345' });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('WMK-ABC12345');
    expect(text).toContain('สรุปเคมี ม.6');
    expect(text).toContain('สมชาย ใจดี');
    expect(text).toContain('somchai@example.com');
    expect(text).toContain('ซื้อ');
    expect(text).toContain('ประทับในหน้า PDF');
  });

  it('shows the §4.2 empty message when nothing matched (200 with items: [])', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    vi.spyOn(admin, 'searchWatermarkCopies').mockResolvedValue([]);

    page.copyToken.set('WMK-NOTHERE1');
    await page.searchWatermarkCopy();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'ไม่พบรหัสสำเนานี้ในระบบ',
    );
  });

  it('a failed lookup is not reported as "not found"', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    vi.spyOn(admin, 'searchWatermarkCopies').mockRejectedValue(new Error('boom'));

    page.copyToken.set('WMK-ABC12345');
    await page.searchWatermarkCopy();
    fixture.detectChanges();

    expect(page.copySearched()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'ไม่พบรหัสสำเนานี้ในระบบ',
    );
  });

  it('does not call the endpoint for an empty code', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    const searchSpy = vi.spyOn(admin, 'searchWatermarkCopies');

    page.copyToken.set('   ');
    await page.searchWatermarkCopy();

    expect(searchSpy).not.toHaveBeenCalled();
    expect(messages.warning).toContain('กรุณากรอกรหัสสำเนาก่อนค้นหา');
  });

  it('renders the failure reason in Thai for a copy that could not be stamped', async () => {
    const { fixture, admin } = renderPage(platformSettings());
    await settle();
    const page = fixture.componentInstance;
    vi.spyOn(admin, 'searchWatermarkCopies').mockResolvedValue([
      watermarkCopy({
        watermarkApplied: false,
        watermarkMode: 'none',
        failureReason: 'disabled_by_seller',
      }),
    ]);

    page.copyToken.set('WMK-ABC12345');
    await page.searchWatermarkCopy();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่ได้ประทับลายน้ำ');
    expect(text).toContain('ผู้ขายปิดลายน้ำ');
  });
});

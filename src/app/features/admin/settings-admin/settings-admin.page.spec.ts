import { TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminSettingsPage } from './settings-admin.page';
import { AdminService, type SystemConfigJobToggle } from '../../../core/services/admin.service';

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

function renderPage() {
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
  vi.spyOn(admin, 'loadSettings').mockResolvedValue(null);
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

import { TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminDocumentGenerationPage } from './document-generation.page';
import {
  AdminService,
  type DocumentGenerationEligibleCategory,
  type DocumentGenerationRun,
  type SystemConfigJobToggle,
} from '../../../core/services/admin.service';

/**
 * category-content-auto-generation v1 (docs/contracts/category-content-auto-generation.md §4).
 *
 * Drives the page against a stubbed `AdminService` (via `vi.spyOn`) — same pattern as
 * `settings-admin.page.spec.ts` — since `AdminService.loadDocumentGenerationCategories` /
 * `runDocumentGeneration` / `loadDocumentGenerationRuns` are still `TODO(contract)` no-op stubs
 * awaiting the backend + SDK regen. This spec exercises the page's rendering/wiring only.
 */
let messages: { success: string[]; warning: string[]; error: string[] };

function category(
  overrides: Partial<DocumentGenerationEligibleCategory> = {},
): DocumentGenerationEligibleCategory {
  return {
    categoryId: 'cat-1',
    name: 'คณิตศาสตร์',
    hasGeneratedDocument: false,
    ...overrides,
  };
}

function run(overrides: Partial<DocumentGenerationRun> = {}): DocumentGenerationRun {
  return {
    id: 'run-1',
    triggeredBy: 'Manual',
    triggeredByUserId: 'admin-1',
    startedAt: '2026-09-01T03:04:05Z',
    completedAt: '2026-09-01T03:04:06Z',
    status: 'Success',
    categoriesScanned: 1,
    documentsGenerated: 1,
    failureCount: 0,
    errorSummary: null,
    generatedDocumentIds: ['doc-1'],
    ...overrides,
  };
}

function seedJobToggles(admin: AdminService, list: SystemConfigJobToggle[]): void {
  const target = admin as unknown as { _jobToggles: WritableSignal<SystemConfigJobToggle[]> };
  target._jobToggles.set(list);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderPage(opts: {
  categories?: DocumentGenerationEligibleCategory[];
  runs?: DocumentGenerationRun[];
  jobToggleEnabled?: boolean | 'missing';
} = {}) {
  messages = { success: [], warning: [], error: [] };

  TestBed.configureTestingModule({
    imports: [AdminDocumentGenerationPage],
    providers: [
      provideRouter([]),
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
  vi.spyOn(admin, 'loadJobToggles').mockImplementation(async () => {
    if (opts.jobToggleEnabled !== 'missing') {
      seedJobToggles(admin, [
        {
          jobKey: 'job.document-generation.enabled',
          category: 'BackgroundJob',
          displayName: 'สร้างเอกสารอัตโนมัติจากหมวดหมู่',
          description: null,
          enabled: opts.jobToggleEnabled ?? true,
          updatedAt: null,
        },
      ]);
    }
    return [];
  });
  vi.spyOn(admin, 'loadDocumentGenerationCategories').mockResolvedValue(opts.categories ?? []);
  vi.spyOn(admin, 'loadDocumentGenerationRuns').mockResolvedValue({
    items: opts.runs ?? [],
    page: 1,
    pageSize: 20,
    totalCount: (opts.runs ?? []).length,
    totalPages: 1,
  });

  const fixture = TestBed.createComponent(AdminDocumentGenerationPage);
  fixture.detectChanges();
  return { fixture, admin };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('AdminDocumentGenerationPage (category-content-auto-generation v1)', () => {
  it('renders the toggle status from adminService.jobToggles()', async () => {
    const { fixture } = renderPage({ jobToggleEnabled: true });
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สถานะ: เปิดใช้งาน');
    expect(text).toContain('ไปที่หน้าตั้งค่าเพื่อเปิด/ปิด');
  });

  it('renders each category with the correct badge based on hasGeneratedDocument', async () => {
    const categories = [
      category({ categoryId: 'cat-1', name: 'คณิตศาสตร์', hasGeneratedDocument: true }),
      category({ categoryId: 'cat-2', name: 'วิทยาศาสตร์', hasGeneratedDocument: false }),
    ];
    const { fixture } = renderPage({ categories });
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('วิทยาศาสตร์');
    expect(text).toContain('มีเอกสารแล้ว');
    expect(text).toContain('ยังไม่มี');
  });

  it('"สร้างเฉพาะหมวดนี้" calls runDocumentGeneration with the selected categoryId', async () => {
    const categories = [category({ categoryId: 'cat-1' })];
    const { fixture, admin } = renderPage({ categories });
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const runSpy = vi.spyOn(admin, 'runDocumentGeneration').mockResolvedValue(run());

    page.selectCategory('cat-1');
    page.runForSelectedCategory();
    await settle();

    expect(runSpy).toHaveBeenCalledWith('cat-1');
    expect(messages.success).toContain('สร้างเอกสารอัตโนมัติเรียบร้อย (1 รายการ)');
  });

  it('"สแกนและสร้างหมวดที่ยังไม่มี (ทั้งหมด)" calls runDocumentGeneration with categoryId=null', async () => {
    const { fixture, admin } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const runSpy = vi.spyOn(admin, 'runDocumentGeneration').mockResolvedValue(run({ documentsGenerated: 3 }));

    page.runSweep();
    await settle();

    expect(runSpy).toHaveBeenCalledWith(null);
    expect(messages.success).toContain('สร้างเอกสารอัตโนมัติเรียบร้อย (3 รายการ)');
  });

  it('disables both buttons while a request is in flight', async () => {
    const categories = [category({ categoryId: 'cat-1' })];
    const { fixture, admin } = renderPage({ categories });
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    let resolveRun!: (v: DocumentGenerationRun) => void;
    vi.spyOn(admin, 'runDocumentGeneration').mockImplementation(
      () => new Promise((resolve) => (resolveRun = resolve)),
    );

    page.selectCategory('cat-1');
    page.runForSelectedCategory();
    await Promise.resolve();

    expect(page.canRunSelected()).toBe(false);
    expect(page.canRunSweep()).toBe(false);

    resolveRun(run());
    await settle();
    expect(page.canRunSweep()).toBe(true);
  });

  it('on 409, shows the exact message from the response body (not a generic apiFail toast)', async () => {
    const { fixture, admin } = renderPage();
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    const conflictMessage = 'งานสร้างเอกสารอัตโนมัติกำลังทำงานอยู่ กรุณารอสักครู่';
    vi.spyOn(admin, 'runDocumentGeneration').mockRejectedValue({
      status: 409,
      message: conflictMessage,
    });

    page.runSweep();
    await settle();
    fixture.detectChanges();

    expect(page.triggerError()).toBe(conflictMessage);
    expect(messages.error).toContain(conflictMessage);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(conflictMessage);
  });

  it('renders the run history table with the correct status label/color and type label', async () => {
    const runs = [
      run({ id: 'run-a', status: 'Success', triggeredBy: 'Scheduled' }),
      run({ id: 'run-b', status: 'PartialFailure', triggeredBy: 'Manual' }),
      run({ id: 'run-c', status: 'Failed', triggeredBy: 'Manual' }),
    ];
    const { fixture, admin } = renderPage({ runs });
    await settle();
    fixture.detectChanges();

    expect(admin.loadDocumentGenerationRuns).toHaveBeenCalledWith(1, 20);

    const page = fixture.componentInstance;
    expect(page.runStatusLabel('Success')).toBe('สำเร็จ');
    expect(page.runStatusLabel('PartialFailure')).toBe('สำเร็จบางส่วน');
    expect(page.runStatusLabel('Failed')).toBe('ล้มเหลว');
    expect(page.runStatusClass('Success')).toBe('pill-green');
    expect(page.runStatusClass('PartialFailure')).toBe('pill-amber');
    expect(page.runStatusClass('Failed')).toBe('pill-rose');
    expect(page.runTypeLabel('Scheduled')).toBe('ตามกำหนดเวลา');
    expect(page.runTypeLabel('Manual')).toBe('สั่งด้วยมือ');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สำเร็จ');
    expect(text).toContain('สำเร็จบางส่วน');
    expect(text).toContain('ล้มเหลว');
    expect(text).toContain('ตามกำหนดเวลา');
    expect(text).toContain('สั่งด้วยมือ');
  });

  it('shows the empty-state copy when there is no run history', async () => {
    const { fixture } = renderPage({ runs: [] });
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่เคยมีการรันงานนี้');
  });

  it('expanding a run row links each generated document to /admin/documents/{id} and to /admin/approval', async () => {
    const runs = [run({ id: 'run-a', generatedDocumentIds: ['doc-1', 'doc-2'] })];
    const { fixture } = renderPage({ runs });
    await settle();
    fixture.detectChanges();
    const page = fixture.componentInstance;

    page.toggleExpandRun('run-a');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/admin/documents/doc-1');
    expect(links).toContain('/admin/documents/doc-2');
    expect(links).toContain('/admin/approval');
  });
});

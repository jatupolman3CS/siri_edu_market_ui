import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  AdminService,
  type DocumentGenerationEligibleCategory,
  type DocumentGenerationRun,
} from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { extractErrorStatus } from '../../../core/services/api-result';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/** system-config-job-toggle v1 §2.4 — the 5th catalog entry this page's toggle status reads. */
const DOCUMENT_GENERATION_JOB_KEY = 'job.document-generation.enabled';

const RUN_PAGE_SIZE = 20;

/**
 * category-content-auto-generation v1 (`docs/contracts/category-content-auto-generation.md`)
 * §4 — admin page to trigger/inspect the document auto-generation job. Approving generated
 * documents happens on the existing `/admin/approval` queue (§0/§4) — this page never touches it.
 *
 * UI/state/service round (backend's 4 endpoints are not built yet) — `AdminService`'s three new
 * methods are stubbed no-ops (`TODO(contract)`), so every list here renders empty until the SDK
 * is wired in a later round. This page is built against that eventual shape now.
 */
@Component({
  selector: 'app-admin-document-generation',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-generation.page.html',
  styleUrl: './document-generation.page.scss',
})
export class AdminDocumentGenerationPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  // ===== §4.1 toggle status (read-only) =====
  readonly jobToggles = this.admin.jobToggles;
  readonly toggleItem = computed(
    () => this.jobToggles().find((t) => t.jobKey === DOCUMENT_GENERATION_JOB_KEY) ?? null,
  );
  /**
   * Judgment call: the spec only defines "เปิดใช้งาน"/"ปิดใช้งาน" text, not a third "unknown"
   * state. Until backend ships the 5th toggle catalog row, this item is never found — treated
   * as disabled (`false`) rather than inventing new copy not in §4's exact-text table.
   */
  readonly toggleEnabled = computed(() => this.toggleItem()?.enabled ?? false);

  // ===== §4.2 trigger section =====
  readonly categories = signal<DocumentGenerationEligibleCategory[]>([]);
  readonly categoriesLoading = signal(false);
  readonly selectedCategoryId = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly triggerError = signal<string | null>(null);

  readonly canRunSelected = computed(() => !!this.selectedCategoryId() && !this.submitting());
  readonly canRunSweep = computed(() => !this.submitting());

  // ===== §4.3 run history =====
  readonly runs = signal<DocumentGenerationRun[]>([]);
  readonly runsLoading = signal(false);
  readonly page = signal(1);
  readonly totalPages = signal(1);
  readonly totalCount = signal(0);
  readonly expandedRunId = signal<string | null>(null);

  constructor() {
    void this.admin.loadJobToggles();
    void this.loadCategories();
    void this.loadRuns();
  }

  async loadCategories(): Promise<void> {
    this.categoriesLoading.set(true);
    try {
      const items = await this.admin.loadDocumentGenerationCategories();
      this.categories.set(items);
    } finally {
      this.categoriesLoading.set(false);
    }
  }

  async loadRuns(): Promise<void> {
    this.runsLoading.set(true);
    try {
      const result = await this.admin.loadDocumentGenerationRuns(this.page(), RUN_PAGE_SIZE);
      this.runs.set(result.items ?? []);
      this.totalCount.set(result.totalCount ?? 0);
      this.totalPages.set(Math.max(1, result.totalPages ?? 1));
    } finally {
      this.runsLoading.set(false);
    }
  }

  goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
    void this.loadRuns();
  }

  selectCategory(categoryId: string): void {
    this.selectedCategoryId.set(categoryId || null);
  }

  runForSelectedCategory(): void {
    void this.run(this.selectedCategoryId());
  }

  runSweep(): void {
    void this.run(null);
  }

  /**
   * §4.2: on `409` show the backend's Thai message verbatim (not `apiFail.report`'s generic
   * "{context} — {detail}" toast) — `AdminService.runDocumentGeneration` already skips reporting
   * that case and rethrows the raw error so it can be shown here as-is.
   */
  private async run(categoryId: string | null): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.triggerError.set(null);
    try {
      const result = await this.admin.runDocumentGeneration(categoryId);
      if (result) {
        this.message.success(`สร้างเอกสารอัตโนมัติเรียบร้อย (${result.documentsGenerated} รายการ)`);
        this.page.set(1);
        await Promise.all([this.loadCategories(), this.loadRuns()]);
      }
    } catch (e) {
      if (extractErrorStatus(e) === 409) {
        const text = this.apiFail.formatDetail(e);
        this.triggerError.set(text);
        this.message.error(text);
      }
      // other errors are already toasted by AdminService.runDocumentGeneration
    } finally {
      this.submitting.set(false);
    }
  }

  toggleExpandRun(id: string): void {
    this.expandedRunId.update((current) => (current === id ? null : id));
  }

  runTypeLabel(triggeredBy: DocumentGenerationRun['triggeredBy']): string {
    return triggeredBy === 'Scheduled' ? 'ตามกำหนดเวลา' : 'สั่งด้วยมือ';
  }

  runStatusLabel(status: DocumentGenerationRun['status']): string {
    return {
      Success: 'สำเร็จ',
      PartialFailure: 'สำเร็จบางส่วน',
      Failed: 'ล้มเหลว',
    }[status];
  }

  runStatusClass(status: DocumentGenerationRun['status']): string {
    return {
      Success: 'pill-green',
      PartialFailure: 'pill-amber',
      Failed: 'pill-rose',
    }[status];
  }
}

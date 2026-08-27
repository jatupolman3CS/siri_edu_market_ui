import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { AdminOpenReportResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * F-09 (N-05): one place to read document reports.
 *
 * Reports were only visible by opening a document that already had one, which meant guessing
 * which document that was. This lists them across every document, open ones first, and lets an
 * admin resolve a report from the list.
 */
@Component({
  selector: 'app-admin-reports',
  standalone: true,
  imports: [CommonModule, DatePipe, RouterLink, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports.page.html',
})
export class AdminReportsPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly reports = signal<AdminOpenReportResponse[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly openOnly = signal(true);
  readonly total = signal(0);

  readonly categoryLabels: Record<string, string> = {
    copyright: 'ละเมิดลิขสิทธิ์',
    inappropriate: 'เนื้อหาไม่เหมาะสม',
    inaccurate: 'ข้อมูลผิด',
    other: 'อื่น ๆ',
  };

  constructor() {
    void this.reload();
  }

  categoryLabel(category: string | undefined): string {
    if (!category) return 'ไม่ระบุ';
    return this.categoryLabels[category] ?? category;
  }

  setOpenOnly(next: boolean): void {
    this.openOnly.set(next);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.admin.listReports(this.openOnly());
      this.reports.set(page.items ?? []);
      this.total.set(page.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายงานเอกสาร', e);
      this.reports.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async resolve(report: AdminOpenReportResponse): Promise<void> {
    if (this.busyId() || !report.id || !report.documentId) return;

    this.busyId.set(report.id);
    try {
      await this.admin.resolveDocumentReport(report.documentId, report.id);
      this.message.success('ปิดรายงานเรียบร้อย');
      await this.reload();
    } catch (e) {
      this.apiFail.report('ปิดรายงาน', e);
    } finally {
      this.busyId.set(null);
    }
  }
}

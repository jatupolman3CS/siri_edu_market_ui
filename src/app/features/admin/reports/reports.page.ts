import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { AdminOpenReportResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

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
  imports: [CommonModule, DatePipe, RouterLink, EmptyStateComponent, PaginationComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports.page.html',
})
export class AdminReportsPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

  readonly reports = signal<AdminOpenReportResponse[]>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly openOnly = signal(true);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  private readonly categoryKeyMap: Record<string, string> = {
    copyright: 'admin.reports.typeCopyright',
    inappropriate: 'admin.reports.typeInappropriate',
    inaccurate: 'admin.reports.typeInaccurate',
    other: 'admin.reports.typeOther',
  };

  constructor() {
    void this.reload();
  }

  categoryLabel(category: string | undefined): string {
    if (!category) return this.translation.t('admin.reports.typeUnspecified');
    const key = this.categoryKeyMap[category];
    return key ? this.translation.t(key) : category;
  }

  setOpenOnly(next: boolean): void {
    this.openOnly.set(next);
    this.page.set(1);
    void this.reload();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const paged = await this.admin.listReports(this.openOnly(), this.page(), this.pageSize());
      this.reports.set(paged.items ?? []);
      this.total.set(paged.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report('โหลดรายงานเอกสาร', e);
      this.reports.set([]);
      this.total.set(0);
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

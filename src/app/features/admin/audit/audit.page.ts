import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminAuditLogResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

/**
 * F-10: the admin audit log.
 *
 * ADMIN_AUDIT_LOG gains a row on every approve, reject, edit and payout move, but the only way
 * to read one was RecentAudit inside a single document's detail — so "who did what yesterday"
 * meant opening documents one at a time and hoping.
 *
 * Paged from the first day: this table only ever grows.
 */
@Component({
  selector: 'app-admin-audit',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, EmptyStateComponent, PaginationComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit.page.html',
})
export class AdminAuditPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  readonly entries = signal<AdminAuditLogResponse[]>([]);
  readonly loading = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(50);
  readonly totalPages = signal(1);
  readonly total = signal(0);
  readonly expandedId = signal<string | null>(null);

  action = '';
  from = '';
  to = '';

  constructor() {
    void this.reload();
  }

  /** Route for the entity a row is about, so a log line is a way in rather than a dead end. */
  entityLink(entry: AdminAuditLogResponse): string[] | null {
    if (!entry.entityId) return null;
    switch (entry.entityType) {
      case 'Document':
        return ['/admin/documents', entry.entityId];
      case 'Payout':
        return ['/admin/payouts'];
      default:
        return null;
    }
  }

  toggleDetails(id: string | undefined): void {
    if (!id) return;
    this.expandedId.update((current) => (current === id ? null : id));
  }

  /** Action mapping to human-readable label (via i18n) */
  actionLabel(action: string | undefined): string {
    if (!action) return this.translation.t('admin.audit.actionDefault');
    const keyMap: Record<string, string> = {
      'document.approve': 'admin.audit.actionDocumentApprove',
      'document.reject': 'admin.audit.actionDocumentReject',
      'document.patch': 'admin.audit.actionDocumentPatch',
      'document.bulk': 'admin.audit.actionDocumentBulk',
      'document.report.create': 'admin.audit.actionDocumentReportCreate',
      'document.report.resolve': 'admin.audit.actionDocumentReportResolve',
      'document.report.resolve_all': 'admin.audit.actionDocumentReportResolveAll',
      'payout.approve': 'admin.audit.actionPayoutApprove',
      'payout.reject': 'admin.audit.actionPayoutReject',
      'order.refund': 'admin.audit.actionOrderRefund',
    };
    const tKey = keyMap[action];
    return tKey ? this.translation.t(tKey) : action;
  }

  /** Action color style */
  actionBadgeClass(action: string | undefined): string {
    if (!action) return 'bg-pink-50 text-pink-700 border-pink-200';
    if (action.includes('approve')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (action.includes('reject')) return 'bg-rose-50 text-rose-700 border-rose-200';
    if (action.includes('patch')) return 'bg-sky-50 text-sky-700 border-sky-200';
    if (action.includes('refund')) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-pink-50 text-pink-700 border-pink-200';
  }

  /** Entity type label via i18n */
  entityTypeLabel(type: string | undefined): string {
    if (!type) return this.translation.t('admin.audit.entityDefault');
    const keyMap: Record<string, string> = {
      Document: 'admin.audit.entityDocument',
      Payout: 'admin.audit.entityPayout',
      Order: 'admin.audit.entityOrder',
    };
    const tKey = keyMap[type];
    return tKey ? this.translation.t(tKey) : type;
  }

  /**
   * Formats detailsJson into clean key-value entries with Thai labels,
   * filtering out empty/null fields so only meaningful data is shown.
   */
  parseDetails(detailsJson: string | null | undefined): { label: string; value: string }[] {
    if (!detailsJson) return [];
    // Maps camelCase field name → translation key (PascalCase variant is normalized below)
    const fieldKeyMap: Record<string, string> = {
      title: 'admin.audit.fieldTitle',
      shortDescription: 'admin.audit.fieldShortDescription',
      description: 'admin.audit.fieldDescription',
      price: 'admin.audit.fieldPrice',
      status: 'admin.audit.fieldStatus',
      reason: 'admin.audit.fieldReason',
      action: 'admin.audit.fieldAction',
      amount: 'admin.audit.fieldAmount',
      netAmount: 'admin.audit.fieldNetAmount',
      orderNumber: 'admin.audit.fieldOrderNumber',
      note: 'admin.audit.fieldNote',
      count: 'admin.audit.fieldCount',
      watermarkEnabled: 'admin.audit.fieldWatermarkEnabled',
      isFeatured: 'admin.audit.fieldIsFeatured',
      isFree: 'admin.audit.fieldIsFree',
      format: 'admin.audit.fieldFormat',
      categoryIds: 'admin.audit.fieldCategoryIds',
      tags: 'admin.audit.fieldTags',
    };
    try {
      const obj = JSON.parse(detailsJson) as unknown;
      if (!obj || typeof obj !== 'object') {
        return [{ label: this.translation.t('admin.audit.detailLabel'), value: String(obj) }];
      }

      const result: { label: string; value: string }[] = [];
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (val === null || val === undefined || val === '') continue;
        if (Array.isArray(val) && val.length === 0) continue;

        // Normalize PascalCase → camelCase for lookup
        const camelKey = key.charAt(0).toLowerCase() + key.slice(1);
        const tKey = fieldKeyMap[camelKey];
        const label = tKey ? this.translation.t(tKey) : key;

        let valueStr = '';
        if (Array.isArray(val)) {
          valueStr = (val as unknown[]).join(', ');
        } else if (typeof val === 'boolean') {
          valueStr = val ? this.translation.t('admin.audit.boolTrue') : this.translation.t('admin.audit.boolFalse');
        } else if (typeof val === 'number' && (key.toLowerCase().includes('price') || key.toLowerCase().includes('amount'))) {
          valueStr = `${val.toLocaleString()} บาท`;
        } else if (typeof val === 'object') {
          valueStr = JSON.stringify(val);
        } else {
          valueStr = String(val);
        }
        result.push({ label, value: valueStr });
      }
      return result;
    } catch {
      return [{ label: this.translation.t('admin.audit.detailLabel'), value: detailsJson }];
    }
  }

  /** Pretty-prints DetailsJson, falling back to the raw string if it is not JSON. */
  formatDetails(detailsJson: string | null | undefined): string {
    if (!detailsJson) return '';
    try {
      return JSON.stringify(JSON.parse(detailsJson), null, 2);
    } catch {
      return detailsJson;
    }
  }

  applyFilters(): void {
    this.page.set(1);
    void this.reload();
  }

  clearFilters(): void {
    this.action = '';
    this.from = '';
    this.to = '';
    this.page.set(1);
    void this.reload();
  }

  goToPage(next: number): void {
    if (next < 1 || next > this.totalPages()) return;
    this.page.set(next);
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
      const result = await this.admin.listAuditLog({
        action: this.action.trim() || undefined,
        from: this.from || undefined,
        to: this.to || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.entries.set(result.items ?? []);
      this.total.set(result.totalCount ?? 0);
      this.totalPages.set(Math.max(1, result.totalPages ?? 1));
    } catch (e) {
      this.apiFail.report('errors.context.loadAdminAuditLog', e);
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}

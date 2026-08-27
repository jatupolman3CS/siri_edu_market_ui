import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { AdminAuditLogResponse } from '../../../core/api';
import { AdminService } from '../../../core/services/admin.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

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
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit.page.html',
})
export class AdminAuditPage {
  private readonly admin = inject(AdminService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly entries = signal<AdminAuditLogResponse[]>([]);
  readonly loading = signal(false);
  readonly page = signal(1);
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

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.admin.listAuditLog({
        action: this.action.trim() || undefined,
        from: this.from || undefined,
        to: this.to || undefined,
        page: this.page(),
      });
      this.entries.set(result.items ?? []);
      this.total.set(result.totalCount ?? 0);
      this.totalPages.set(Math.max(1, result.totalPages ?? 1));
    } catch (e) {
      this.apiFail.report('โหลดประวัติการทำงานของแอดมิน', e);
      this.entries.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}

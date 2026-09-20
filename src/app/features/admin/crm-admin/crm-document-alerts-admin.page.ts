import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';

/** crm-targeted-document-alerts v2 §4.2 — the only 3 choices the admin can pick from. */
const DAY_OPTIONS = [7, 14, 30] as const;

/**
 * crm-targeted-document-alerts v2 §3.3, §4.1, §4.3 (`docs/contracts/crm-targeted-document-alerts.md`,
 * F-12, ข้อ 11) — "การแจ้งเตือนเอกสารตรงความสนใจ": 6 stat cards + a table of the most recently
 * queued documents, read-only, admin-only. No seller/buyer surface (§0.5 decision 7) — this page
 * is the entire frontend footprint of the feature.
 *
 * Wired directly to `GET /api/admin/crm/document-alerts` (backend gate 1 already passed and
 * `openapi.snapshot.json` was updated before this page was built — no stub round needed).
 */
@Component({
  selector: 'app-crm-document-alerts-admin',
  standalone: true,
  imports: [RouterLink, DatePipe, EmptyStateComponent, StatCardComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-document-alerts-admin.page.html',
})
export class CrmDocumentAlertsAdminPage {
  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly dayOptions = DAY_OPTIONS;
  readonly days = signal<number>(7);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      await this.crm.loadDocumentAlerts(this.days());
    } catch (e) {
      this.apiFail.report('errors.context.loadDocumentAlerts', e);
    }
  }

  async onDaysChange(days: number): Promise<void> {
    this.days.set(days);
    await this.load();
  }

  async refresh(): Promise<void> {
    await this.load();
  }

  /** §4.3: match score is shown as an integer percent, same convention as `CrmAdminPage`. */
  matchScorePercent(score: number): number {
    return Math.round(score * 100);
  }
}

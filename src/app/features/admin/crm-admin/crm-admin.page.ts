import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { CrmSegmentKind } from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';

const SEGMENT_KIND_LABELS: Record<CrmSegmentKind, string> = {
  lifecycle: 'วงจรชีวิต',
  interest: 'ความสนใจ',
};

/**
 * crm-core v1 §3.4, §4.1, §4.3 (`docs/contracts/crm-core.md`) — "CRM — ภาพรวมลูกค้า":
 * 6 stat cards + segment table (AC-23 — every declared segment code renders, including
 * `userCount = 0`) + top-search-terms + top-category-facets, read-only.
 *
 * Round 1: `CrmService.loadOverview()` throws `TODO(contract)` (see its class doc) — this page
 * renders the documented empty state (`crm.adminOverview() === null`) until round 2 wires the
 * real `GET /api/admin/crm/overview` call.
 */
@Component({
  selector: 'app-crm-admin',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, EmptyStateComponent, StatCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-admin.page.html',
})
export class CrmAdminPage {
  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      await this.crm.loadOverview();
    } catch (e) {
      this.apiFail.report('โหลดภาพรวม CRM', e);
    }
  }

  kindLabel(kind: CrmSegmentKind): string {
    return SEGMENT_KIND_LABELS[kind] ?? kind;
  }
}

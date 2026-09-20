import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import type { CrmSegmentKind } from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

/**
 * crm-core v1 §3.4, §4.1, §4.3 (`docs/contracts/crm-core.md`) — "CRM — ภาพรวมลูกค้า":
 * 6 stat cards + segment table (AC-23 — every declared segment code renders, including
 * `userCount = 0`) + top-search-terms + top-category-facets, read-only.
 *
 * Round 1: `CrmService.loadOverview()` throws `TODO(contract)` (see its class doc) — this page
 * renders the documented empty state (`crm.adminOverview() === null`) until round 2 wires the
 * real `GET /api/admin/crm/overview` call.
 *
 * crm-driven-discovery v1 §3.4/§4.1/§4.3 (F-10, ข้อ 13): also loads+renders the "คำค้นที่หาแล้ว
 * ไม่เจอ (30 วันล่าสุด)" table (`CrmService.demandGaps*`) — wired to the real `GET
 * /api/admin/crm/demand-gaps` (round 2 — crm-driven-discovery-fe-wire).
 */
@Component({
  selector: 'app-crm-admin',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe, EmptyStateComponent, StatCardComponent, PaginationComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-admin.page.html',
})
export class CrmAdminPage {
  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  constructor() {
    void this.load();
    void this.loadDemandGaps();
  }

  private async load(): Promise<void> {
    try {
      await this.crm.loadOverview();
    } catch (e) {
      this.apiFail.report('errors.context.loadCrmOverview', e);
    }
  }

  private async loadDemandGaps(): Promise<void> {
    try {
      await this.crm.loadDemandGaps();
    } catch (e) {
      this.apiFail.report('errors.context.loadDemandGaps', e);
    }
  }

  async onDemandGapsPageChange(page: number): Promise<void> {
    try {
      await this.crm.onDemandGapsPageChange(page);
    } catch (e) {
      this.apiFail.report('errors.context.loadDemandGaps', e);
    }
  }

  async onDemandGapsPageSizeChange(size: number): Promise<void> {
    try {
      await this.crm.onDemandGapsPageSizeChange(size);
    } catch (e) {
      this.apiFail.report('errors.context.loadDemandGaps', e);
    }
  }

  kindLabel(kind: CrmSegmentKind): string {
    return this.translation.t(`admin.crmSegmentTypes.${kind}`);
  }

  /** §4.3: "สัดส่วนไม่พบ" as an integer percent. */
  zeroResultPercent(rate: number): number {
    return Math.round(rate * 100);
  }
}

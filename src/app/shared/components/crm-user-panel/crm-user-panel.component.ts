import { ChangeDetectionStrategy, Component, effect, inject, input } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { CrmFacetType } from '../../../core/models';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

const FACET_TYPE_LABELS: Record<CrmFacetType, string> = {
  category: 'หมวดหมู่',
  subcategory: 'หมวดหมู่ย่อย',
  gradeLevel: 'ระดับชั้น',
  resourceType: 'ประเภทเอกสาร',
  seller: 'ร้านค้า',
  priceBand: 'ช่วงราคา',
};

/** camelCase `CrmContributionType` keys (§3.4.1/§3.4.5) → a short Thai "why" phrase. */
const TOP_SIGNAL_LABELS: Record<string, string> = {
  purchase: 'มาจากการซื้อเอกสาร',
  subscriptionAccess: 'มาจากการเข้าถึงผ่านสมาชิกรายเดือน',
  declaredInterest: 'มาจากความสนใจที่เลือกไว้ตอนสมัคร',
  review: 'มาจากการรีวิวเอกสาร',
  wishlist: 'มาจากการกดถูกใจ (Wishlist)',
  cart: 'มาจากการใส่ตะกร้า',
  follow: 'มาจากการติดตามร้าน',
  search: 'มาจากการค้นหา',
  view: 'มาจากการเปิดดูเอกสาร',
};

/**
 * crm-core v1 §3.6, §4.3, §4.4 (`docs/contracts/crm-core.md`) — one buyer's CRM breakdown:
 * confidence bar, every facet (with a Thai "why"), segments (with reason), self-declared
 * categories, and the raw signal counts. Read-only, no action of any kind (§4.4/§8.4 — Admin
 * only *reads*, never edits a score/segment by hand).
 *
 * **Embed point for F-08** (§4.4): standalone, takes `userId` as an input signal, and loads its
 * own data through `CrmService` — `/admin/users/:id` can drop this in as-is, no change to this
 * file required. Also used directly by this contract's own `/admin/crm/users/:id` (`CrmUserPage`).
 *
 * Round 1: `CrmService.loadUserDetail()` throws `TODO(contract)` (see its class doc) — renders
 * the documented empty state until round 2 wires the real `GET /api/admin/crm/users/{userId}`.
 */
@Component({
  selector: 'app-crm-user-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-user-panel.component.html',
})
export class CrmUserPanelComponent {
  readonly userId = input.required<string>();

  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);

  constructor() {
    effect(() => {
      const id = this.userId();
      if (!id) return;
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    try {
      await this.crm.loadUserDetail(id);
    } catch (e) {
      this.apiFail.report('โหลดโปรไฟล์ CRM ของผู้ใช้', e);
    }
  }

  facetTypeLabel(type: CrmFacetType): string {
    return FACET_TYPE_LABELS[type] ?? type;
  }

  topSignalLabel(topSignal: string): string {
    return TOP_SIGNAL_LABELS[topSignal] ?? topSignal;
  }
}

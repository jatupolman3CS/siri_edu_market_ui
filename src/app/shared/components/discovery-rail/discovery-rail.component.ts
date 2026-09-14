import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DiscoverySection } from '../../../core/models';
import { DocumentCardComponent } from '../document-card/document-card.component';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.2/§4.3 — one rail of the
 * `/marketplace` "ยังไม่ได้ค้นหาอะไรเลย" discovery block. Renders `title`/`reason` straight from
 * the backend (§3.2 table — never re-worded) and hides itself when the section has fewer than 3
 * items (§3.2 "section ที่หาเอกสารได้ < 3 ชิ้น ต้องถูกตัดทิ้ง" — this component enforces the same
 * floor defensively on the client, in case a stub/test ever hands it a shorter list directly).
 */
@Component({
  selector: 'app-discovery-rail',
  standalone: true,
  imports: [RouterLink, DocumentCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './discovery-rail.component.html',
})
export class DiscoveryRailComponent {
  readonly section = input.required<DiscoverySection>();

  readonly viewAllQueryParams = computed<Record<string, string> | null>(() => {
    const s = this.section();
    if (!s.facetType || !s.facetValue) return null;
    return { [s.facetType]: s.facetValue };
  });
}

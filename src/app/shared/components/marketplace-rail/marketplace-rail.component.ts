import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { DocumentItem } from '../../../core/models';
import { DocumentCardComponent } from '../document-card/document-card.component';
import { IconComponent } from '../icon/icon.component';

/**
 * marketplace-redesign v1 §Screens 2 "Rail (ทำซ้ำ 3 ครั้ง)" — one curated rail on the `/marketplace`
 * browse mode (มาใหม่ / ยอดนิยม / ทดลองใช้ฟรี). All copy (`eyebrow`/`title`/`desc`/`viewAllLabel`) is
 * passed in already-translated from the page (`BuyerMarketplacePage.rails()`), so this component
 * stays a pure presentational shell with no `TranslationService` dependency of its own.
 *
 * Hides itself (renders nothing) when not loading and `docs().length < 3` — same floor rule
 * `DiscoveryRailComponent` enforces for the CRM discovery block, so a thin rail never shows up as
 * a near-empty row of 1-2 cards.
 */
@Component({
  selector: 'app-marketplace-rail',
  standalone: true,
  imports: [DocumentCardComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace-rail.component.html',
})
export class MarketplaceRailComponent {
  readonly eyebrow = input.required<string>();
  readonly title = input.required<string>();
  readonly desc = input.required<string>();
  readonly viewAllLabel = input.required<string>();
  readonly docs = input<DocumentItem[]>([]);
  readonly loading = input<boolean>(false);

  readonly viewAll = output<void>();

  /** Fixed 5 skeleton slots — matches the rail's `grid-cols-5` card count (§Screens 2). */
  readonly skeletonSlots = [0, 1, 2, 3, 4];
}

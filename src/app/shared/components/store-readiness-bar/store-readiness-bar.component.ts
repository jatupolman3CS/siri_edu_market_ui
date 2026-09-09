import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StoreReadinessItem } from '../../../core/models';
import { IconComponent } from '../icon/icon.component';

/**
 * store-readiness-score v1 (docs/contracts/store-readiness-score.md §4) — "ความสมบูรณ์ของร้าน" bar
 * on the `/seller` Studio Mode overview (`dashboard.page.html`, between the header greeting and the
 * 4 stat cards).
 *
 * Pure `input()` component (AC-10/AC-11/AC-12): `dashboard.page.html` binds every input straight
 * from `seller.stats().storeReadiness` (falling back to `DEFAULT_STORE_READINESS` — see
 * `core/models/index.ts`) — this component never injects `SellerService` itself so `.spec.ts` can
 * exercise every state with plain mock data.
 *
 * States:
 *  - `isComplete() === false` → full bar: title + `percentComplete()`% + progress bar + the 3-item
 *    checklist in `items()` order. Each item shows its `label` (plus "(current/target)" when
 *    `currentCount`/`targetCount` are both set — only ever true for the `"listings"` item) and a
 *    done/not-done indicator. The item whose `key === nextActionItemKey()` gets a primary
 *    (`btn-pink`) action button; other unfinished items get a smaller secondary (`btn-ghost`)
 *    action button — the user is never blocked from jumping ahead. Done items show a check mark
 *    only, no button. Every action button navigates via `[routerLink]="item.actionRoute"` —
 *    backend-supplied, never hardcoded here (AC-12).
 *  - `isComplete() === true` → collapses to a single-line compact success banner (no checklist, no
 *    action buttons, no dismiss button) — shown every time the page loads, per §5 (no persisted
 *    dismiss preference in this round).
 */
@Component({
  selector: 'app-store-readiness-bar',
  standalone: true,
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './store-readiness-bar.component.html',
  styleUrl: './store-readiness-bar.component.scss',
})
export class StoreReadinessBarComponent {
  readonly percentComplete = input.required<number>();
  readonly isComplete = input.required<boolean>();
  readonly items = input.required<StoreReadinessItem[]>();
  readonly nextActionItemKey = input.required<string | null>();

  /** Only the `"listings"` item ever carries a count (§3.2) — everyone else stays silent about it. */
  hasCount(item: StoreReadinessItem): boolean {
    return item.currentCount !== undefined && item.targetCount !== undefined;
  }
}

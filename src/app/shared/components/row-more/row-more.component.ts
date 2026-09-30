import { ChangeDetectionStrategy, Component, afterNextRender, computed, input, viewChild } from '@angular/core';
import { NzPopoverDirective, NzPopoverModule } from 'ng-zorro-antd/popover';
import { IconComponent } from '../icon/icon.component';
import { TranslatePipe } from '../../../core/i18n';

export interface RowMoreItem {
  label: string;
  value: string | number | null | undefined;
}

/**
 * `⋯` button for `.rtable` rows (docs/contracts/responsive-ui.md §4.3, §4.5): opens a popover
 * with the row's secondary columns as a label/value list. Null / undefined / '' values are
 * skipped. Host hidden at >=1280, where the full table shows every column.
 * `label` is rendered as given — pass already-translated text (e.g. `'admin.x' | trans`).
 */
@Component({
  selector: 'app-row-more',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NzPopoverModule, IconComponent, TranslatePipe],
  templateUrl: './row-more.component.html',
  styleUrl: './row-more.component.scss',
})
export class RowMoreComponent {
  readonly items = input.required<ReadonlyArray<RowMoreItem>>();

  protected readonly visibleItems = computed(() =>
    this.items().filter((item) => item.value !== null && item.value !== undefined && item.value !== ''),
  );

  /**
   * `bottomRight` first (§4.3), then the other vertical placements. No left/right fallbacks: on a
   * phone a side placement next to the ⋯ can never fit the list, and CDK then picked it as the
   * "largest visible area" fallback and left it hanging off the screen edge.
   */
  protected readonly placements = ['bottomRight', 'topRight', 'bottomLeft', 'topLeft'];

  private readonly popover = viewChild.required(NzPopoverDirective);

  constructor() {
    // nz-popover leaves the CDK overlay's `push` off (ng-zorro 21, not an nz-popover input): when
    // no placement fits — a wide list next to a ⋯ near the screen edge on a phone — CDK falls back
    // to the largest-visible placement WITHOUT moving it on-screen, and the values were cut off at
    // the edge. Turn push on for this popover. The property is @deprecated (ng-zorro v22 removes
    // it); its removal will surface here as a compile error — then move to a CDK
    // cdkConnectedOverlay with [cdkConnectedOverlayPush]="true".
    afterNextRender(() => {
      const panel = this.popover().component;
      if (panel) {
        panel.cdkConnectedOverlayPush = true;
        // Pushed panels otherwise sit flush against the screen edge; read when the overlay's
        // position strategy is first created (first open), which is after this runs.
        if (panel.overlay) {
          panel.overlay.viewportMargin = 8;
        }
        panel.updateByDirective();
      }
    });
  }
}

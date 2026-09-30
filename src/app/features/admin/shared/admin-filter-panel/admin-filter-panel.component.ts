import { ChangeDetectionStrategy, Component, TemplateRef, effect, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { BottomSheetComponent } from '../../../../shared/components/bottom-sheet/bottom-sheet.component';
import { TranslatePipe } from '../../../../core/i18n/translate.pipe';
import { ViewportService } from '../../../../core/layout';

/**
 * Admin list filters (docs/contracts/responsive-ui.md §4.6 "A browse" rule, applied to admin
 * lists with >2 filter controls — U4-5). The page passes its filter fields once as an
 * `<ng-template>`; this component renders them:
 *  - <744: a `ตัวกรอง (n)` button that opens `<app-bottom-sheet>` holding the fields, footer
 *    ล้างทั้งหมด (emits `clearAll`) / ดูผลลัพธ์ (emits `showResults`, then closes);
 *  - >=744: inline, exactly as before.
 * Filter semantics are untouched: pages wire `showResults` to whatever their existing
 * "search/apply" action was (or nothing when their filters are live).
 */
@Component({
  selector: 'app-admin-filter-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, IconComponent, BottomSheetComponent, TranslatePipe],
  templateUrl: './admin-filter-panel.component.html',
  styleUrl: './admin-filter-panel.component.scss',
})
export class AdminFilterPanelComponent {
  readonly fields = input.required<TemplateRef<unknown>>();
  /** Number of non-default filters; `(n)` is omitted from the button when 0. */
  readonly activeCount = input<number>(0);
  readonly showResults = output<void>();
  readonly clearAll = output<void>();

  readonly sheetOpen = signal(false);

  private readonly viewport = inject(ViewportService);

  constructor() {
    // R-9 (F42): the ตัวกรอง button only exists below 744, so a sheet left open by a rotation to
    // landscape re-appeared (and kept the page scroll-locked) back in portrait. Reset it when the
    // tablet tier is reached; the effect reads only the viewport signal.
    effect(() => {
      if (this.viewport.isTabletUp()) this.sheetOpen.set(false);
    });
  }

  openSheet(): void {
    this.sheetOpen.set(true);
  }

  closeSheet(): void {
    this.sheetOpen.set(false);
  }

  onClearAll(): void {
    this.clearAll.emit();
  }

  onShowResults(): void {
    this.showResults.emit();
    this.sheetOpen.set(false);
  }
}

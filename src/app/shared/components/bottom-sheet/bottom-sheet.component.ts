import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { IconComponent } from '../icon/icon.component';
import { TranslatePipe } from '../../../core/i18n';
import { acquirePageScrollLock, releasePageScrollLock } from '../../../core/layout/scroll-lock';

let nextSheetId = 0;

/**
 * Phone bottom sheet / tablet slide-over (docs/contracts/responsive-ui.md §4.3).
 * Controlled: the parent owns `open`; the sheet only emits `(closed)` on ESC, backdrop click
 * or the close button.
 *
 * Slots: default content = scrollable body · `[sheetFooter]` = sticky footer (safe-area padded).
 *
 * <744: anchored bottom, full width, radius 24px top, drag handle (visual), max-height `maxHeight`.
 * >=744: `tabletMode="slide-over"` → right panel min(420px, 90vw), full height;
 *        `tabletMode="sheet"` → stays a bottom sheet (max 640px wide, centered).
 */
@Component({
  selector: 'app-bottom-sheet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, IconComponent, TranslatePipe],
  templateUrl: './bottom-sheet.component.html',
  styleUrl: './bottom-sheet.component.scss',
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
  },
})
export class BottomSheetComponent {
  private readonly document = inject(DOCUMENT);

  readonly open = input.required<boolean>();
  readonly title = input<string>('');
  readonly tabletMode = input<'sheet' | 'slide-over'>('slide-over');
  /** Phone only. */
  readonly maxHeight = input<string>('85dvh');
  readonly closed = output<void>();

  protected readonly titleId = `app-bottom-sheet-title-${nextSheetId++}`;
  private locked = false;

  constructor() {
    effect(() => this.setScrollLock(this.open()));
    inject(DestroyRef).onDestroy(() => this.setScrollLock(false));
  }

  protected close(): void {
    this.closed.emit();
  }

  protected onEscape(event: Event): void {
    // An overlay opened from inside the sheet (nz-select, nz-date-picker, a nested dropdown) already
    // handled this Escape: the CDK keyboard dispatcher on <body> closes it first and marks the
    // event defaultPrevented. One Escape must not dismiss the sheet as well.
    if (event.defaultPrevented) return;
    if (this.open()) {
      this.close();
    }
  }

  /**
   * Locks page scroll (`overflow:hidden` on <html>) while open; released on close/destroy. The
   * shared lock also keeps the page at its scroll position underneath (see core/layout/scroll-lock).
   */
  private setScrollLock(lock: boolean): void {
    if (lock === this.locked) return;
    this.locked = lock;
    if (lock) {
      acquirePageScrollLock(this.document);
    } else {
      releasePageScrollLock(this.document);
    }
  }
}

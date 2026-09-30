import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { LightboxService } from '../../services/lightbox.service';
import { TranslatePipe } from '../../../core/i18n';
import { acquirePageScrollLock, releasePageScrollLock } from '../../../core/layout/scroll-lock';

/**
 * image-upload-optimization v2 §4: mounted once at the app root (same pattern as
 * `announcement-popup`/`cart-drawer`). Renders nothing while `LightboxService.current()` is
 * `null` — the full-resolution `<img>` only enters the DOM once something calls `open()`.
 *
 * A real modal dialog: `cdkTrapFocus` + auto-capture moves focus in on open (the ✕), keeps Tab
 * inside, and returns focus to the element that opened it once it closes (it used to fall to
 * <body>). The page behind does not scroll while it is open (shared lock, core/layout/scroll-lock).
 * The trap sits on a child of a fixed root: CDK inserts its tabbable anchors next to the trapped
 * element, and anchors in normal flow made a Tab scroll the page behind to the bottom.
 */
@Component({
  selector: 'app-lightbox',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [A11yModule, TranslatePipe],
  templateUrl: './lightbox.component.html',
  styleUrl: './lightbox.component.scss',
})
export class LightboxComponent {
  readonly lightbox = inject(LightboxService);
  private readonly document = inject(DOCUMENT);
  private locked = false;

  constructor() {
    effect(() => this.setScrollLock(this.lightbox.current() !== null));
    inject(DestroyRef).onDestroy(() => this.setScrollLock(false));
  }

  close(): void {
    this.lightbox.close();
  }

  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

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

import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { AnnouncementPopupService } from '../../../core/services/announcement-popup.service';
import type { AnnouncementImage, AnnouncementPopup } from '../../../core/models';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

/**
 * announcement-popup v5 §0.2/§0.3/§1.10/§1.11/§1.12/§4 (`docs/contracts/announcement-popup.md`) —
 * one `nz-modal` per announcement (index-based image slider inside), queued by
 * `AnnouncementPopupService`. Mounted once in `BuyerLayoutComponent` (§1.8), same pattern as
 * `QuickViewModalComponent`.
 *
 * [v3] `NzCarouselModule`/`nz-carousel` was removed entirely — bisect-confirmed to *not* be the
 * root cause of the "close button does nothing" bug after all (superseded by §0.2 below). Kept
 * removed regardless (§0.1 item 4) as a valid cleanup — replaced with a hand-rolled
 * `signal<number>` index slider. Do not reintroduce `nz-carousel` here (§1.10).
 *
 * [v4] The real root cause (§0.2): `NzModalComponent.ngOnChanges()` only reliably re-renders when
 * `nzVisible` genuinely flips `true↔false`. Swapping the announcement while `nzVisible` stays
 * `true` (e.g. binding `[nzVisible]="!!popup.current()"` directly and closing a non-last queue
 * item) falls into `NzModalRef.updateConfig()`, whose `markForCheck()` never gets flushed by the
 * zoneless scheduler for the CDK-overlay-attached view. Fix: `nzVisible` is now driven by a local
 * `modalVisible` signal that always cycles `true→false→true` (never swaps content while staying
 * `true`) whenever the current announcement changes.
 *
 * [v5] §0.3 — v4's `effect()` implementation of the fix above was itself broken: it *read*
 * `this.modalVisible()` and *wrote* `this.modalVisible.set(...)` inside the same effect run.
 * Angular settles a signal graph fully before any intermediate value ever reaches a binding, so
 * the transient `false` it wrote was never actually observed by `NzModalComponent` — the effect
 * immediately re-ran and flipped back to `true` within the same settle pass. Fix: "deciding to
 * close" (`closeCurrent()`, a plain event handler) and "advancing to the next announcement"
 * (`onModalAfterClose()`, bound to the external `(nzAfterClose)` event, outside the effect graph
 * entirely) are now fully separate. The remaining `effect()` only opens the modal on first load —
 * it reads *only* `popup.current()`, never `this.modalVisible()`, so it can never be
 * self-triggered (AC-33). Guarded by the plain field `initialOpenDone`, not a signal.
 */
@Component({
  selector: 'app-announcement-popup',
  standalone: true,
  imports: [NzModalModule, IconComponent, ImgFallbackDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-popup.component.html',
  styleUrl: './announcement-popup.component.scss',
  host: {
    // §4: keyboard left/right must move the slider within the current announcement. Bound on
    // `document` (not the host element) because `nz-modal` renders its content into a CDK overlay
    // appended to `<body>`, outside this component's own DOM subtree — a host-element listener
    // would never see key events raised inside the overlay.
    '(document:keydown.arrowLeft)': 'onArrowLeft()',
    '(document:keydown.arrowRight)': 'onArrowRight()',
  },
})
export class AnnouncementPopupComponent {
  readonly popup = inject(AnnouncementPopupService);
  private readonly router = inject(Router);
  readonly translation = inject(TranslationService);

  /** [v3] §1.10 — current image index within the current announcement, replaces `nz-carousel`. */
  private readonly imageIndex = signal(0);
  readonly currentImageIndex = this.imageIndex.asReadonly();

  /** [v3] §1.11 — "ไม่ต้องแสดงอีก" checkbox state, local to the component, not the service. */
  private readonly dontShowAgain = signal(false);
  readonly dontShowAgainChecked = this.dontShowAgain.asReadonly();

  /**
   * [v4] §1.12 — drives `[nzVisible]` directly, kept deliberately separate from
   * `!!popup.current()`. Every announcement change must cycle this through a genuine
   * `true→false→true`, never swap content while it stays `true` (§0.2).
   */
  private readonly modalVisible = signal(false);
  readonly isModalVisible = this.modalVisible.asReadonly();

  /**
   * [v5] §0.3/§1.12 — plain field, not a signal. Guards the `effect()` below so it only opens the
   * modal *once* per component instance (the first time `popup.current()` resolves after
   * `initialize()`). Every subsequent open goes through `onModalAfterClose()` only. Replaces
   * v4's `lastShownId`, which the v5 effect no longer needs (it doesn't compare ids anymore).
   */
  private initialOpenDone = false;

  constructor() {
    // Guarded inside the service (root singleton) — safe to call every time this component is
    // (re)created, e.g. navigating away to /auth/login and back (§4).
    void this.popup.initialize();

    // [v5] §0.3 — opens the modal for the first announcement only, the moment it becomes
    // available after `initialize()` resolves. Reads *only* `popup.current()` — never
    // `this.modalVisible()`/`this.isModalVisible()` (AC-33) — so writing `modalVisible` inside
    // `showAnnouncement()` can never mark this effect dirty again (no self-reference). Every
    // later announcement change is advanced exclusively by `onModalAfterClose()`.
    effect(() => {
      const ann = this.popup.current();
      if (ann && !this.initialOpenDone) {
        this.initialOpenDone = true;
        this.showAnnouncement(ann);
      }
    });
  }

  /** [v5] Opens the modal for the given announcement — always resets the slider/checkbox (§1.10/§1.11). */
  private showAnnouncement(ann: AnnouncementPopup): void {
    this.imageIndex.set(0);
    this.dontShowAgain.set(false);
    this.modalVisible.set(true);
  }

  /**
   * Bound to `(nzAfterClose)` — fires when modal closing animation finishes.
   * Ensures modal visibility state is false.
   */
  onModalAfterClose(): void {
    this.modalVisible.set(false);
  }

  prevImage(): void {
    const imgs = this.popup.current()?.images;
    if (!imgs?.length) return;
    this.imageIndex.update((i) => (i - 1 + imgs.length) % imgs.length);
  }

  nextImage(): void {
    const imgs = this.popup.current()?.images;
    if (!imgs?.length) return;
    this.imageIndex.update((i) => (i + 1) % imgs.length);
  }

  goToImage(index: number): void {
    this.imageIndex.set(index);
  }

  toggleDontShowAgain(checked: boolean): void {
    this.dontShowAgain.set(checked);
  }

  onArrowLeft(): void {
    if (!this.popup.current()) return;
    this.prevImage();
  }

  onArrowRight(): void {
    if (!this.popup.current()) return;
    this.nextImage();
  }

  /**
   * Closes the current popup modal completely.
   * If "ไม่ต้องแสดงอีก" is checked, persists dismissal to sessionStorage for the entire session.
   */
  closeCurrent(): void {
    const id = this.popup.current()?.id;
    if (this.dontShowAgain()) {
      this.popup.dismissForever(id);
    } else {
      this.popup.close();
    }
    this.modalVisible.set(false);
  }

  /** §4: every `<img>` needs a meaningful `alt` even when the admin left `altText` blank. */
  fallbackAlt(image: AnnouncementImage, index: number): string {
    return `${this.popup.current()?.title ?? ''} - ${this.translation.t('shared.announcementPopup.imageNumber', { number: index + 1 })}`;
  }

  /**
   * §1.6/§1.7: no link → nothing happens, the popup stays open. Any link (internal or external)
   * closes the current popup — internal routes (`/...`) navigate through the Angular Router
   * without a full reload; everything else opens in a new tab and leaves the current page alone.
   * [v3]: closes via `closeCurrent()` so the checkbox is honored here too (AC-23).
   */
  onImageClick(image: AnnouncementImage): void {
    const link = image.linkUrl;
    if (!link) return;

    this.closeCurrent();
    if (link.startsWith('/')) {
      void this.router.navigateByUrl(link);
    } else {
      window.open(link, '_blank', 'noopener');
    }
  }
}

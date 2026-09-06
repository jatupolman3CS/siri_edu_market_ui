import { ChangeDetectionStrategy, Component, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzCarouselComponent, NzCarouselModule } from 'ng-zorro-antd/carousel';
import { AnnouncementPopupService } from '../../../core/services/announcement-popup.service';
import type { AnnouncementImage } from '../../../core/models';
import { IconComponent } from '../icon/icon.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

/**
 * announcement-popup v1 §1/§4 (`docs/contracts/announcement-popup.md`) — one `nz-modal` per
 * announcement (carousel inside for its images), queued by `AnnouncementPopupService`. Mounted
 * once in `BuyerLayoutComponent` (§1.8), same pattern as `QuickViewModalComponent`.
 */
@Component({
  selector: 'app-announcement-popup',
  standalone: true,
  imports: [NzModalModule, NzCarouselModule, IconComponent, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcement-popup.component.html',
  styleUrl: './announcement-popup.component.scss',
  host: {
    // §4: keyboard left/right must move the carousel within the current announcement. Bound on
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

  readonly carousel = viewChild(NzCarouselComponent);

  constructor() {
    // Guarded inside the service (root singleton) — safe to call every time this component is
    // (re)created, e.g. navigating away to /auth/login and back (§4).
    void this.popup.initialize();
  }

  onArrowLeft(): void {
    if (!this.popup.current()) return;
    this.carousel()?.pre();
  }

  onArrowRight(): void {
    if (!this.popup.current()) return;
    this.carousel()?.next();
  }

  /** §4: every `<img>` needs a meaningful `alt` even when the admin left `altText` blank. */
  fallbackAlt(image: AnnouncementImage, index: number): string {
    return `${this.popup.current()?.title ?? ''} - รูปที่ ${index + 1}`;
  }

  /**
   * §1.6/§1.7: no link → nothing happens, the popup stays open. Any link (internal or external)
   * closes the current popup — internal routes (`/...`) navigate through the Angular Router
   * without a full reload; everything else opens in a new tab and leaves the current page alone.
   */
  onImageClick(image: AnnouncementImage): void {
    const link = image.linkUrl;
    if (!link) return;

    this.popup.close();
    if (link.startsWith('/')) {
      void this.router.navigateByUrl(link);
    } else {
      window.open(link, '_blank', 'noopener');
    }
  }
}

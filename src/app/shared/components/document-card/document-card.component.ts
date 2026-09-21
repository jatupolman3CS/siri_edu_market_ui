import { ChangeDetectionStrategy, Component, OnDestroy, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentItem, RESOURCE_TYPE_LABELS } from '../../../core/models';
import {
  AdsService,
  CartService,
  QuickViewService,
  WishlistService,
} from '../../../core/services';
import { ThbPipe } from '../../pipes/thb.pipe';
import { CompactPipe } from '../../pipes/compact.pipe';
import { IconComponent } from '../icon/icon.component';
import { RatingStarsComponent } from '../rating-stars/rating-stars.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import { OptimizedImageComponent } from '../optimized-image/optimized-image.component';

@Component({
  selector: 'app-document-card',
  standalone: true,
  imports: [
    RouterLink,
    ThbPipe,
    CompactPipe,
    IconComponent,
    RatingStarsComponent,
    ImgFallbackDirective,
    TranslatePipe,
    OptimizedImageComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-card.component.html',
  styleUrl: './document-card.component.scss',
})
export class DocumentCardComponent implements OnDestroy {
  private readonly cart = inject(CartService);
  readonly wishlist = inject(WishlistService);
  private readonly quickView = inject(QuickViewService);
  private readonly ads = inject(AdsService);
  private readonly i18n = inject(TranslationService);

  readonly doc = input.required<DocumentItem>();
  readonly density = input<'default' | 'compact'>('default');

  /**
   * marketplace-cover-preview-count v1 §4, AC-10/AC-11/AC-12/AC-13: compact card's hover-driven
   * gallery cycle. Index of the gallery image currently shown; always resets to 0 on hover-out.
   */
  readonly activeGalleryIndex = signal(0);
  private cycleHandle: ReturnType<typeof setInterval> | null = null;
  /**
   * my-library-card-reuse v1: when true (buyer's "คลังของฉัน"), the cover shows the green
   * "เป็นเจ้าของแล้ว" ownership badge instead of the wishlist button, and the price/cart footer
   * row is hidden — the calling page (library) renders its own owned-only actions below the card.
   */
  readonly isOwned = input<boolean>(false);

  /** marketplace-redesign v1 §Screens 4 — compact card's resource-type chip, no emoji. */
  resourceTypeLabel(): string {
    const type = this.doc().resourceType;
    return this.i18n.t(`resourceTypes.${type}`) || RESOURCE_TYPE_LABELS[type];
  }

  /**
   * seller-ads-promotion v1 §4.3: fired on click of either navigable link (cover / title) of a
   * sponsored card, *before* the `routerLink` navigation it sits alongside — never
   * `preventDefault`/`stopPropagation` (the navigation must still happen) and never awaited (the
   * navigation must never wait on it).
   */
  onSponsoredNavigate(): void {
    if (!this.doc().isSponsored) return;
    this.ads.recordClick(this.doc().sponsoredCampaignId);
  }

  inCart(): boolean {
    return this.cart.has(this.doc().id);
  }

  isCompact(): boolean {
    return this.density() === 'compact';
  }

  /** marketplace-cover-preview-count v1 §4: image shown in the compact card's cover slot. */
  displayedCoverUrl(): string {
    const imgs = this.doc().gallery;
    return imgs[this.activeGalleryIndex()] ?? this.doc().cover;
  }

  /** marketplace-cover-preview-count v1 §4, AC-11: starts the hover auto-cycle through gallery images. */
  startCycle(): void {
    const imgs = this.doc().gallery;
    if (imgs.length <= 1 || this.cycleHandle !== null) return;
    this.cycleHandle = setInterval(() => {
      this.activeGalleryIndex.update((i) => (i + 1) % imgs.length);
    }, 1400);
  }

  /** marketplace-cover-preview-count v1 §4, AC-12: stops the cycle and resets to the first image. */
  stopCycle(): void {
    if (this.cycleHandle !== null) {
      clearInterval(this.cycleHandle);
      this.cycleHandle = null;
    }
    this.activeGalleryIndex.set(0);
  }

  /** marketplace-cover-preview-count v1 AC-13: clears any pending timer so it never fires after destroy. */
  ngOnDestroy(): void {
    this.stopCycle();
  }

  addToCart(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.inCart()) {
      this.cart.add(this.doc());
    }
  }

  toggleWishlist(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.wishlist.toggle(this.doc());
  }

  openQuickView(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.quickView.open(this.doc());
  }
}

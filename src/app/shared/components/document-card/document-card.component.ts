import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentItem } from '../../../core/models';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-card.component.html',
  styleUrl: './document-card.component.scss',
})
export class DocumentCardComponent {
  private readonly cart = inject(CartService);
  readonly wishlist = inject(WishlistService);
  private readonly quickView = inject(QuickViewService);
  private readonly ads = inject(AdsService);

  readonly doc = input.required<DocumentItem>();
  readonly density = input<'default' | 'compact'>('default');

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

import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentItem, RESOURCE_TYPE_LABELS } from '../../../core/models';
import {
  CartService,
  QuickViewService,
  WishlistService,
} from '../../../core/services';
import { ThbPipe } from '../../pipes/thb.pipe';
import { CompactPipe } from '../../pipes/compact.pipe';
import { IconComponent } from '../icon/icon.component';
import { RatingStarsComponent } from '../rating-stars/rating-stars.component';

@Component({
  selector: 'app-document-card',
  standalone: true,
  imports: [RouterLink, ThbPipe, CompactPipe, IconComponent, RatingStarsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-card.component.html',
  styleUrl: './document-card.component.scss',
})
export class DocumentCardComponent {
  private readonly cart = inject(CartService);
  readonly wishlist = inject(WishlistService);
  private readonly quickView = inject(QuickViewService);

  readonly doc = input.required<DocumentItem>();
  readonly density = input<'default' | 'compact'>('default');

  inCart(): boolean {
    return this.cart.has(this.doc().id);
  }

  resourceLabel(): string {
    return RESOURCE_TYPE_LABELS[this.doc().resourceType] ?? this.doc().resourceType;
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

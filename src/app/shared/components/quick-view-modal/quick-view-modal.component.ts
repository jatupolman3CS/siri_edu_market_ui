import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import {
  CartService,
  QuickViewService,
  WishlistService,
} from '../../../core/services';
import { RESOURCE_TYPE_LABELS, GRADE_LEVEL_LABELS } from '../../../core/models';
import { ThbPipe } from '../../pipes/thb.pipe';
import { CompactPipe } from '../../pipes/compact.pipe';
import { IconComponent } from '../icon/icon.component';
import { RatingStarsComponent } from '../rating-stars/rating-stars.component';

@Component({
  selector: 'app-quick-view-modal',
  standalone: true,
  imports: [
    RouterLink,
    NzModalModule,
    ThbPipe,
    CompactPipe,
    IconComponent,
    RatingStarsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quick-view-modal.component.html',
  styleUrl: './quick-view-modal.component.scss',
})
export class QuickViewModalComponent {
  readonly quickView = inject(QuickViewService);
  readonly wishlist = inject(WishlistService);
  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  resourceLabel(t: string): string {
    return RESOURCE_TYPE_LABELS[t as keyof typeof RESOURCE_TYPE_LABELS] ?? t;
  }
  gradeLabel(g: string): string {
    return GRADE_LEVEL_LABELS[g as keyof typeof GRADE_LEVEL_LABELS] ?? g;
  }

  addToCart(): void {
    const d = this.quickView.doc();
    if (d && !this.cart.has(d.id)) {
      this.cart.add(d);
    }
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import {
  CartService,
  QuickViewService,
  WishlistService,
} from '../../../core/services';
import { RESOURCE_TYPE_LABELS, GRADE_LEVEL_LABELS } from '../../../core/models';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { ThbPipe } from '../../pipes/thb.pipe';
import { CompactPipe } from '../../pipes/compact.pipe';
import { IconComponent } from '../icon/icon.component';
import { RatingStarsComponent } from '../rating-stars/rating-stars.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

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
    ImgFallbackDirective,
    TranslatePipe,
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
  readonly translation = inject(TranslationService);

  resourceLabel(t: string): string {
    const key = `resourceTypes.${t}`;
    const translated = this.translation.t(key);
    return translated !== key ? translated : (RESOURCE_TYPE_LABELS[t as keyof typeof RESOURCE_TYPE_LABELS] ?? t);
  }

  gradeLabel(g: string): string {
    const key = `gradeLevels.${g}`;
    const translated = this.translation.t(key);
    return translated !== key ? translated : (GRADE_LEVEL_LABELS[g as keyof typeof GRADE_LEVEL_LABELS] ?? g);
  }

  addToCart(): void {
    const d = this.quickView.doc();
    if (d && !this.cart.has(d.id)) {
      this.cart.add(d);
    }
  }
}

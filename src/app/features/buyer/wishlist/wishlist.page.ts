import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { CartService, WishlistService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TranslationService, TranslatePipe } from '../../../core/i18n';

@Component({
  selector: 'app-buyer-wishlist',
  standalone: true,
  imports: [
    RouterLink,
    NzModalModule,
    PageHeroComponent,
    DocumentCardComponent,
    EmptyStateComponent,
    IconComponent,
    ThbPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wishlist.page.html',
  styleUrl: './wishlist.page.scss',
})
export class BuyerWishlistPage {
  readonly wishlist = inject(WishlistService);
  private readonly cart = inject(CartService);
  private readonly modal = inject(NzModalService);
  private readonly i18n = inject(TranslationService);

  totalValue(): number {
    return this.wishlist.items().reduce((sum, d) => sum + d.price, 0);
  }

  addAllToCart(): void {
    this.wishlist.items().forEach((d) => {
      if (!this.cart.has(d.id)) {
        this.cart.add(d);
      }
    });
  }

  confirmClear(): void {
    this.modal.confirm({
      nzTitle: this.i18n.t('wishlist.confirmClearTitle'),
      nzContent: this.i18n.t('wishlist.confirmClearDesc'),
      nzOkText: this.i18n.t('wishlist.clearAllBtn'),
      nzOkDanger: true,
      nzCancelText: this.i18n.t('common.cancel'),
      nzOnOk: () => this.wishlist.clear(),
    });
  }
}

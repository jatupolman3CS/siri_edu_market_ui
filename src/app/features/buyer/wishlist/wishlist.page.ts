import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { CartService, WishlistService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wishlist.page.html',
  styleUrl: './wishlist.page.scss',
})
export class BuyerWishlistPage {
  readonly wishlist = inject(WishlistService);
  private readonly cart = inject(CartService);
  private readonly modal = inject(NzModalService);

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
      nzTitle: 'ยืนยันล้างรายการโปรด',
      nzContent: 'ลบทุกรายการโปรดออก?',
      nzOkText: 'ลบทั้งหมด',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.wishlist.clear(),
    });
  }
}

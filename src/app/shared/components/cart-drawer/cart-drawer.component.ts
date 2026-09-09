import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, CartService } from '../../../core/services';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import { ThbPipe } from '../../pipes/thb.pipe';
import { IconComponent } from '../icon/icon.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [
    NzDrawerModule,
    RouterLink,
    ThbPipe,
    TranslatePipe,
    IconComponent,
    EmptyStateComponent,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-drawer.component.html',
  styleUrl: './cart-drawer.component.scss',
})
export class CartDrawerComponent {
  readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly i18n = inject(TranslationService);

  checkout(): void {
    this.cart.closeDrawer();
    if (!this.auth.isAuthenticated()) {
      this.message.warning(this.i18n.t('common.loginRequired'));
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: '/checkout' },
      });
      return;
    }
    this.router.navigate(['/checkout']);
  }
}

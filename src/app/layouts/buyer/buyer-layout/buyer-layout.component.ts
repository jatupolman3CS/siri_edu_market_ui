import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { AppFooterComponent } from '../../../shared/components/app-footer/app-footer.component';
import { CartDrawerComponent } from '../../../shared/components/cart-drawer/cart-drawer.component';
import { QuickViewModalComponent } from '../../../shared/components/quick-view-modal/quick-view-modal.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { AnnouncementPopupComponent } from '../../../shared/components/announcement-popup/announcement-popup.component';
import {
  BottomTabBarComponent,
  type BottomTabItem,
} from '../../../shared/components/bottom-tab-bar/bottom-tab-bar.component';
import { AuthService } from '../../../core/services';
import { LayoutChromeService } from '../../../core/layout';

@Component({
  selector: 'app-buyer-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    AppFooterComponent,
    CartDrawerComponent,
    QuickViewModalComponent,
    GlobalLoaderComponent,
    AnnouncementPopupComponent,
    BottomTabBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './buyer-layout.component.html',
  styleUrl: './buyer-layout.component.scss',
})
export class BuyerLayoutComponent {
  private readonly auth = inject(AuthService);
  protected readonly chrome = inject(LayoutChromeService);

  /** Phone bottom tab bar — responsive-ui v1 §4.4 (บัญชี → sign-in when signed out). */
  readonly tabItems = computed<readonly BottomTabItem[]>(() => [
    { label: 'responsive.tab.home', icon: 'home', href: '/', exact: true },
    { label: 'responsive.tab.marketplace', icon: 'search', href: '/marketplace' },
    { label: 'responsive.tab.library', icon: 'package', href: '/library' },
    { label: 'responsive.tab.orders', icon: 'doc', href: '/orders' },
    {
      label: 'responsive.tab.account',
      icon: 'user',
      href: this.auth.isAuthenticated() ? '/account' : '/auth/login',
    },
  ]);

  /**
   * Root padding-bottom while a sticky action bar is alive (phone only — bars register only
   * there). The bar's in-page spacer sits *above* `<app-footer>`, so without this the bottom of
   * the footer ends up behind the fixed bar (G-11). Uses the bar's measured height, falling
   * back to the token height when it has not been measured.
   */
  protected readonly actionBarReserve = computed<string | null>(() => {
    if (!this.chrome.actionBarActive()) {
      return null;
    }
    const height = this.chrome.actionBarHeight();
    return height === null ? 'calc(var(--action-bar-h) + var(--safe-bottom))' : `${height}px`;
  });
}

import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { Router, RouterLink } from '@angular/router';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, CartService } from '../../../core/services';
import { ViewportService } from '../../../core/layout';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import { ThbPipe } from '../../pipes/thb.pipe';
import { IconComponent } from '../icon/icon.component';
import { EmptyStateComponent } from '../empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [
    A11yModule,
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

  private readonly viewport = inject(ViewportService);

  /**
   * responsive-ui v1 §4.7: phone (<744) → bottom sheet 92dvh; >=744 → right drawer min(420px, 90vw).
   */
  readonly placement = computed<'bottom' | 'right'>(() => (this.viewport.isPhone() ? 'bottom' : 'right'));
  readonly drawerWidth = 'min(420px, 90vw)';
  readonly drawerHeight = '92dvh';

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  private readonly document = inject(DOCUMENT);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    // R-11 (F104): after open, focus sits on the close button. This follows `drawerOpen()` itself:
    // the old `nzVisibleChange(true)` + setTimeout ran while the panel was still
    // `visibility: hidden` (styles.scss hides a closed drawer until `.ant-drawer-open` lands a
    // frame later), so `focus()` was a no-op and focus stayed on <body>. Retry per frame until
    // the button takes focus (capped), and stop if the drawer closes first.
    effect((onCleanup) => {
      if (!this.cart.drawerOpen() || !this.isBrowser) return;
      let frames = 0;
      let handle = 0;
      const tryFocus = (): void => {
        const btn = this.closeBtn()?.nativeElement;
        btn?.focus();
        if (btn && this.document.activeElement === btn) return;
        if (++frames < 30) handle = requestAnimationFrame(tryFocus);
      };
      handle = requestAnimationFrame(tryFocus);
      onCleanup(() => cancelAnimationFrame(handle));
    });
  }

  /**
   * Keeps CartService in step with what NG-Zorro actually shows. On browser back the drawer's
   * overlay is disposed (disposeOnNavigation) and it emits nzVisibleChange(false) — not nzOnClose —
   * so `drawerOpen` stayed true: the next cart tap only toggled it back to false (nothing opened),
   * the sticky-bar 'ดูตะกร้า' did nothing, and returning to the store re-opened the drawer by itself.
   * Opening is handled by the focus effect in the constructor.
   */
  onVisibleChange(visible: boolean): void {
    if (!visible && this.cart.drawerOpen()) this.cart.closeDrawer();
  }

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

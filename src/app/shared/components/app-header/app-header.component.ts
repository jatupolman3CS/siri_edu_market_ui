import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import {
  CartService,
  AuthService,
  WishlistService,
  MeService,
} from '../../../core/services';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LogoComponent } from '../logo/logo.component';
import { IconComponent } from '../icon/icon.component';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { defaultAvatarUrl } from '../../../core/brand-assets';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterLink,
    RouterLinkActive,
    FormsModule,
    NzDropDownModule,
    LogoComponent,
    IconComponent,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly wishlist = inject(WishlistService);
  private readonly me = inject(MeService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly query = signal<string>('');

  /**
   * Q-bugfix item 1: below the `md` breakpoint the desktop `<nav>` and the "เข้าสู่ระบบ" link
   * are both `hidden` (see template) with nothing in their place — a Playwright sweep across
   * 375–768px found the whole primary nav inaccessible on every real mobile viewport. This
   * signal drives a `md:hidden` toggle button + drawer-style panel that exposes the same links.
   */
  readonly mobileMenuOpen = signal(false);
  private readonly mobileMenuToggle = viewChild<ElementRef<HTMLButtonElement>>('mobileMenuToggle');
  private readonly mobileMenuPanel = viewChild<ElementRef<HTMLElement>>('mobileMenuPanel');

  /** Avatar URL resolved from R2 via MeService — falls back to session avatar or placeholder. */
  readonly avatarSrc = computed(() => {
    const r2Url = resolvePublicUrl(this.me.profile()?.avatarUrl);
    if (r2Url) return r2Url;
    const sessionAvatar = this.auth.user()?.avatar;
    if (sessionAvatar) return sessionAvatar;
    return defaultAvatarUrl();
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const q = this.router.parseUrl(this.router.url).queryParams['q'];
        this.query.set(typeof q === 'string' ? q : '');
        // Close the mobile menu on every navigation so it never lingers open over the next page.
        this.mobileMenuOpen.set(false);
      });

    // Load real profile (with R2 avatarUrl) whenever the user is authenticated
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
      }
    });

    // Move focus into the panel when it opens, and back to the toggle button when it closes
    // (so keyboard/screen-reader users never lose their place). Skips the very first run so
    // mounting the component doesn't yank focus onto the hamburger button.
    let wasOpen = false;
    effect(() => {
      const open = this.mobileMenuOpen();
      if (open) {
        queueMicrotask(() => this.mobileMenuPanel()?.nativeElement.querySelector('a')?.focus());
      } else if (wasOpen) {
        this.mobileMenuToggle()?.nativeElement.focus();
      }
      wasOpen = open;
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  /**
   * Main nav links — "Siri Studio" only shows for seller/admin roles so guests and
   * plain buyers never see a link that the route guard (`sellerGuard`) would bounce
   * them back from. Computed signal because role can change on login/logout without
   * a page reload (zoneless app).
   */
  readonly navItems = computed(() => {
    const items: { label: string; href: string; exact?: boolean }[] = [
      { label: 'หน้าแรก', href: '/', exact: true },
      { label: 'ตลาด', href: '/marketplace' },
      { label: 'หมวดหมู่', href: '/categories' },
      { label: 'แพ็กเกจ', href: '/bundles' },
      { label: 'ฟรี', href: '/free' },
    ];
    if (this.auth.isSeller() || this.auth.isAdmin()) {
      items.push({ label: 'Siri Studio', href: '/seller' });
    }
    return items;
  });

  firstName(full: string): string {
    return full.split(' ')[0];
  }

  search(): void {
    const q = this.query().trim();
    this.router.navigate(['/marketplace'], {
      queryParams: { q: q || null },
      queryParamsHandling: 'merge',
    });
  }

  go(path: string): void {
    this.router.navigate([path]);
  }

  signOut(): void {
    this.auth.signOut();
    this.message.info('ออกจากระบบเรียบร้อย — แล้วเจอกันใหม่ 👋');
    this.router.navigate(['/']);
  }
}

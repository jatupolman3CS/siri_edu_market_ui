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
  CatalogService,
  AuthService,
  WishlistService,
  MeService,
  NotificationFeedService,
} from '../../../core/services';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LogoComponent } from '../logo/logo.component';
import { IconComponent } from '../icon/icon.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { defaultAvatarUrl } from '../../../core/brand-assets';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageSwitcherComponent } from '../language-switcher/language-switcher.component';

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
    NotificationBellComponent,
    ImgFallbackDirective,
    LanguageSwitcherComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly wishlist = inject(WishlistService);
  readonly translation = inject(TranslationService);
  /** follow-store-notifications v1: badge count reused by the mobile drawer link (the desktop
   *  bell renders its own badge inside `NotificationBellComponent`). */
  readonly feed = inject(NotificationFeedService);
  private readonly me = inject(MeService);
  private readonly router = inject(Router);
  private readonly catalog = inject(CatalogService);
  private readonly message = inject(NzMessageService);

  readonly query = signal<string>('');

  /** Trending / popular search tags displayed below the prominent search bar */
  readonly quickSearches = [
    'สรุปชีวะ',
    'ข้อสอบ ก.พ.',
    'Portfolio',
    'คณิต ม.ปลาย',
    'ใบงานปฐมวัย',
    'TOEIC',
    'เทมเพลต',
  ];

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
      { label: this.translation.t('nav.home'), href: '/', exact: true },
      { label: this.translation.t('nav.marketplace'), href: '/marketplace' },
      { label: this.translation.t('nav.bundles'), href: '/bundles' },
      { label: this.translation.t('nav.free'), href: '/free' },
      { label: this.translation.t('nav.categories'), href: '/categories' },
    ];
    if (this.auth.isSeller() || this.auth.isAdmin()) {
      items.push({ label: this.translation.t('nav.studio'), href: '/seller' });
    }
    return items;
  });

  /**
   * Sub-nav items displayed on desktop left side:
   * 'marketplace', 'bundles', and 'free' are grouped consecutively right next to each other.
   * Excludes only 'categories' (has its own dedicated leading button).
   */
  readonly subnavItems = computed(() =>
    this.navItems().filter((item) => item.href !== '/categories'),
  );

  firstName(full: string): string {
    return full.split(' ')[0];
  }

  search(): void {
    const q = this.query().trim();
    this.catalog.resetFilters();
    this.catalog.setFilters({ search: q });
    this.router.navigate(['/marketplace'], {
      queryParams: { q: q || null },
      onSameUrlNavigation: 'reload',
    });
  }

  searchTag(tag: string): void {
    this.query.set(tag);
    this.search();
  }

  clearQuery(): void {
    this.query.set('');
  }

  go(path: string): void {
    this.router.navigate([path]);
  }

  signOut(): void {
    this.auth.signOut();
    this.message.info(this.translation.t('header.signedOutSuccess'));
    this.router.navigate(['/']);
  }
}

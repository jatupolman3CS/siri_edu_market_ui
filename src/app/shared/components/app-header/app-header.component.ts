import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
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
import { DropdownBackResetDirective } from '../../directives/dropdown-back-reset.directive';
import { ViewportService, acquirePageScrollLock, releasePageScrollLock } from '../../../core/layout';

/** Browse (archetype A) routes that show the phone search row — responsive-ui v1 §1.3. */
const BROWSE_ROUTE =
  /^\/(?:marketplace|categories|category\/[^/]+|bundles|free|store\/[^/]+|tcas|tgat-tpat|a-level|onet)?\/?$/;

export function isBrowseRoute(url: string): boolean {
  const path = url.split(/[?#]/)[0] || '/';
  return BROWSE_ROUTE.test(path);
}

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
    A11yModule,
    DropdownBackResetDirective,
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
  private readonly viewport = inject(ViewportService);
  private readonly document = inject(DOCUMENT);

  readonly query = signal<string>('');

  /** Current router URL (updated on every NavigationEnd). */
  private readonly currentUrl = signal<string>(this.router.url);

  /**
   * หมวดหมู่ owns both /categories and /category/:slug. `routerLinkActive` on '/categories' only
   * matches the former, so category pages marked nothing in the chip nav, drawer or desktop nav.
   */
  readonly categoriesActive = computed(() => /^\/categor(?:y|ies)(?:[/?#]|$)/.test(this.currentUrl()));

  /**
   * responsive-ui v1 §1.3 item 2: the phone search row only appears on browse (archetype A)
   * routes; every other route gets the bare 56px top bar.
   */
  readonly showPhoneSearch = computed(() => isBrowseRoute(this.currentUrl()));

  /** Trending / popular search tags displayed below the prominent search bar */
  readonly quickSearches = computed(() => this.translation.list('header.quickSearchItems'));

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
        this.currentUrl.set(this.router.url);
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

    // F49: page scroll lock while the ☰ drawer is open (§4.3 overlay pattern) — drags on the
    // backdrop used to scroll the page behind the open menu.
    effect(() => this.setScrollLock(this.mobileMenuOpen()));
    inject(DestroyRef).onDestroy(() => this.setScrollLock(false));

    // F42: the ☰ toggle is md:hidden for signed-in users (xl:hidden for guests) but the drawer is
    // only xl:hidden, so a drawer opened in portrait stayed open (and scroll-locked) after rotating
    // to a tier without the toggle. Close it on that transition; the first run only records the
    // tier so mounting (jsdom = desktop) never closes anything.
    let wasToggleHidden: boolean | null = null;
    effect(() => {
      const toggleHidden = this.auth.isAuthenticated() ? this.viewport.isTabletUp() : this.viewport.isDesktop();
      if (toggleHidden && wasToggleHidden === false) untracked(() => this.mobileMenuOpen.set(false));
      wasToggleHidden = toggleHidden;
    });
  }

  private scrollLocked = false;

  private setScrollLock(on: boolean): void {
    if (on === this.scrollLocked) return;
    this.scrollLocked = on;
    if (on) acquirePageScrollLock(this.document);
    else releasePageScrollLock(this.document);
  }

  /**
   * F86: the avatar menu renders at the end of <body> (CDK overlay), so after opening it the Tab
   * order continued through the page. Move focus to its first item once it is attached (the
   * dropdown emits before attaching, hence the timeout). Escape closes it and refocuses the trigger.
   */
  onAvatarMenuVisible(visible: boolean): void {
    if (!visible) return;
    setTimeout(() => {
      this.document
        .querySelector<HTMLElement>('[data-testid="header-avatar-menu"] :is(a[href], button:not([disabled]))')
        ?.focus();
    });
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  /**
   * Main nav links for primary navigation.
   * "Siri Studio" removed per user request.
   */
  readonly navItems = computed(() => [
    { label: this.translation.t('nav.home'), href: '/', exact: true },
    { label: this.translation.t('nav.marketplace'), href: '/marketplace' },
    { label: this.translation.t('nav.categories'), href: '/categories' },
  ]);

  /**
   * Sub-nav items displayed on desktop left side:
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

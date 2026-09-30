import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { AuthService, MeService } from '../../../core/services';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { defaultAvatarUrl } from '../../../core/brand-assets';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/components/language-switcher/language-switcher.component';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import {
  BottomTabBarComponent,
  type BottomTabItem,
} from '../../../shared/components/bottom-tab-bar/bottom-tab-bar.component';
import {
  LayoutChromeService,
  ViewportService,
  acquirePageScrollLock,
  releasePageScrollLock,
} from '../../../core/layout';
import { DropdownBackResetDirective } from '../../../shared/directives/dropdown-back-reset.directive';

@Component({
  selector: 'app-seller-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LogoComponent,
    IconComponent,
    NotificationBellComponent,
    GlobalLoaderComponent,
    ImgFallbackDirective,
    TranslatePipe,
    LanguageSwitcherComponent,
    NgTemplateOutlet,
    NzDropDownModule,
    BottomTabBarComponent,
    A11yModule,
    DropdownBackResetDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-layout.component.html',
  styleUrl: './seller-layout.component.scss',
})
export class SellerLayoutComponent {
  readonly auth = inject(AuthService);
  readonly translation = inject(TranslationService);
  readonly chrome = inject(LayoutChromeService);
  private readonly me = inject(MeService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly viewport = inject(ViewportService);
  private readonly document = inject(DOCUMENT);

  /**
   * Phone bottom tab bar (docs/contracts/responsive-ui.md §4.4). Labels are i18n keys (the tab
   * bar pipes them through `trans`); เมนู opens the drawer with every `navItems` entry.
   */
  readonly tabItems: readonly BottomTabItem[] = [
    { label: 'responsive.seller.tab.overview', icon: 'dashboard', href: '/seller', exact: true },
    { label: 'responsive.seller.tab.documents', icon: 'doc', href: '/seller/documents' },
    { label: 'responsive.seller.tab.upload', icon: 'upload', href: '/seller/upload', raised: true },
    { label: 'responsive.seller.tab.earnings', icon: 'wallet', href: '/seller/earnings' },
    { label: 'responsive.tab.menu', icon: 'menu', action: 'menu' },
  ];

  /** Phone menu drawer state — opened by the เมนู tab */
  readonly sidebarOpen = signal(false);

  readonly avatarSrc = computed(() => {
    const r2Url = resolvePublicUrl(this.me.profile()?.avatarUrl);
    if (r2Url) return r2Url;
    const sessionAvatar = this.auth.user()?.avatar;
    if (sessionAvatar) return sessionAvatar;
    return defaultAvatarUrl();
  });

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
      }
    });

    // Close sidebar on every navigation
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.sidebarOpen.set(false));

    // The drawer is only hidden by CSS (md:hidden) at >=744, so its open state survived a rotation
    // to landscape and it re-appeared back in portrait. Close it on the phone -> tablet transition
    // (tracking the previous tier keeps this from firing on first render, e.g. jsdom = desktop).
    let wasTabletUp: boolean | null = null;
    effect(() => {
      const tabletUp = this.viewport.isTabletUp();
      if (tabletUp && wasTabletUp === false) untracked(() => this.sidebarOpen.set(false));
      wasTabletUp = tabletUp;
    });

    // Page scroll lock while the phone drawer is open (§4.3 overlay pattern).
    effect(() => this.setScrollLock(this.sidebarOpen()));
    inject(DestroyRef).onDestroy(() => this.setScrollLock(false));
  }

  private scrollLocked = false;

  private setScrollLock(on: boolean): void {
    if (on === this.scrollLocked) return;
    this.scrollLocked = on;
    if (on) acquirePageScrollLock(this.document);
    else releasePageScrollLock(this.document);
  }

  /**
   * The avatar menu renders at the end of <body> (CDK overlay), so after opening it the Tab order
   * continued through the page. Move focus to its first item once it is attached (the dropdown
   * emits before attaching, hence the timeout). Escape already closes it and refocuses the trigger.
   */
  onAvatarMenuVisible(visible: boolean): void {
    if (!visible) return;
    setTimeout(() => {
      const first = this.document.querySelector<HTMLElement>(
        '[data-testid="seller-avatar-menu"] :is(a[href], button:not([disabled]))',
      );
      first?.focus();
    });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  openSidebar(): void {
    this.sidebarOpen.set(true);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  signOut(): void {
    this.auth.signOut();
    this.message.info(this.translation.t('header.signedOutSuccess'));
    this.router.navigate(['/']);
  }

  readonly navItems = computed(() => [
    { label: this.translation.t('seller.dashboard'), href: '/seller', icon: 'dashboard' as const, exact: true },
    { label: this.translation.t('seller.documents'), href: '/seller/documents', icon: 'doc' as const },
    { label: this.translation.t('seller.upload'), href: '/seller/upload', icon: 'upload' as const },
    { label: this.translation.t('seller.watermark'), href: '/seller/watermark', icon: 'shield' as const },
    { label: this.translation.t('seller.payout'), href: '/seller/earnings', icon: 'wallet' as const },
    { label: this.translation.t('seller.ads'), href: '/seller/ads', icon: 'sparkle' as const },
    { label: this.translation.t('seller.qna'), href: '/seller/qna', icon: 'bell' as const },
    { label: this.translation.t('seller.storeSections'), href: '/seller/store-sections', icon: 'package' as const },
    { label: this.translation.t('seller.bundles'), href: '/seller/bundles', icon: 'package' as const },
    { label: this.translation.t('seller.reviews'), href: '/seller/reviews', icon: 'star' as const },
    { label: this.translation.t('seller.notifications'), href: '/seller/notifications', icon: 'bell' as const },
    { label: this.translation.t('seller.settings'), href: '/seller/settings', icon: 'gear' as const },
  ]);
}

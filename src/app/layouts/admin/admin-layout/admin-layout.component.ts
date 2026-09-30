import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { A11yModule } from '@angular/cdk/a11y';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { NotificationBellComponent } from '../../../shared/components/notification-bell/notification-bell.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { AdminService, AuthService, MeService } from '../../../core/services';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { defaultAvatarUrl } from '../../../core/brand-assets';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { LanguageSwitcherComponent } from '../../../shared/components/language-switcher/language-switcher.component';
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

type AdminNavIcon = 'dashboard' | 'doc' | 'shield' | 'wallet' | 'user' | 'tag' | 'gear' | 'bell' | 'flag' | 'sparkle' | 'package' | 'chart';

interface AdminNavItem {
  label: string;
  href: string;
  icon: AdminNavIcon;
  exact?: boolean;
  badge?: number;
}

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    NotificationBellComponent,
    GlobalLoaderComponent,
    ImgFallbackDirective,
    TranslatePipe,
    LanguageSwitcherComponent,
    BottomTabBarComponent,
    A11yModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
  readonly translation = inject(TranslationService);
  readonly chrome = inject(LayoutChromeService);
  private readonly me = inject(MeService);
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly viewport = inject(ViewportService);
  private readonly document = inject(DOCUMENT);

  /**
   * Documents awaiting approval — drives the tab bar / rail / sidebar badge. The server's
   * unfiltered total (`pendingBadgeCount`, loaded by this layout), not the loaded rows of the
   * approval pager, which were capped at its 50-row page and only existed after the dashboard or
   * approval page had fetched them.
   */
  readonly pendingCount = computed(() => this.admin.pendingBadgeCount() ?? 0);

  readonly avatarSrc = computed(() => {
    const r2Url = resolvePublicUrl(this.me.profile()?.avatarUrl);
    if (r2Url) return r2Url;
    const sessionAvatar = this.auth.user()?.avatar;
    if (sessionAvatar) return sessionAvatar;
    return defaultAvatarUrl();
  });

  readonly newFeedbackCount = signal<number>(0);

  /** Phone sidebar drawer state — toggled by the เมนู tab of the bottom tab bar. */
  readonly sidebarOpen = signal(false);

  /** Phone top-bar avatar menu (back to store / language / sign out). */
  readonly accountMenuOpen = signal(false);

  /**
   * Phone bottom tab bar (docs/contracts/responsive-ui.md §4.4). The อนุมัติ badge reuses
   * `pendingCount()` — no extra API call.
   */
  readonly tabItems = computed<readonly BottomTabItem[]>(() => [
    { label: 'responsive.admin.tab.overview', icon: 'dashboard', href: '/admin', exact: true },
    { label: 'responsive.admin.tab.approval', icon: 'shield', href: '/admin/approval', badge: this.pendingCount() },
    { label: 'responsive.admin.tab.users', icon: 'user', href: '/admin/users' },
    { label: 'responsive.admin.tab.transactions', icon: 'wallet', href: '/admin/transactions' },
    { label: 'responsive.tab.menu', icon: 'menu', action: 'menu' },
  ]);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
        void this.loadNewFeedbackCount();
        void this.admin.refreshPendingBadgeCount();
      }
    });

    // The phone drawer / account menu are only hidden by CSS (md:hidden) at >=744, so their open
    // state survived a rotation to landscape and they re-appeared when the phone returned to
    // portrait. Close them on the phone -> tablet transition (tracking the previous tier keeps
    // this from firing on first render, e.g. in jsdom where the tier defaults to desktop).
    let wasTabletUp: boolean | null = null;
    effect(() => {
      const tabletUp = this.viewport.isTabletUp();
      if (tabletUp && wasTabletUp === false) {
        untracked(() => {
          this.sidebarOpen.set(false);
          this.accountMenuOpen.set(false);
        });
      }
      wasTabletUp = tabletUp;
    });

    // Page scroll lock while the phone drawer is open (§4.3 overlay pattern; drags on the
    // backdrop used to scroll the dashboard behind it).
    effect(() => this.setScrollLock(this.sidebarOpen()));
    inject(DestroyRef).onDestroy(() => this.setScrollLock(false));

    // Close sidebar on every navigation
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.sidebarOpen.set(false);
        this.accountMenuOpen.set(false);
      });
  }

  private scrollLocked = false;

  private setScrollLock(on: boolean): void {
    if (on === this.scrollLocked) return;
    this.scrollLocked = on;
    if (on) acquirePageScrollLock(this.document);
    else releasePageScrollLock(this.document);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  toggleAccountMenu(): void {
    this.accountMenuOpen.update((v) => !v);
  }

  closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
  }

  /**
   * Badge text for a nav item: pending approvals on อนุมัติ, otherwise the item's own count.
   * Capped at "99+" like the bottom tab bar (F87), so the rail and the sidebar show the same text
   * for the same server total.
   */
  badgeFor(item: AdminNavItem): string | null {
    const n = item.href === '/admin/approval' ? this.pendingCount() : (item.badge ?? 0);
    if (!n || n <= 0) return null;
    return n > 99 ? '99+' : String(n);
  }

  private async loadNewFeedbackCount(): Promise<void> {
    try {
      const count = await this.admin.countNewFeedback();
      this.newFeedbackCount.set(count);
    } catch {
      // silent
    }
  }

  signOut(): void {
    this.auth.signOut();
    this.message.info(this.translation.t('header.signedOutSuccess'));
    this.router.navigate(['/']);
  }

  readonly navItems = computed<AdminNavItem[]>(() => [
    { label: this.translation.t('admin.nav.dashboard'), href: '/admin', icon: 'dashboard' as const, exact: true },
    { label: this.translation.t('admin.nav.documents'), href: '/admin/documents', icon: 'doc' as const },
    { label: this.translation.t('admin.nav.approval'), href: '/admin/approval', icon: 'shield' as const },
    { label: this.translation.t('admin.nav.transactions'), href: '/admin/transactions', icon: 'wallet' as const },
    { label: this.translation.t('admin.nav.users'), href: '/admin/users', icon: 'user' as const },
    { label: this.translation.t('admin.nav.sellers'), href: '/admin/sellers', icon: 'user' as const },
    { label: this.translation.t('admin.nav.reports'), href: '/admin/reports', icon: 'flag' as const },
    {
      label: this.translation.t('admin.nav.feedback'),
      href: '/admin/feedback',
      icon: 'flag' as const,
      badge: this.newFeedbackCount(),
    },
    { label: this.translation.t('admin.nav.payouts'), href: '/admin/payouts', icon: 'wallet' as const },
    { label: this.translation.t('admin.nav.subscriptions'), href: '/admin/subscriptions', icon: 'wallet' as const },
    { label: this.translation.t('admin.nav.affiliates'), href: '/admin/affiliates', icon: 'chart' as const },
    { label: this.translation.t('admin.nav.ads'), href: '/admin/ads', icon: 'flag' as const },
    { label: this.translation.t('admin.nav.sellerApplications'), href: '/admin/seller-applications', icon: 'shield' as const },
    { label: this.translation.t('admin.nav.categories'), href: '/admin/categories', icon: 'tag' as const },
    { label: this.translation.t('admin.nav.crm'), href: '/admin/crm', icon: 'chart' as const },
    // G-30a: the only admin child route without a nav entry (reachable before only through a card
    // on /admin/crm). Label = the page's own title key; no new translation key.
    { label: this.translation.t('admin.crmAlerts.title'), href: '/admin/crm/document-alerts', icon: 'bell' as const },
    { label: this.translation.t('admin.nav.mlRecommendations'), href: '/admin/ml-recommendations', icon: 'sparkle' as const },
    { label: this.translation.t('admin.nav.announcements'), href: '/admin/announcements', icon: 'bell' as const },
    { label: this.translation.t('admin.nav.notifications'), href: '/admin/notifications', icon: 'bell' as const },
    { label: this.translation.t('admin.nav.notificationConfig'), href: '/admin/notification-config', icon: 'gear' as const },
    { label: this.translation.t('admin.nav.settings'), href: '/admin/settings', icon: 'gear' as const },
    { label: this.translation.t('admin.nav.auditLogs'), href: '/admin/audit', icon: 'doc' as const },
    { label: this.translation.t('admin.nav.documentGeneration'), href: '/admin/document-generation', icon: 'sparkle' as const },
    { label: this.translation.t('admin.nav.examHub'), href: '/admin/exam-hub', icon: 'doc' as const },
  ]);
}

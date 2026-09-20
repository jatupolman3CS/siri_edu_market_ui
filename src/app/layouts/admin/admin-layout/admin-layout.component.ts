import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
  readonly translation = inject(TranslationService);
  private readonly me = inject(MeService);
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  /** Live count of documents awaiting approval — drives the sidebar badge. */
  readonly pendingCount = computed(() => this.admin.pendingDocuments().length);

  readonly avatarSrc = computed(() => {
    const r2Url = resolvePublicUrl(this.me.profile()?.avatarUrl);
    if (r2Url) return r2Url;
    const sessionAvatar = this.auth.user()?.avatar;
    if (sessionAvatar) return sessionAvatar;
    return defaultAvatarUrl();
  });

  readonly newFeedbackCount = signal<number>(0);

  /** Mobile sidebar drawer state — toggled by hamburger button */
  readonly sidebarOpen = signal(false);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
        void this.loadNewFeedbackCount();
      }
    });

    // Close sidebar on every navigation
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.sidebarOpen.set(false));
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  closeSidebar(): void {
    this.sidebarOpen.set(false);
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

  readonly navItems = computed<
    Array<{
      label: string;
      href: string;
      icon: 'dashboard' | 'doc' | 'shield' | 'wallet' | 'user' | 'tag' | 'gear' | 'bell' | 'flag' | 'sparkle' | 'package' | 'chart';
      exact?: boolean;
      badge?: string;
    }>
  >(() => [
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
      badge: this.newFeedbackCount() > 0 ? String(this.newFeedbackCount()) : undefined,
    },
    { label: this.translation.t('admin.nav.payouts'), href: '/admin/payouts', icon: 'wallet' as const },
    { label: this.translation.t('admin.nav.affiliates'), href: '/admin/affiliates', icon: 'chart' as const },
    { label: this.translation.t('admin.nav.ads'), href: '/admin/ads', icon: 'flag' as const },
    { label: this.translation.t('admin.nav.sellerApplications'), href: '/admin/seller-applications', icon: 'shield' as const },
    { label: this.translation.t('admin.nav.categories'), href: '/admin/categories', icon: 'tag' as const },
    { label: this.translation.t('admin.nav.crm'), href: '/admin/crm', icon: 'chart' as const },
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

import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
        void this.loadNewFeedbackCount();
      }
    });
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
      icon: 'dashboard' | 'doc' | 'shield' | 'wallet' | 'user' | 'tag' | 'gear' | 'bell' | 'flag' | 'sparkle' | 'package';
      exact?: boolean;
      badge?: string;
    }>
  >(() => {
    const isTh = this.translation.currentLang() === 'th';
    return [
      { label: isTh ? 'ภาพรวม' : 'Overview', href: '/admin', icon: 'dashboard' as const, exact: true },
      { label: isTh ? 'จัดการเอกสาร' : 'Documents', href: '/admin/documents', icon: 'doc' as const },
      { label: isTh ? 'อนุมัติเอกสาร' : 'Document Approval', href: '/admin/approval', icon: 'shield' as const },
      { label: isTh ? 'ธุรกรรม' : 'Transactions', href: '/admin/transactions', icon: 'wallet' as const },
      { label: isTh ? 'ผู้ใช้ทั้งหมด' : 'Users', href: '/admin/users', icon: 'user' as const },
      { label: isTh ? 'ผู้ขาย' : 'Sellers', href: '/admin/sellers', icon: 'user' as const },
      // GAP-02: seller payout queue.
      { label: isTh ? 'รายงานเอกสาร' : 'Reports', href: '/admin/reports', icon: 'flag' as const },
      {
        label: isTh ? 'ข้อเสนอแนะผู้ใช้' : 'User Feedback',
        href: '/admin/feedback',
        icon: 'flag' as const,
        badge: this.newFeedbackCount() > 0 ? String(this.newFeedbackCount()) : undefined,
      },
      { label: isTh ? 'ถอนเงินผู้ขาย' : 'Seller Payouts', href: '/admin/payouts', icon: 'wallet' as const },
      // GAP-01: review queue for buyers applying to sell.
      { label: isTh ? 'ใบสมัครผู้ขาย' : 'Seller Applications', href: '/admin/seller-applications', icon: 'shield' as const },
      { label: isTh ? 'หมวดหมู่' : 'Categories', href: '/admin/categories', icon: 'tag' as const },
      // announcement-popup v1 §4: CRUD for the buyer-facing popup announcements.
      { label: isTh ? 'ประกาศข่าวสาร' : 'Announcements', href: '/admin/announcements', icon: 'bell' as const },
      // notification-master-config v1 §0.4 root cause #4: this used to link to the buyer
      // route `/notifications`, which threw the admin out of the admin layout.
      { label: isTh ? 'การแจ้งเตือน' : 'Notifications', href: '/admin/notifications', icon: 'bell' as const },
      // notification-master-config v1 §4.1: master config for every notification event.
      { label: isTh ? 'ตั้งค่าการแจ้งเตือน' : 'Notification Config', href: '/admin/notification-config', icon: 'gear' as const },
      { label: isTh ? 'ตั้งค่าแพลตฟอร์ม' : 'Settings', href: '/admin/settings', icon: 'gear' as const },
      { label: isTh ? 'ประวัติการทำงาน' : 'Audit Logs', href: '/admin/audit', icon: 'doc' as const },
      // category-content-auto-generation v1 §4: trigger/inspect the document auto-generation job.
      { label: isTh ? 'สร้างเอกสารอัตโนมัติ' : 'Auto Generation', href: '/admin/document-generation', icon: 'sparkle' as const },
      // exam-hub-landing-pages v1 §4: CMS management for the 4 exam hub pages.
      { label: isTh ? 'จัดการเนื้อหา Exam Hub' : 'Exam Hub CMS', href: '/admin/exam-hub', icon: 'doc' as const },
    ];
  });
}

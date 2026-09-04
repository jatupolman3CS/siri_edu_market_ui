import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { AdminService, AuthService, MeService } from '../../../core/services';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { defaultAvatarUrl } from '../../../core/brand-assets';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
    GlobalLoaderComponent,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  readonly auth = inject(AuthService);
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

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
      }
    });
  }

  signOut(): void {
    this.auth.signOut();
    this.message.info('ออกจากระบบเรียบร้อย — แล้วเจอกันใหม่ 👋');
    this.router.navigate(['/']);
  }

  readonly navItems: {
    label: string;
    href: string;
    icon: 'dashboard' | 'doc' | 'shield' | 'wallet' | 'user' | 'tag' | 'gear';
    exact?: boolean;
    badge?: string;
  }[] = [
    { label: 'ภาพรวม', href: '/admin', icon: 'dashboard' as const, exact: true },
    { label: 'จัดการเอกสาร', href: '/admin/documents', icon: 'doc' as const },
    { label: 'อนุมัติเอกสาร', href: '/admin/approval', icon: 'shield' as const },
    { label: 'ธุรกรรม', href: '/admin/transactions', icon: 'wallet' as const },
    { label: 'ผู้ขาย', href: '/admin/sellers', icon: 'user' as const },
    // GAP-02: seller payout queue.
    { label: 'รายงานเอกสาร', href: '/admin/reports', icon: 'shield' as const },
    { label: 'ถอนเงินผู้ขาย', href: '/admin/payouts', icon: 'wallet' as const },
    // GAP-01: review queue for buyers applying to sell.
    { label: 'ใบสมัครผู้ขาย', href: '/admin/seller-applications', icon: 'shield' as const },
    { label: 'หมวดหมู่', href: '/admin/categories', icon: 'tag' as const },
    { label: 'ตั้งค่าแพลตฟอร์ม', href: '/admin/settings', icon: 'gear' as const },
    { label: 'ประวัติการทำงาน', href: '/admin/audit', icon: 'doc' as const },
    // category-content-auto-generation v1 §4: trigger/inspect the document auto-generation job.
    { label: 'สร้างเอกสารอัตโนมัติ', href: '/admin/document-generation', icon: 'doc' as const },
  ];
}

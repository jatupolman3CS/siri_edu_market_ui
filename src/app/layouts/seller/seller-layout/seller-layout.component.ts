import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { AuthService, MeService } from '../../../core/services';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { resolvePublicUrl } from '../../../core/api-runtime';

@Component({
  selector: 'app-seller-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LogoComponent,
    IconComponent,
    GlobalLoaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-layout.component.html',
  styleUrl: './seller-layout.component.scss',
})
export class SellerLayoutComponent {
  readonly auth = inject(AuthService);
  private readonly me = inject(MeService);

  readonly avatarSrc = computed(() => {
    const r2Url = resolvePublicUrl(this.me.profile()?.avatarUrl);
    if (r2Url) return r2Url;
    const sessionAvatar = this.auth.user()?.avatar;
    if (sessionAvatar) return sessionAvatar;
    return 'https://ui-avatars.com/api/?name=' + encodeURIComponent(this.auth.user()?.name ?? 'U') + '&background=f9a8d4&color=9d174d&size=64';
  });

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
      }
    });
  }

  readonly navItems = [
    { label: 'ภาพรวม', href: '/seller', icon: 'dashboard' as const, exact: true },
    { label: 'เอกสารของฉัน', href: '/seller/documents', icon: 'doc' as const },
    { label: 'อัปโหลดเอกสาร', href: '/seller/upload', icon: 'upload' as const },
    { label: 'พรีวิว PDF', href: '/seller/pdf-preview', icon: 'eye' as const },
    // G-05: the AI Assistant entry is removed until the endpoint behind it does something.
    { label: 'รายได้ & Payout', href: '/seller/earnings', icon: 'wallet' as const },
    // GAP-06 / GAP-07: answering buyer questions and arranging the storefront.
    { label: 'คำถามจากผู้ซื้อ', href: '/seller/qna', icon: 'bell' as const },
    { label: 'หมวดหน้าร้าน', href: '/seller/store-sections', icon: 'package' as const },
    { label: 'รีวิวลูกค้า', href: '/seller/reviews', icon: 'star' as const },
    { label: 'ตั้งค่าร้าน', href: '/seller/settings', icon: 'gear' as const },
  ];
}

import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-layout.component.html',
  styleUrl: './seller-layout.component.scss',
})
export class SellerLayoutComponent {
  readonly auth = inject(AuthService);
  readonly translation = inject(TranslationService);
  private readonly me = inject(MeService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

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
    this.message.info(this.translation.t('header.signedOutSuccess'));
    this.router.navigate(['/']);
  }

  readonly navItems = computed(() => [
    { label: this.translation.t('seller.dashboard'), href: '/seller', icon: 'dashboard' as const, exact: true },
    { label: this.translation.t('seller.documents'), href: '/seller/documents', icon: 'doc' as const },
    { label: this.translation.t('seller.upload'), href: '/seller/upload', icon: 'upload' as const },
    { label: this.translation.currentLang() === 'th' ? 'พรีวิว PDF' : 'PDF Preview', href: '/seller/pdf-preview', icon: 'eye' as const },
    { label: this.translation.currentLang() === 'th' ? 'จัดการลายน้ำ' : 'Watermark Studio', href: '/seller/watermark', icon: 'shield' as const },
    { label: this.translation.t('seller.payout'), href: '/seller/earnings', icon: 'wallet' as const },
    // seller-ads-promotion v1 §4.1/§4.4: flat-fee ad campaigns bought with the seller's own ledger balance.
    { label: 'โปรโมตเอกสาร', href: '/seller/ads', icon: 'sparkle' as const },
    { label: this.translation.currentLang() === 'th' ? 'คำถามจากผู้ซื้อ' : 'Customer Q&A', href: '/seller/qna', icon: 'bell' as const },
    { label: this.translation.currentLang() === 'th' ? 'หมวดหน้าร้าน' : 'Storefront Sections', href: '/seller/store-sections', icon: 'package' as const },
    { label: this.translation.currentLang() === 'th' ? 'แพ็กเกจของฉัน' : 'My Bundles', href: '/seller/bundles', icon: 'package' as const },
    { label: this.translation.currentLang() === 'th' ? 'รีวิวลูกค้า' : 'Customer Reviews', href: '/seller/reviews', icon: 'star' as const },
    // notification-master-config v1 §0.4 root cause #4: this used to link to the buyer
    // route `/notifications`, which threw the seller out of the seller layout.
    { label: this.translation.currentLang() === 'th' ? 'การแจ้งเตือน' : 'Notifications', href: '/seller/notifications', icon: 'bell' as const },
    { label: this.translation.t('seller.settings'), href: '/seller/settings', icon: 'gear' as const },
  ]);
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { AuthService } from '../../../core/services';

@Component({
  selector: 'app-seller-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LogoComponent,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seller-layout.component.html',
  styleUrl: './seller-layout.component.scss',
})
export class SellerLayoutComponent {
  readonly auth = inject(AuthService);

  readonly navItems = [
    { label: 'ภาพรวม', href: '/seller', icon: 'dashboard' as const, exact: true },
    { label: 'เอกสารของฉัน', href: '/seller/documents', icon: 'doc' as const, badge: '8' },
    { label: 'อัปโหลดเอกสาร', href: '/seller/upload', icon: 'upload' as const },
    { label: 'AI Assistant', href: '/seller/ai', icon: 'sparkle' as const },
    { label: 'รายได้ & Payout', href: '/seller/earnings', icon: 'wallet' as const },
    { label: 'รีวิวลูกค้า', href: '/seller/reviews', icon: 'star' as const },
    { label: 'ตั้งค่าร้าน', href: '/seller/settings', icon: 'gear' as const },
  ];
}

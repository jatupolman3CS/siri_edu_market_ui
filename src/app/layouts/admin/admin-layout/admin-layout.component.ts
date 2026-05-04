import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    IconComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  readonly navItems = [
    { label: 'ภาพรวม', href: '/admin', icon: 'dashboard' as const, exact: true },
    { label: 'อนุมัติเอกสาร', href: '/admin/approval', icon: 'shield' as const, badge: '4' },
    { label: 'ธุรกรรม', href: '/admin/transactions', icon: 'wallet' as const },
    { label: 'ผู้ขาย', href: '/admin/sellers', icon: 'user' as const },
    { label: 'หมวดหมู่', href: '/admin/categories', icon: 'tag' as const },
    { label: 'ตั้งค่าแพลตฟอร์ม', href: '/admin/settings', icon: 'gear' as const },
  ];
}

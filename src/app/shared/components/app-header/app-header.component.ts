import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import {
  CartService,
  AuthService,
  WishlistService,
} from '../../../core/services';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LogoComponent } from '../logo/logo.component';
import { IconComponent } from '../icon/icon.component';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-header.component.html',
  styleUrl: './app-header.component.scss',
})
export class AppHeaderComponent {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly wishlist = inject(WishlistService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly query = signal<string>('');

  readonly navItems = [
    { label: 'หน้าแรก', href: '/', exact: true },
    { label: 'ตลาด', href: '/marketplace' },
    { label: 'หมวดหมู่', href: '/categories' },
    { label: 'แพ็กเกจ', href: '/bundles' },
    { label: 'ฟรี', href: '/free' },
    { label: 'Siri Studio', href: '/seller' },
  ];

  firstName(full: string): string {
    return full.split(' ')[0];
  }

  search(): void {
    if (this.query().trim()) {
      this.router.navigate(['/marketplace'], {
        queryParams: { q: this.query() },
      });
    }
  }

  go(path: string): void {
    this.router.navigate([path]);
  }

  signOut(): void {
    this.auth.signOut();
    this.message.info('ออกจากระบบเรียบร้อย — แล้วเจอกันใหม่ 👋');
    this.router.navigate(['/']);
  }
}

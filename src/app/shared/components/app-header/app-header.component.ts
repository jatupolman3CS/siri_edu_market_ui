import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import {
  CartService,
  AuthService,
  WishlistService,
  MeService,
} from '../../../core/services';
import { NzMessageService } from 'ng-zorro-antd/message';
import { LogoComponent } from '../logo/logo.component';
import { IconComponent } from '../icon/icon.component';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { defaultAvatarUrl } from '../../../core/brand-assets';

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
  private readonly me = inject(MeService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly query = signal<string>('');

  /** Avatar URL resolved from R2 via MeService — falls back to session avatar or placeholder. */
  readonly avatarSrc = computed(() => {
    const r2Url = resolvePublicUrl(this.me.profile()?.avatarUrl);
    if (r2Url) return r2Url;
    const sessionAvatar = this.auth.user()?.avatar;
    if (sessionAvatar) return sessionAvatar;
    return defaultAvatarUrl();
  });

  constructor() {
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        const q = this.router.parseUrl(this.router.url).queryParams['q'];
        this.query.set(typeof q === 'string' ? q : '');
      });

    // Load real profile (with R2 avatarUrl) whenever the user is authenticated
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.me.loadProfile().subscribe({ error: () => { /* silent */ } });
      }
    });
  }

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
    const q = this.query().trim();
    this.router.navigate(['/marketplace'], {
      queryParams: { q: q || null },
      queryParamsHandling: 'merge',
    });
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

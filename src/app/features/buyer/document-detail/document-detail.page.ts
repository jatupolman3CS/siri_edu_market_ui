import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  AuthService,
  BundleService,
  CartService,
  CatalogService,
  FollowService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';
import {
  GRADE_LEVEL_LABELS,
  RESOURCE_TYPE_ICONS,
  RESOURCE_TYPE_LABELS,
} from '../../../core/models';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-buyer-document-detail',
  standalone: true,
  imports: [
    RouterLink,
    NzTabsModule,
    DocumentCardComponent,
    BundleCardComponent,
    RatingStarsComponent,
    IconComponent,
    EmptyStateComponent,
    ThbPipe,
    CompactPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-detail.page.html',
  styleUrl: './document-detail.page.scss',
})
export class BuyerDocumentDetailPage {
  readonly catalog = inject(CatalogService);
  readonly cart = inject(CartService);
  readonly wishlist = inject(WishlistService);
  readonly follow = inject(FollowService);
  private readonly auth = inject(AuthService);
  private readonly bundles = inject(BundleService);
  private readonly recent = inject(RecentlyViewedService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly id = signal<string>('');
  readonly selectedImage = signal<number>(0);

  readonly doc = computed(() => this.catalog.getById(this.id()));
  readonly related = computed(() => this.catalog.getRelated(this.id(), 4));

  readonly relatedBundles = computed(() =>
    this.bundles.getRelatedBundles(this.id()),
  );

  readonly moreFromSeller = computed(() => {
    const d = this.doc();
    if (!d) return [];
    return this.catalog
      .documents()
      .filter((x) => x.seller.id === d.seller.id && x.id !== d.id)
      .slice(0, 4);
  });

  readonly ratingBreakdown = computed(() => {
    const d = this.doc();
    if (!d) return [];
    const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    d.reviews.forEach((r) => (dist[r.rating] = (dist[r.rating] ?? 0) + 1));
    const total = d.reviews.length || 1;
    return [5, 4, 3, 2, 1].map((score) => ({
      score,
      percent: Math.round(((dist[score] ?? 0) / total) * 100),
    }));
  });

  isFollowing(): boolean {
    return this.follow.isFollowing(this.doc()?.seller.id ?? '');
  }

  resourceLabel(t: string): string {
    return RESOURCE_TYPE_LABELS[t as keyof typeof RESOURCE_TYPE_LABELS] ?? t;
  }
  resourceIcon(t: string): string {
    return RESOURCE_TYPE_ICONS[t as keyof typeof RESOURCE_TYPE_ICONS] ?? '📄';
  }
  gradeLabels(grades: readonly string[]): string {
    return grades
      .map((g) => GRADE_LEVEL_LABELS[g as keyof typeof GRADE_LEVEL_LABELS] ?? g)
      .join(', ');
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.id.set(params.get('id') ?? '');
      this.selectedImage.set(0);
    });
    // Track recently viewed
    effect(() => {
      const d = this.doc();
      if (d) this.recent.push(d);
    });
  }

  buyNow(id: string): void {
    if (!this.cart.has(id)) {
      const d = this.catalog.getById(id);
      if (d) this.cart.add(d);
    }
    if (!this.auth.isAuthenticated()) {
      this.message.warning('กรุณาเข้าสู่ระบบก่อนทำการชำระเงิน');
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: '/checkout' },
      });
      return;
    }
    this.router.navigate(['/checkout']);
  }

  downloadFree(): void {
    if (!this.auth.isAuthenticated()) {
      this.message.warning('กรุณาเข้าสู่ระบบเพื่อดาวน์โหลดและบันทึกในคลังของคุณ');
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    const d = this.doc();
    if (d) {
      this.message.success('ดาวน์โหลดเรียบร้อย — บันทึกในคลังของคุณแล้ว 🎁');
    }
  }
}

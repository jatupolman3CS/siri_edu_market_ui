import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  AuthService,
  BundleService,
  CatalogService,
  FollowService,
  SeoMetaService,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe, TranslationService } from '../../../core/i18n';

@Component({
  selector: 'app-buyer-storefront',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    BundleCardComponent,
    IconComponent,
    EmptyStateComponent,
    CompactPipe,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './storefront.page.html',
  styleUrl: './storefront.page.scss',
})
export class BuyerStorefrontPage {
  /** Template helpers: both banner and avatar are streamed from R2 through the API. */
  readonly resolvePublicUrl = resolvePublicUrl;
  readonly resolveAvatarUrl = resolveAvatarUrl;

  readonly catalog = inject(CatalogService);
  private readonly bundleService = inject(BundleService);
  readonly follow = inject(FollowService);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);
  private readonly seo = inject(SeoMetaService);
  private readonly i18n = inject(TranslationService);

  readonly sellerId = signal<string>('');
  readonly tab = signal<'all' | 'bundles' | 'free' | 'top'>('all');

  readonly isOwner = computed(() => {
    const currentUserId = this.auth.user()?.id;
    return Boolean(currentUserId && currentUserId === this.sellerId());
  });

  readonly seller = this.catalog.sellerProfile;
  // Both requests are fired together, so gate the page on both and the tab counts
  // never render against a half-loaded store.
  readonly sellerLoading = computed(
    () =>
      this.catalog.sellerProfileState().status === 'loading' ||
      this.catalog.sellerDocumentsState().status === 'loading',
  );

  // Server-scoped to this seller. The shared catalog cache only ever holds the
  // home/marketplace slice, so filtering it showed an empty store on a deep link.
  readonly sellerDocs = this.catalog.sellerDocuments;

  readonly sellerBundles = computed(() =>
    this.bundleService.getBySellerId(this.sellerId()),
  );

  readonly sellerFree = computed(() =>
    this.sellerDocs().filter((d) => d.isFree),
  );

  readonly sellerTop = computed(() =>
    [...this.sellerDocs()]
      .filter((d) => !d.isFree)
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, 12),
  );

  /**
   * seller-pricing-and-storefront-stats v1 §3.3/§4: 6-month units-sold bar chart, below the
   * profile stats strip. All-zero (or not-yet-loaded) `salesByMonth` makes
   * `totalUnitsSoldInWindow()` compute to `0`, which is what hides the whole section (AC-15) —
   * the exact same "empty array ⇒ hidden" pattern as the pricing hint box.
   */
  readonly salesByMonth = this.catalog.sellerSalesByMonth;
  readonly totalUnitsSoldInWindow = computed(() =>
    this.salesByMonth().reduce((sum, m) => sum + m.unitsSold, 0),
  );
  /** Floor `1` guards divide-by-zero in the bar-height calc — same idiom as `maxMonth()` in `dashboard.page.ts`. */
  readonly maxUnitsSold = computed(() =>
    Math.max(...this.salesByMonth().map((m) => m.unitsSold), 1),
  );

  readonly tabs = computed(() => [
    { value: 'all' as const, label: this.i18n.t('storefront.tabAll'), count: this.sellerDocs().length },
    { value: 'bundles' as const, label: this.i18n.t('storefront.tabBundles'), count: this.sellerBundles().length },
    { value: 'free' as const, label: this.i18n.t('storefront.tabFree'), count: this.sellerFree().length },
    { value: 'top' as const, label: this.i18n.t('storefront.tabTop'), count: null },
  ]);

  isFollowing(): boolean {
    return this.follow.isFollowing(this.sellerId());
  }

  joinedYear(): string {
    const s = this.seller();
    return s?.joinedAt ? new Date(s.joinedAt).getFullYear() + '' : '';
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id') ?? '';
      this.sellerId.set(id);
      void (async () => {
        const profile = await this.catalog.loadSellerProfile(id);
        if (profile && typeof profile.isFollowing === 'boolean') {
          this.follow.setFollowing(id, profile.isFollowing);
        } else {
          void this.follow.hydrateFromApi(id);
        }
        // seo-ssr v1 §4.1/DEC-2/DEC-9: dynamic title/meta/canonical/JSON-LD (ProfilePage wrapping
        // Organization, no aggregateRating) — re-runs on every route param change (store A → store
        // B), so nothing stale from the previous seller lingers (AC-17 equivalent for `/store/:id`).
        if (profile) {
          this.seo.setStoreSeo({
            studioName: profile.studioName ?? '',
            bio: profile.bio ?? '',
            canonicalUrl: this.seo.canonicalUrl(`/store/${id}`),
            avatarImageUrl: this.resolveAvatarUrl(profile.avatarUrl),
            bannerImageUrl: profile.bannerUrl ? this.resolvePublicUrl(profile.bannerUrl) : '',
          });
        }
      })();
      this.catalog.loadSellerDocuments(id);
    });
  }

  async toggleFollow(): Promise<void> {
    const seller = this.seller();
    if (!seller) return;

    if (!this.auth.isAuthenticated()) {
      this.message.warning(this.i18n.t('storefront.loginToFollow'));
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    if (this.isOwner()) {
      this.message.info(this.i18n.t('storefront.cannotFollowSelf'));
      return;
    }

    const sellerId = this.sellerId();
    const wasFollowing = this.follow.isFollowing(sellerId);
    const isNowFollowing = await this.follow.toggle(sellerId);
    if (wasFollowing !== isNowFollowing) {
      this.catalog.updateSellerFollowerCount(isNowFollowing ? 1 : -1, sellerId);
      if (isNowFollowing) {
        this.message.success(this.i18n.t('storefront.followSuccess', { name: seller.studioName ?? '' }));
      } else {
        this.message.info(this.i18n.t('storefront.unfollowSuccess', { name: seller.studioName ?? '' }));
      }
    }
  }
}

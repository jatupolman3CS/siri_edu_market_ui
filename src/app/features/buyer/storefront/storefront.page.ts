import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  BundleService,
  CatalogService,
  FollowService,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { resolveAvatarUrl } from '../../../core/brand-assets';

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
  private readonly route = inject(ActivatedRoute);
  private readonly message = inject(NzMessageService);

  readonly sellerId = signal<string>('');
  readonly tab = signal<'all' | 'bundles' | 'free' | 'top'>('all');

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

  readonly tabs = computed(() => [
    { value: 'all' as const, label: 'ทั้งหมด', count: this.sellerDocs().length },
    { value: 'bundles' as const, label: 'แพ็กเกจ', count: this.sellerBundles().length },
    { value: 'free' as const, label: 'ฟรี', count: this.sellerFree().length },
    { value: 'top' as const, label: 'ขายดี', count: null },
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
      void this.catalog.loadSellerProfile(id);
      this.catalog.loadSellerDocuments(id);
      void this.follow.hydrateFromApi(id);
    });
  }

  toggleFollow(): void {
    const now = this.follow.toggle(this.sellerId());
    if (now) {
      this.message.success(`เริ่มติดตาม ${this.seller()?.studioName} แล้ว 💗`);
    } else {
      this.message.info(`เลิกติดตาม ${this.seller()?.studioName}`);
    }
  }
}

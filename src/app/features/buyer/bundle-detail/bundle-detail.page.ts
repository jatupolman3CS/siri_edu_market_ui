import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  BundleService,
  CartService,
  calcBundleSaveAmount,
  calcBundleSavePercent,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n';

@Component({
  selector: 'app-buyer-bundle-detail',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    IconComponent,
    EmptyStateComponent,
    ThbPipe,
    CompactPipe,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundle-detail.page.html',
  styleUrl: './bundle-detail.page.scss',
})
export class BuyerBundleDetailPage {
  private readonly bundleService = inject(BundleService);
  private readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);

  readonly id = signal<string>('');

  readonly bundle = computed(() => this.bundleService.getById(this.id()));

  /**
   * Q-04: reads straight from `BundleService`'s full-detail cache (populated by
   * `loadBundleDetail()` below) instead of resolving `bundle().documentIds` through
   * `CatalogService.getById` — the paged bundle/catalog caches this page used to rely on don't
   * reliably already contain a given bundle's member documents, which is why this section
   * rendered "0 เอกสารในแพ็กเกจ" for every bundle.
   */
  readonly items = computed(() => this.bundleService.getDocuments(this.id()));

  /**
   * Q-07 item 3 (same bug, different file — found while already in this component for Q-04):
   * delegates to the shared clamped helpers instead of raw `originalPrice - price`, so an
   * inconsistent bundle (`price > originalPrice`) can't render a negative "ประหยัด -฿350".
   */
  savings(): number {
    const b = this.bundle();
    return b ? calcBundleSaveAmount(b.price, b.originalPrice) : 0;
  }
  savingsPercent(): number {
    const b = this.bundle();
    return b ? calcBundleSavePercent(b.price, b.originalPrice) : 0;
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      const id = p.get('id') ?? '';
      this.id.set(id);
      if (id) this.bundleService.loadBundleDetail(id);
    });
  }

  /**
   * BUG-03: adds the bundle as a bundle. Pushing each document in separately charged the
   * full listed price and silently dropped the advertised bundle discount.
   */
  async addAllToCart(): Promise<void> {
    const bundleId = this.id();
    if (!bundleId) return;
    await this.cart.addBundle(bundleId);
  }
}

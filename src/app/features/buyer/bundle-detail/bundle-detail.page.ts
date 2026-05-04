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
  CatalogService,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundle-detail.page.html',
  styleUrl: './bundle-detail.page.scss',
})
export class BuyerBundleDetailPage {
  private readonly bundleService = inject(BundleService);
  private readonly catalog = inject(CatalogService);
  private readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);

  readonly id = signal<string>('');

  readonly bundle = computed(() => this.bundleService.getById(this.id()));

  readonly items = computed(() => {
    const b = this.bundle();
    if (!b) return [];
    return b.documentIds
      .map((id) => this.catalog.getById(id))
      .filter((d): d is NonNullable<typeof d> => !!d);
  });

  savings(): number {
    const b = this.bundle();
    return b ? b.originalPrice - b.price : 0;
  }
  savingsPercent(): number {
    const b = this.bundle();
    if (!b || b.originalPrice === 0) return 0;
    return Math.round(((b.originalPrice - b.price) / b.originalPrice) * 100);
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((p) => {
      this.id.set(p.get('id') ?? '');
    });
  }

  addAllToCart(): void {
    this.items().forEach((d) => {
      if (!this.cart.has(d.id)) this.cart.add(d);
    });
  }
}

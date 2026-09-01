import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  BundleService,
  CatalogService,
  PlatformStatsService,
  RecentlyViewedService,
  calcBundleSavePercent,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { SectionHeaderComponent } from '../../../shared/components/section-header/section-header.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-buyer-home',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    BundleCardComponent,
    SectionHeaderComponent,
    IconComponent,
    CompactPipe,
    DecimalPipe,
    EmptyStateComponent,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class BuyerHomePage {
  readonly catalog = inject(CatalogService);
  readonly bundles = inject(BundleService);
  readonly recent = inject(RecentlyViewedService);
  readonly platformStats = inject(PlatformStatsService);
  private readonly router = inject(Router);
  private readonly compactPipe = new CompactPipe();

  // ===== real-data-stats v1 §4.2 =====

  /**
   * "กว่า N เอกสารใน M หมวดหมู่หลัก แตกย่อยเป็น K หมวดย่อย" — `totalDocs`/`mainCount` are derived
   * from `catalog.categories()`, already loaded for this page. `subCount` sums the new
   * `subcategoryCount` field (§3.1); the sub-category clause is only appended once at least one
   * category actually reports it (`categoriesSubCountKnown`) — otherwise a fleet of `undefined`s
   * would silently sum to `0` and render the misleading "แตกย่อยเป็น 0 หมวดย่อย".
   */
  readonly categoriesTotalDocs = computed(() =>
    this.catalog.categories().reduce((sum, c) => sum + c.documentCount, 0),
  );
  readonly categoriesMainCount = computed(() => this.catalog.categories().length);
  readonly categoriesSubCount = computed(() =>
    this.catalog.categories().reduce((sum, c) => sum + (c.subcategoryCount ?? 0), 0),
  );
  readonly categoriesSubCountKnown = computed(() =>
    this.catalog.categories().some((c) => c.subcategoryCount !== undefined),
  );
  readonly categoriesSubtitle = computed(() => {
    const mainCount = this.categoriesMainCount();
    if (mainCount === 0) return '';
    const totalDocsText = this.compactPipe.transform(this.categoriesTotalDocs());
    const base = `กว่า ${totalDocsText} เอกสารใน ${mainCount} หมวดหมู่หลัก`;
    if (!this.categoriesSubCountKnown()) return base;
    return `${base} แตกย่อยเป็น ${this.categoriesSubCount()} หมวดย่อย`;
  });

  /**
   * "ประหยัดได้สูงสุด N%" (bundles strip subtitle) — Group A: computed from the bundles actually
   * rendered in this section (`bundles.featured()`), reusing the shared `calcBundleSavePercent`
   * helper instead of a second formula. When nothing in that set has a real discount, the whole
   * phrase is dropped rather than showing "0%".
   */
  readonly maxBundleSavePercent = computed(() => {
    const percents = this.bundles
      .featured()
      .map((b) => calcBundleSavePercent(b.price, b.originalPrice));
    return percents.length ? Math.max(0, ...percents) : 0;
  });
  readonly bundlesSubtitle = computed(() => {
    const base = 'ครีเอเตอร์รวมเอกสารที่เข้ากันให้แล้ว';
    const max = this.maxBundleSavePercent();
    return max > 0 ? `${base} ประหยัดได้สูงสุด ${max}%` : base;
  });

  /** ส่วนแบ่งเริ่มต้นของผู้ขาย (Seller CTA copy) — fallback 90 while stats() hasn't loaded, same
   *  "avoid a flash to a wrong number" reasoning as `SellerUploadPage.fee` (§4.6). */
  readonly sellerSharePercent = computed(
    () => 100 - (this.platformStats.stats()?.feeRatePercent ?? 10),
  );

  readonly quickSearches = [
    'สรุปคณิตม.ปลาย',
    'Pitch Deck',
    'TOEIC',
    'Resume',
    'งานวิจัย',
  ];

  readonly howItWorks = [
    {
      no: '1',
      emoji: '🔍',
      title: 'ค้นหาเอกสารที่ใช่',
      desc: 'กรองหมวดหมู่ ระดับชั้น และคะแนนรีวิว เลือกเอกสารที่ตรงกับความต้องการของคุณ พร้อมพรีวิวก่อนซื้อ',
    },
    {
      no: '2',
      emoji: '💳',
      title: 'ชำระอย่างปลอดภัย',
      desc: 'ชำระผ่าน PromptPay / บัตรเครดิต ไฟล์มีลายน้ำเฉพาะคุณ ดาวน์โหลดได้ทันทีหลังชำระเงิน',
    },
    {
      no: '3',
      emoji: '📚',
      title: 'เก็บไว้ในคลังของคุณ',
      desc: 'ดาวน์โหลดได้ตลอดเวลาในคลังเอกสารส่วนตัว และให้คะแนน + รีวิวเพื่อช่วยผู้ซื้อท่านอื่น',
    },
  ];

  constructor() {
    // Explicit init to avoid root service auto-fetching on unrelated pages.
    this.catalog.initForHome();
    // Ensure free section has fresh data (and visible loading/error state).
    this.catalog.loadFreeResources();
    // real-data-stats v1 §4.2: no-op if another page already loaded this (cached in the service).
    this.platformStats.loadStats();
  }

  get featuredSellers() {
    return this.catalog
      .documents()
      .map((d) => d.seller)
      .filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx)
      .slice(0, 6);
  }

  goSearch(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem('q') as HTMLInputElement;
    this.router.navigate(['/marketplace'], {
      queryParams: input.value ? { q: input.value } : {},
    });
  }
}

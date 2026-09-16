import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import {
  AuthService,
  BundleService,
  CatalogService,
  DiscoveryService,
  ExamCountdownService,
  PlatformStatsService,
  RecentlyViewedService,
  calcBundleSavePercent,
  daysRemainingFromExamDate,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { SectionHeaderComponent } from '../../../shared/components/section-header/section-header.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { ExamCountdownFormComponent } from '../../../shared/components/exam-countdown-form/exam-countdown-form.component';
import { PopularSearchChipsComponent } from '../../../shared/components/popular-search-chips/popular-search-chips.component';
import { DiscoveryRailComponent } from '../../../shared/components/discovery-rail/discovery-rail.component';
import { TranslatePipe } from '../../../core/i18n';
import type { RecommendationExplanation, RecommendationStrategy } from '../../../core/models';

/** crm-driven-discovery v1 §3.3/§4.3: strategy → section title map (ห้าม hardcode subtitle ฝั่ง UI อีก — subtitle มาจาก `strategyReason` ของ backend เท่านั้น). */
const RECOMMENDED_STRATEGY_TITLES: Record<RecommendationStrategy, string> = {
  'crm-personalized': 'เลือกมาให้คุณโดยเฉพาะ',
  'purchase-history': 'ต่อยอดจากเอกสารที่คุณเคยซื้อ',
  'declared-interest': 'จากหมวดที่คุณเลือกไว้',
  'popular-fallback': 'ยอดนิยมตอนนี้',
};

/** crm-driven-discovery v1 §4.3: "ระหว่างโหลด...นานสุด 3 วินาที จากนั้นถ้ายังไม่มีข้อมูลให้ซ่อนบล็อก". */
const DISCOVERY_SKELETON_TIMEOUT_MS = 3000;

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
    ExamCountdownFormComponent,
    PopularSearchChipsComponent,
    DiscoveryRailComponent,
    TranslatePipe,
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
  readonly auth = inject(AuthService);
  readonly examCountdown = inject(ExamCountdownService);
  readonly discovery = inject(DiscoveryService);
  private readonly router = inject(Router);
  private readonly compactPipe = new CompactPipe();
  private readonly destroyRef = inject(DestroyRef);

  // ===== exam-countdown-mode v1 §4 =====

  /** Toggles the inline `<app-exam-countdown-form>` open on this page (§4 — mechanism left to the implementer). */
  readonly examCountdownFormOpen = signal(false);

  readonly examDaysRemaining = computed(() => {
    const s = this.examCountdown.setting();
    return s ? daysRemainingFromExamDate(s.examDate) : null;
  });
  readonly examIsPast = computed(() => (this.examDaysRemaining() ?? 0) < 0);
  /** true = แสดง banner นับถอยหลัง + grid เต็มรูปแบบ (AC-16). */
  readonly examCountdownActive = computed(() => {
    const s = this.examCountdown.setting();
    return Boolean(s?.isEnabled && !this.examIsPast());
  });

  openExamCountdownEdit(): void {
    this.examCountdownFormOpen.set(true);
  }

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

  // ===== crm-driven-discovery v1 §3.3/§4.3 (supersedes personalized-recommendations v1 §4) =====

  /** หัวข้อของ section "แนะนำสำหรับคุณ" — เปลี่ยนตาม `strategy` ที่ backend เลือก (§4.3 table). */
  readonly recommendedTitle = computed(
    () => RECOMMENDED_STRATEGY_TITLES[this.catalog.recommendedStrategy() ?? 'popular-fallback'],
  );

  /** ใต้การ์ดแต่ละใบ: บรรทัดเหตุผลรายชิ้น — `undefined` เมื่อไม่มี explanation ของเอกสารนั้น (ต้องทนกรณีหาไม่เจอ, §3.3). */
  recommendedExplanationFor(documentId: string): RecommendationExplanation | undefined {
    return this.catalog.recommendedExplanations().get(documentId);
  }

  // ===== crm-driven-discovery v1 §3.2/§4.3 — moved here from marketplace.page.ts by
  // marketplace-home-redesign v2 §1 ข้อ 8 / §4.3 ("CRM discovery block — ย้ายมาจาก marketplace").
  // Same state shape, same 3-second skeleton cap, same `discovery.loadDiscovery()` call — only the
  // page that owns it changed. `DiscoveryService` is a root-singleton cached 5 นาที (§0), so
  // moving the call site here does not cause an extra/duplicate fetch when navigating between
  // home ↔ marketplace within that window. =====

  private readonly discoveryTimedOut = signal(false);
  private discoveryTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  readonly showDiscoverySkeleton = computed(
    () => this.discovery.discoveryState().status === 'loading' && !this.discoveryTimedOut(),
  );

  /** §4.3: "เมื่อ sections.length === 0 && popularTerms.length === 0 → ไม่ render บล็อกเลย". */
  readonly showDiscoveryBlock = computed(() => {
    const d = this.discovery.discovery();
    if (!d) return false;
    return d.sections.length > 0 || d.popularTerms.length > 0;
  });

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
    // personalized-recommendations v1 §4: home-page "แนะนำสำหรับคุณ" module — called once here,
    // not from any computed/effect (AC-14).
    this.catalog.loadRecommended();
    // crm-driven-discovery v1 §3.1/§4.2/§4.3: "ฮิตตอนนี้:" chips — anonymous-safe, cached 5 นาที
    // ฝั่ง service เอง (สลับหน้า home ↔ marketplace ไม่ยิงซ้ำ).
    void this.discovery.loadPopularTerms();
    // marketplace-home-redesign v2 §4.3 (moved from marketplace.page.ts): "ยังไม่ได้ค้นหาอะไรเลย"
    // block — cheap to call unconditionally, cached 5 นาทีฝั่ง service (§0).
    void this.discovery.loadDiscovery();
    // real-data-stats v1 §4.2: no-op if another page already loaded this (cached in the service).
    this.platformStats.loadStats();
    // exam-countdown-mode v1 §0 ข้อ 11 / AC-14: guard ด้วย isAuthenticated() เสมอ — หน้าแรกเป็น
    // public route ผู้เยี่ยมชมที่ไม่ล็อกอินต้องไม่ได้รับ 401 จาก GET /api/me/exam-countdown.
    if (this.auth.isAuthenticated()) {
      this.examCountdown.loadSetting();
    }

    // Ensure featured sellers' follower count & stats are enriched from profiles
    effect(() => {
      const docs = this.catalog.documents();
      if (docs.length > 0) {
        this.catalog.loadSellerProfilesForDocuments?.(docs);
      }
    });

    // marketplace-home-redesign v2 §4.3 (moved from marketplace.page.ts): §4.3 3-second skeleton
    // cap — starts a timer whenever the fetch is loading, clears it as soon as it settles either way.
    effect(() => {
      const status = this.discovery.discoveryState().status;
      if (this.discoveryTimeoutHandle != null) {
        clearTimeout(this.discoveryTimeoutHandle);
        this.discoveryTimeoutHandle = null;
      }
      if (status === 'loading') {
        this.discoveryTimedOut.set(false);
        this.discoveryTimeoutHandle = setTimeout(() => this.discoveryTimedOut.set(true), DISCOVERY_SKELETON_TIMEOUT_MS);
      } else {
        this.discoveryTimedOut.set(false);
      }
    });

    this.destroyRef.onDestroy(() => {
      if (this.discoveryTimeoutHandle != null) clearTimeout(this.discoveryTimeoutHandle);
    });
  }

  readonly featuredSellers = computed(() => {
    const rawSellers = this.catalog
      .documents()
      .map((d) => d.seller)
      .filter((s, idx, arr) => s.id && arr.findIndex((x) => x.id === s.id) === idx)
      .slice(0, 6);

    const profiles = this.catalog.sellerProfiles?.();
    if (!profiles) return rawSellers;
    return rawSellers.map((s) => profiles.get(s.id) ?? s);
  });

  goSearch(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem('q') as HTMLInputElement;
    this.router.navigate(['/marketplace'], {
      queryParams: input.value.trim() ? { q: input.value.trim() } : {},
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  AdsService,
  AuthService,
  BundleService,
  CartService,
  CatalogService,
  FollowService,
  LibraryService,
  NavigationSourceService,
  RecentlyViewedService,
  SeoMetaService,
  WishlistService,
  calcBundleSaveAmount,
  calcBundleSavePercent,
  PreviewPdfError,
  idleActionState,
  loadingActionState,
  type ActionState,
} from '../../../core/services';

import {
  GRADE_LEVEL_LABELS,
  RESOURCE_TYPE_ICONS,
  RESOURCE_TYPE_LABELS,
  type Bundle,
  type BoughtTogetherItem,
  type DocumentItem,
} from '../../../core/models';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { ReportDocumentComponent } from '../../../shared/components/report-document/report-document.component';

import type { MarketplaceDocumentPreviewResponse } from '../../../core/api/types.gen';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

@Component({
  selector: 'app-buyer-document-detail',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NzTabsModule,
    DatePipe,
    DocumentCardComponent,
    RatingStarsComponent,
    IconComponent,
    EmptyStateComponent,
    ReportDocumentComponent,
    ThbPipe,
    CompactPipe,
    TimeAgoPipe,
    ImgFallbackDirective,
    TranslatePipe,
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
  readonly library = inject(LibraryService);
  readonly translation = inject(TranslationService);
  private readonly auth = inject(AuthService);
  private readonly bundles = inject(BundleService);
  private readonly recent = inject(RecentlyViewedService);
  private readonly navSource = inject(NavigationSourceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly seo = inject(SeoMetaService);
  private readonly ads = inject(AdsService);

  private readonly sanitizer = inject(DomSanitizer);

  readonly id = signal<string>('');
  readonly sponsoredDocs = signal<DocumentItem[]>([]);
  readonly selectedImage = signal<number>(0);
  readonly preview = signal<MarketplaceDocumentPreviewResponse | null>(null);
  readonly previewLoading = signal<boolean>(false);
  readonly showPreviewGallery = signal<boolean>(false);
  readonly showPdfPreviewModal = signal<boolean>(false);
  readonly previewPdfUrl = signal<SafeResourceUrl | null>(null);
  readonly previewPdfLoading = signal<boolean>(false);
  private readonly _previewPdfBlobUrl = signal<string | null>(null);

  readonly doc = computed(() => this.catalog.getById(this.id()));

  /**
   * Q-05: `DocumentItem.discountPercent` (set by `mapDocument`/`mapDocumentDetail`) is always
   * `undefined` — the API response never carries it, only `price`/`originalPrice`. Reuses the
   * same `calcBundleSavePercent` helper `crossSellCards` below already uses for bundles so the
   * "ประหยัด N%" badges (cover pill + price card) get a real number instead of rendering blank.
   */
  readonly discountPercent = computed(() => {
    const d = this.doc();
    if (!d || !d.originalPrice) return 0;
    return calcBundleSavePercent(d.price, d.originalPrice);
  });

  /**
   * discount-urgency v1 §4/AC-9: active only when `discountExpiresAt` is set and still in the
   * future — same `new Date(iso).getTime() > Date.now()` convention as `announcementStatus()`
   * in `announcements-admin.page.ts`.
   */
  readonly discountCountdownActive = computed(() => {
    const d = this.doc();
    if (!d?.discountExpiresAt) return false;
    return new Date(d.discountExpiresAt).getTime() > Date.now();
  });

  /**
   * discount-urgency v1 §4/AC-10/AC-11: social-proof fallback — only when there is no active
   * countdown AND at least one sale this month. Not tied to having a discount at all (general
   * trust signal).
   */
  readonly showSoldThisMonth = computed(() => {
    const d = this.doc();
    return !this.discountCountdownActive() && (d?.soldThisMonthCount ?? 0) > 0;
  });

  readonly previewRasterUrls = computed(() => {
    const urls = this.preview()?.previewImageUrls ?? [];
    return urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  });
  readonly related = computed(() => this.catalog.getRelated(this.id(), 4));
  readonly owned = computed(() => {
    if (!this.auth.isAuthenticated()) return false;
    const id = this.id();
    if (!id) return false;
    return this.library.library().some((x) => x.document.id === id);
  });

  /**
   * subscription-membership v2 §4: third buy-button state — "ดาวน์โหลด (สิทธิ์สมาชิก)" — shown
   * only when the buyer has active subscription access AND does not already own the document
   * outright (owning always wins, same priority `owned()` already has over "buy").
   */
  readonly accessibleViaSubscription = computed(() => {
    const d = this.doc();
    return !!d?.isAccessibleViaActiveSubscription && !this.owned();
  });

  // ===== document-bundle-cross-sell v1 §4: "ในแพ็กเกจที่คุ้มกว่า" =====
  // Loaded non-blocking per document — a failure here (or the stub round returning `[]`)
  // must never stop the rest of the page from rendering, so the section just hides itself.
  readonly crossSellBundles = signal<Bundle[]>([]);
  readonly crossSellState = signal<ActionState>(idleActionState());

  readonly crossSellLoading = computed(() => this.crossSellState().status === 'loading');

  readonly crossSellCards = computed(() =>
    this.crossSellBundles().map((bundle) => ({
      bundle,
      savePercent: calcBundleSavePercent(bundle.price, bundle.originalPrice),
      saveAmount: calcBundleSaveAmount(bundle.price, bundle.originalPrice),
    })),
  );

  readonly showCrossSell = computed(
    () => this.crossSellLoading() || this.crossSellCards().length > 0,
  );

  // ===== ml-embedding-recommendations v1 §4.3: "มักซื้อคู่กับเอกสารนี้" =====
  // Same non-blocking contract as cross-sell above: a failed/empty result just hides the
  // section — no empty state, no error banner (§4.3/AC-23).
  readonly boughtTogether = signal<BoughtTogetherItem[]>([]);
  readonly boughtTogetherState = signal<ActionState>(idleActionState());
  readonly boughtTogetherLoading = computed(
    () => this.boughtTogetherState().status === 'loading',
  );

  /**
   * real-data-stats v1 §4.5 (Group A — no backend needed): "สรุป N ข้อโดย AI" reads
   * `d.aiSummary.length` instead of a hardcoded "3", and the whole tab is hidden when there is
   * nothing to summarize (empty/absent array) instead of showing an empty list under the title.
   */
  readonly aiSummaryCount = computed(() => this.doc()?.aiSummary?.length ?? 0);
  readonly showAiSummary = computed(() => this.aiSummaryCount() > 0);

  // ===== document-faq-tab v1 §4: "คำถามที่พบบ่อย (FAQ)" tab =====
  // Badge counts read `faqCount`/`qnaCount` from the mapped document, never `array.length`,
  // so the numbers stay correct if the backend ever truncates the qna array (per spec).
  readonly faqCount = computed(() => this.doc()?.faqCount ?? 0);
  readonly qnaCount = computed(() => this.doc()?.qnaCount ?? 0);
  readonly showFaqTab = computed(() => this.faqCount() > 0);

  /**
   * FAQ = qna items the seller pinned (`isFaq`), sorted by `faqSortOrder` ascending, tie-broken
   * by `answeredAt` oldest-first. Sorting/filtering happens here (not in the template) per spec.
   */
  readonly faqItems = computed(() => {
    const items = (this.doc()?.qna ?? []).filter((q) => q.isFaq);
    return [...items].sort((a, b) => {
      const orderDiff = (a.faqSortOrder ?? 0) - (b.faqSortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.answer?.answeredAt ?? '').localeCompare(b.answer?.answeredAt ?? '');
    });
  });

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

  readonly isOwner = computed(() => {
    const user = this.auth.user?.();
    const doc = this.doc();
    return !!(user?.id && doc?.seller?.id && user.id === doc.seller.id);
  });

  isFollowing(): boolean {
    return this.follow.isFollowing(this.doc()?.seller.id ?? '');
  }

  async toggleFollow(): Promise<void> {
    const d = this.doc();
    if (!d?.seller?.id) return;

    if (!this.auth.isAuthenticated()) {
      this.message.warning(this.translation.t('product.loginToFollow'));
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    if (this.isOwner()) {
      this.message.info(this.translation.t('product.cannotFollowOwn'));
      return;
    }

    const sellerId = d.seller.id;
    const wasFollowing = this.follow.isFollowing(sellerId);
    const isNowFollowing = await this.follow.toggle(sellerId);
    if (wasFollowing !== isNowFollowing) {
      this.catalog.updateSellerFollowerCount(isNowFollowing ? 1 : -1, sellerId);
      if (isNowFollowing) {
        this.message.success(this.translation.t('product.followSuccess', { name: d.seller.studioName }));
      } else {
        this.message.info(this.translation.t('product.unfollowSuccess', { name: d.seller.studioName }));
      }
    }
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

  previewImgSrc(pathOrUrl: string): string {
    return resolvePublicUrl(pathOrUrl);
  }

  closePreviewGallery(): void {
    this.showPreviewGallery.set(false);
  }

  closePdfPreviewModal(): void {
    const blobUrl = this._previewPdfBlobUrl();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    this._previewPdfBlobUrl.set(null);
    this.previewPdfUrl.set(null);
    this.showPdfPreviewModal.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseGallery(): void {
    if (this.showPreviewGallery()) this.closePreviewGallery();
    if (this.showPdfPreviewModal()) this.closePdfPreviewModal();
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.id.set(id);
      this.selectedImage.set(0);
      this.showPreviewGallery.set(false);
      this.preview.set(null);
      // seller-analytics-insights v1 §4 (AC-16/17/18/19): the full detail page (not quick-view,
      // not the preview sub-view) is the only mount point that counts as a "view" — classify the
      // traffic source right here, synchronously, before this navigation's own NavigationEnd
      // fires (see NavigationSourceService's class doc for why the timing matters).
      if (id) {
        this.catalog.loadDocumentDetail(id, this.navSource.classifyEntrySource());
        void this.catalog.loadDocumentPreview(id).then((data) => {
          if (this.id() === id) {
            this.preview.set(data);
          }
        }).catch(() => {
          // non-blocking background preview prefetch
        });
      }
      this.loadCrossSellBundles(id);
      this.loadBoughtTogether(id);
      this.loadSponsoredAds();
    });
    // Track recently viewed
    effect(() => {
      const d = this.doc();
      if (d) {
        this.recent.push(d);
        if (d.seller?.id) {
          void this.follow.hydrateFromApi?.(d.seller.id);
          void this.catalog.fetchSellerProfile?.(d.seller.id);
        }
      }
    });
    // seo-ssr v1 §4.1/DEC-2: dynamic title/meta/canonical/JSON-LD (Product +
    // additionalType: LearningResource) — re-runs on every new document (navigating from
    // document A to document B), so nothing stale from the previous document lingers (AC-17).
    effect(() => {
      const d = this.doc();
      if (!d) return;
      this.seo.setDocumentSeo({
        documentId: d.id,
        title: d.title,
        shortDescription: d.shortDescription,
        canonicalUrl: this.seo.canonicalUrl(`/document/${d.id}`),
        coverImageUrl: d.cover,
        galleryImageUrls: d.gallery,
        price: d.price,
        studioName: d.seller.studioName,
        resourceType: d.resourceType,
        language: d.language,
        reviewCount: d.reviewCount,
        averageRating: d.rating,
      });
    });
    // Best-effort: load library once for owned-check
    effect(() => {
      if (!this.auth.isAuthenticated()) return;
      const id = this.id();
      if (!id) return;
      void this.library.refreshLibraryOnce();
    });
    effect((onCleanup) => {
      if (typeof document === 'undefined') return;
      if (!this.showPreviewGallery() && !this.showPdfPreviewModal()) return;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = '';
      });
    });
  }

  buyNow(id: string): void {
    if (this.owned()) {
      this.message.info(this.translation.t('product.inLibrary'));
      this.router.navigate(['/library']);
      return;
    }
    if (!this.cart.has(id)) {
      const d = this.catalog.getById(id);
      if (d) this.cart.add(d);
    }
    if (!this.auth.isAuthenticated()) {
      this.message.warning(this.translation.t('product.loginToBuy'));
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: '/checkout' },
      });
      return;
    }
    this.router.navigate(['/checkout']);
  }

  downloadFree(): void {
    if (!this.auth.isAuthenticated()) {
      this.message.warning(this.translation.t('product.loginToDownload'));
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    const d = this.doc();
    if (d) {
      void this.downloadWithNotice(d.id);
    }
  }

  /**
   * subscription-membership v2 §3.8/§4: calls the SAME existing `POST /api/library/{id}/download`
   * endpoint `downloadFree()`/owned downloads already use — no new endpoint. Never creates a
   * `LIBRARY_ITEM` server-side, so this document deliberately keeps NOT appearing in `/library`
   * (§4's note that the library page must stay unchanged — subscription access is revocable).
   */
  downloadViaSubscription(): void {
    if (!this.auth.isAuthenticated()) {
      this.message.warning(this.translation.t('product.loginToDownload'));
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    const d = this.doc();
    if (d) {
      void this.downloadWithNotice(d.id);
    }
  }

  /**
   * Allows direct download of already-owned documents from the document detail page.
   */
  downloadOwned(): void {
    const d = this.doc();
    if (d) {
      void this.downloadWithNotice(d.id);
    }
  }

  /**
   * watermark-completion v1 §4.4: shows the backend's `watermarkNotice` (it names the buyer's
   * own `WMK-XXXXXXXX` copy code) through this page's existing message service. The download
   * itself is started by `LibraryService` exactly as before.
   */
  private async downloadWithNotice(documentId: string): Promise<void> {
    const win = window.open('', '_blank');
    try {
      const result = await this.library.download(documentId);
      const url = result?.downloadUrl;
      if (url && win) {
        win.location.href = url;
      } else {
        win?.close();
      }
      const notice = result?.watermarkNotice;
      if (notice) {
        this.message.info(notice, { nzDuration: 8000 });
      }
    } catch {
      win?.close();
    }
  }

  onPreviewTabSelect(): void {
    if (!this.preview() && !this.previewLoading()) {
      this.openPreview(false);
    }
  }

  openPreview(forceModal = true): void {
    const id = this.id();
    const d = this.doc();
    if (!id || !d) return;
    if ((d.previewPages ?? 0) <= 0) {
      this.message.info(this.translation.t('product.noPreviewYet'));
      return;
    }

    if (d.format === 'pdf' && forceModal) {
      if (this.previewPdfLoading()) return;
      void (async () => {
        this.previewPdfLoading.set(true);
        try {
          const blob = await this.catalog.loadDocumentPreviewPdf(id);
          const blobUrl = URL.createObjectURL(blob);
          this._previewPdfBlobUrl.set(blobUrl);
          const safeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl);
          this.previewPdfUrl.set(safeUrl);
          this.showPdfPreviewModal.set(true);
        } catch (err) {
          // preview-pdf-error-shape-and-watermark-template-length v1 §4.2: the server used to
          // answer 406 with an empty body for a non-PDF file, so every failure landed here as one
          // undifferentiated red toast and the JPEG fallback designed in
          // pdf-preview-popup-and-i18n-fix v1 §3 never actually ran. It now answers 400, which
          // CatalogService turns into `reason === 'not_a_pdf_document'` — so fall back to the
          // raster gallery instead of just complaining. Every other reason keeps the old toast.
          if (err instanceof PreviewPdfError && err.reason === 'not_a_pdf_document') {
            this.message.info(this.translation.t('product.previewPdfUnavailableFallback'));
            // `finally` below still clears previewPdfLoading before the raster load resolves.
            this.openRasterGallery(id, d, forceModal);
            return;
          }
          this.message.error(this.translation.t('product.downloadError'));
        } finally {
          this.previewPdfLoading.set(false);
        }
      })();
      return;
    }
    if (d.format === 'pdf' && !forceModal) {
      return;
    }

    this.openRasterGallery(id, d, forceModal);
  }

  /**
   * The JPEG raster preview path, lifted verbatim out of {@link openPreview} so the PDF branch
   * can fall back into it without duplicating a line
   * (preview-pdf-error-shape-and-watermark-template-length v1 §4.2).
   */
  private openRasterGallery(id: string, d: DocumentItem, forceModal: boolean): void {
    const existingRaster = this.previewRasterUrls();
    if (existingRaster.length > 0) {
      if (forceModal) {
        this.showPreviewGallery.set(true);
      }
      return;
    }

    if (this.previewLoading()) return;

    void (async () => {
      this.previewLoading.set(true);
      try {
        const data = await this.catalog.loadDocumentPreview(id);
        this.preview.set(data);
        const raster = data.previewImageUrls?.filter((u) => u?.trim()) ?? [];
        if (raster.length > 0) {
          if (forceModal) {
            this.showPreviewGallery.set(true);
          }
        } else if (forceModal) {
          if (typeof document !== 'undefined') {
            document.getElementById('preview-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          if (d.format && d.format !== 'pdf') {
            this.message.info(
              this.translation.t('product.noRasterDesc'),
            );
          } else {
            this.message.warning(
              this.translation.t('product.generatingPreview'),
            );
          }
        }
      } catch {
        if (forceModal) {
          this.message.error(this.translation.t('product.downloadError'));
        }
      } finally {
        this.previewLoading.set(false);
      }
    })();
  }

  // ===== GAP-06: asking the seller a question =====
  // The QNA table was rendered here but nothing could create a question, so buyers had no
  // way to ask anything before buying.

  readonly newQuestion = signal<string>('');
  readonly askingQuestion = signal<boolean>(false);
  readonly questionSent = signal<boolean>(false);

  async askQuestion(documentId: string): Promise<void> {
    if (this.askingQuestion()) return;

    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/document/${documentId}` },
      });
      return;
    }

    const question = this.newQuestion().trim();
    if (question.length < 5) {
      this.message.warning(this.translation.t('product.questionTooShort'));
      return;
    }

    this.askingQuestion.set(true);
    try {
      await this.catalog.askDocumentQuestion(documentId, question);
      this.newQuestion.set('');
      this.questionSent.set(true);
      this.message.success(this.translation.t('product.questionSubmitted'));
    } catch {
      this.message.error(this.translation.t('product.questionSubmitFailed'));
    } finally {
      this.askingQuestion.set(false);
    }
  }

  /**
   * document-bundle-cross-sell v1 §4: loads bundles containing this document non-blocking —
   * `BundleService.loadBundlesContainingDocument` never throws (errors are reported via
   * `ApiFailureReporter` inside the service and resolved as `[]`), so the section just stays
   * hidden on failure instead of showing a page-wide error banner.
   */
  private loadCrossSellBundles(documentId: string): void {
    this.crossSellBundles.set([]);
    if (!documentId) {
      this.crossSellState.set(idleActionState());
      return;
    }
    this.crossSellState.set(loadingActionState());
    void (async () => {
      const bundles = await this.bundles.loadBundlesContainingDocument(documentId, 3);
      this.crossSellBundles.set(bundles);
      this.crossSellState.set(idleActionState());
    })();
  }

  /**
   * ml-embedding-recommendations v1 §3.1/§4.3: loads "มักซื้อคู่กับเอกสารนี้" non-blocking —
   * `CatalogService.loadBoughtTogether` never throws (errors are reported via
   * `ApiFailureReporter` inside the service and resolved as `[]`), so the section just stays
   * hidden on failure/empty result instead of showing a page-wide error banner or empty state.
   */
  private loadBoughtTogether(documentId: string): void {
    this.boughtTogether.set([]);
    if (!documentId) {
      this.boughtTogetherState.set(idleActionState());
      return;
    }
    this.boughtTogetherState.set(loadingActionState());
    void (async () => {
      const items = await this.catalog.loadBoughtTogether(documentId, 6);
      this.boughtTogether.set(items);
      this.boughtTogetherState.set(idleActionState());
    })();
  }

  private loadSponsoredAds(): void {
    void this.ads.getSponsoredAds('doc_detail_related', '*', 2).then((sponsored) => {
      this.sponsoredDocs.set(sponsored);
      if (sponsored.length > 0) {
        this.ads.recordImpressions(
          this.sponsoredDocs,
          sponsored.map((d) => d.sponsoredCampaignId),
        );
      }
    });
  }
}


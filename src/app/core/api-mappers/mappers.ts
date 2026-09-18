/**
 * Maps OpenAPI-generated types to the frontend domain models.
 * Keep this file OUTSIDE the generated `core/api/` folder.
 */

import type {
  AdminAdsCampaignResponse,
  AdminAdsPlacementResponse,
  AdminAffiliateSummaryResponse,
  AdminMlRecommendationOverviewResponse,
  AdminPendingDocumentResponse,
  AdminSubscriptionListItemResponse,
  AdminTransactionResponse,
  AdsAvailabilityResponse,
  AdsCampaignDetailResponse,
  AdsCampaignQuoteResponse,
  AdsCampaignResponse,
  AdsPlacementResponse,
  AffiliateClickResponse,
  AffiliateSummaryResponse,
  AnnouncementAdminResponse,
  AnnouncementImageResponse,
  AnnouncementPopupResponse,
  BatchPayoutSlipItemResponse as ApiBatchPayoutSlipItemResponse,
  BatchPayoutSlipsResponse as ApiBatchPayoutSlipsResponse,
  BoughtTogetherItemResponse,
  BundleDetailResponse,
  BundleResponse,
  BuyerDocumentVersionResponse,
  CategoryResponse,
  CategoryDetailResponse,
  LibraryItemResponse,
  LineConnectionStatusResponse,
  LoyaltyEntryResponse,
  LoyaltySummaryResponse,
  MarketplaceDocumentDetailResponse,
  MarketplaceDocumentResponse,
  OrderResponse,
  OrderSimilarDocumentResponse,
  PayoutAccountResponse,
  PayoutSlipResponse,
  PlatformStatsResponse,
  SavedPaymentMethodResponse,
  SellerBalanceEntryResponse,
  SellerDashboardResponse,
  SellerDocumentResponse,
  SellerDocumentSummaryResponse,
  SellerDocumentVersionResponse,
  SellerInfoResponse,
  SellerInsightsResponse,
  SellerProfileResponse,
  SellerQnaResponse,
  StoreReadinessItemResponse,
  StoreReadinessResponse,
  SubcategoryAdminResponse,
  SubcategoryResponse,
  SubscriptionAccessHistoryItemResponse,
  SubscriptionPaymentHintsResponse,
  SubscriptionResponse,
} from '../api';
import type {
  AdminAdsCampaign,
  AdminAdsPlacement,
  AdminAffiliateSummary,
  AdminMlRecommendationOverview,
  AdminSubscriptionListItem,
  AdminTransaction,
  AdsAvailability,
  AdsCampaign,
  AdsCampaignDetail,
  AdsCampaignQuote,
  AdsCampaignStatus,
  AdsPlacement,
  AdsStopReason,
  AffiliateSummary,
  AffiliateClickResult,
  AnnouncementAdmin,
  AnnouncementImage,
  AnnouncementPopup,
  BatchPayoutSlipItemResponse,
  BatchPayoutSlipsResponse,
  BoughtTogetherItem,
  Bundle,
  BuyerDocumentVersionInfo,
  Category,
  DocumentItem,
  DocumentReview,
  ExamCountdownExamType,
  ExamCountdownSetting,
  FileFormat,
  GradeLevel,
  LibraryItem,
  LineConnectionStatus,
  LineConnectionStatusValue,
  LoyaltyEntry,
  LoyaltySummary,
  Order,
  OrderSimilarDocument,
  OrderStatus,
  PaymentMethod,
  PayoutAccount,
  PayoutAccountType,
  PayoutSlip,
  PlatformStats,
  PromptPayIdType,
  QnAItem,
  ReferralCodeValidation,
  ReferralSummary,
  ResourceType,
  SavedPaymentMethod,
  Seller,
  SellerBalanceEntry,
  SellerDocumentVersionInfo,
  SellerInsights,
  SellerQnaItem,
  SellerStats,
  ExamHubPage,
  ExamHubType,
  StoreReadiness,
  StoreReadinessItem,
  Subcategory,
  SubcategoryAdmin,
  Subscription,
  SubscriptionAccessHistoryItem,
  SubscriptionPaymentHints,
  SubscriptionStatus,
  WatermarkCapability,
  AdminWalletSummary,
  WalletEntry,
  WalletEntryKind,
  WalletSummary,
  WalletTopUp,
  WalletTopUpStatus,
} from '../models';
import { DEFAULT_SELLER_INSIGHTS, DEFAULT_STORE_READINESS, EXAM_COUNTDOWN_EXAM_TYPES } from '../models';
import { resolvePublicUrl } from '../api-runtime';
import {
  defaultAvatarUrl,
  placeholderCoverUrl,
  resolveAvatarUrl,
  resolveCoverUrl,
} from '../brand-assets';

/**
 * Defensive read: backend now returns `categoryIds: string[]`, but during the
 * regen window the OpenAPI types may still spell it `categoryId: string`.
 * Accept both shapes so an in-flight regen never breaks the UI.
 */
function readCategoryIds(d: { categoryIds?: string[] | null; categoryId?: string | null } | null | undefined): string[] {
  if (!d) return [];
  if (Array.isArray(d.categoryIds)) return d.categoryIds.filter((id): id is string => !!id);
  if (typeof d.categoryId === 'string' && d.categoryId.length > 0) return [d.categoryId];
  return [];
}

/** Backend may not yet expose `isFree`; treat price === 0 as a free document. */
function readIsFree(d: { isFree?: boolean | null; price?: number | null } | null | undefined): boolean {
  if (!d) return false;
  if (typeof d.isFree === 'boolean') return d.isFree;
  return (d.price ?? 0) === 0;
}

/**
 * document-faq-tab v1.1 §3.2: `MarketplaceDocumentDetailResponse.faqCount` / `.qnaCount` are
 * always emitted by the backend now — read them directly rather than deriving from
 * `qna.length` (a truncated array must never make the badge count lie).
 */
function readFaqCounts(
  d: { faqCount?: number | null; qnaCount?: number | null } | null | undefined,
): { faqCount: number; qnaCount: number } {
  return {
    faqCount: d?.faqCount ?? 0,
    qnaCount: d?.qnaCount ?? 0,
  };
}

/** document-faq-tab v1.1 §3.2/§3.3: `isFaq` is already the gated (answered-and-pinned) value. */
function readQnaIsFaq(q: { isFaq?: boolean | null } | null | undefined): boolean {
  return q?.isFaq ?? false;
}

/** document-faq-tab v1.1 §3.2/§3.3: `faqSortOrder` is a raw, always-present sort key. */
function readQnaFaqSortOrder(q: { faqSortOrder?: number | null } | null | undefined): number {
  return q?.faqSortOrder ?? 0;
}

/**
 * A fresh stub per call: `avatar` resolves to the R2 default at call time (the API base URL is
 * only known once `api-runtime` has initialised), and every caller spreading it gets its own
 * object rather than a shared one it could mutate for everyone else.
 */
function emptySeller(): Seller {
  return {
    id: '',
    studioName: '',
    ownerName: '',
    avatar: defaultAvatarUrl(),
    bio: '',
    joinedAt: new Date().toISOString(),
    rating: 0,
    totalSales: 0,
    totalDocuments: 0,
    followerCount: 0,
    responseHours: 0,
    badges: [],
  };
}

export function mapSeller(s: SellerInfoResponse | undefined): Seller {
  if (!s) return emptySeller();
  return {
    id: s.id ?? '',
    studioName: s.studioName ?? '',
    ownerName: s.ownerName ?? '',
    avatar: resolveAvatarUrl(s.avatarUrl),
    bio: s.bio ?? '',
    banner: s.bannerUrl ? resolvePublicUrl(s.bannerUrl) : undefined,
    joinedAt: s.joinedAt ?? new Date().toISOString(),
    rating: s.rating ?? 0,
    totalSales: s.totalSales ?? 0,
    totalDocuments: s.totalDocuments ?? 0,
    followerCount: s.followerCount ?? 0,
    responseHours: s.responseHours ?? 0,
    badges: s.badges ?? [],
    specialties: s.specialties ?? undefined,
  };
}

export function mapSellerProfile(p: SellerProfileResponse): Seller {
  return {
    id: p.id ?? '',
    studioName: p.studioName ?? '',
    ownerName: p.ownerName ?? '',
    avatar: resolveAvatarUrl(p.avatarUrl),
    bio: p.bio ?? '',
    banner: p.bannerUrl ? resolvePublicUrl(p.bannerUrl) : undefined,
    joinedAt: p.joinedAt ?? new Date().toISOString(),
    rating: p.rating ?? 0,
    totalSales: p.totalSales ?? 0,
    totalDocuments: p.totalDocuments ?? 0,
    followerCount: p.followerCount ?? 0,
    responseHours: p.responseHours ?? 0,
    badges: p.badges ?? [],
    specialties: p.specialties ?? undefined,
  };
}

export function mapCategory(c: CategoryResponse): Category {
  return {
    id: c.id ?? '',
    name: c.name ?? '',
    slug: c.slug ?? '',
    icon: c.icon ?? '📚',
    color: c.color ?? '#F9A8D4',
    description: c.description ?? '',
    documentCount: c.documentCount ?? 0,
    // real-data-stats v1 §3.1: active subcategory count, computed server-side (1 query).
    subcategoryCount: c.subcategoryCount ?? undefined,
    // subscription-membership v3 §3.1: monthly subscription price, `null` = not open yet.
    subscriptionMonthlyPrice: c.subscriptionMonthlyPrice ?? null,
  };
}

export function mapSubcategory(s: SubcategoryResponse): Subcategory {
  return {
    id: s.id ?? '',
    parentId: s.categoryId ?? '',
    name: s.name ?? '',
    slug: s.slug ?? '',
    icon: s.icon ?? undefined,
    documentCount: s.documentCount ?? 0,
  };
}

/** subcategory-admin-crud v1 (docs/contracts/subcategory-admin-crud.md §3.1). */
export function mapSubcategoryAdmin(s: SubcategoryAdminResponse): SubcategoryAdmin {
  return {
    id: s.id ?? '',
    categoryId: s.categoryId ?? '',
    name: s.name ?? '',
    slug: s.slug ?? '',
    icon: s.icon ?? '',
    isActive: s.isActive ?? true,
    sortOrder: s.sortOrder ?? 0,
    documentCount: s.documentCount ?? 0,
  };
}

/**
 * announcement-popup v1 §3.1 (`docs/contracts/announcement-popup.md`) — shared by both
 * `AnnouncementAdminResponse.images` and `AnnouncementPopupResponse.images` (same
 * `AnnouncementImageResponse` shape on the wire per §3.1).
 */
function mapAnnouncementImage(i: AnnouncementImageResponse): AnnouncementImage {
  return {
    id: i.id ?? '',
    imageUrl: i.imageUrl ?? '',
    linkUrl: i.linkUrl ?? null,
    altText: i.altText ?? null,
    sortOrder: i.sortOrder ?? 0,
  };
}

/** announcement-popup v1 §3.1 — admin CRUD response (`/api/admin/announcements*`). */
export function mapAnnouncementAdmin(a: AnnouncementAdminResponse): AnnouncementAdmin {
  return {
    id: a.id ?? '',
    title: a.title ?? '',
    isEnabled: a.isEnabled ?? false,
    startAt: a.startAt ?? null,
    endAt: a.endAt ?? null,
    sortOrder: a.sortOrder ?? 0,
    images: (a.images ?? []).map(mapAnnouncementImage),
  };
}

/** announcement-popup v1 §3.1 — buyer-facing response (`GET /api/announcements/active`). */
export function mapAnnouncementPopup(a: AnnouncementPopupResponse): AnnouncementPopup {
  return {
    id: a.id ?? '',
    title: a.title ?? '',
    images: (a.images ?? []).map(mapAnnouncementImage),
  };
}

export function mapCategoryDetail(c: CategoryDetailResponse): Category {
  return {
    id: c.id ?? '',
    name: c.name ?? '',
    slug: c.slug ?? '',
    icon: c.icon ?? '📚',
    color: c.color ?? '#F9A8D4',
    description: c.description ?? '',
    documentCount: c.documentCount ?? 0,
    // real-data-stats v1 §3.2: `null` (zero reviews) must stay `undefined`, never `0` (AC-EPIC-3).
    averageRating: c.averageRating ?? undefined,
    reviewCount: c.reviewCount ?? 0,
    subcategories: (c.subcategories ?? []).map(mapSubcategory),
  };
}

/** Admin queue item → full document shape for shared admin UI templates. */
export function mapAdminPendingToDocumentItem(
  p: AdminPendingDocumentResponse,
): DocumentItem {
  const sellerLabel = p.sellerName ?? '';
  return {
    id: p.id ?? '',
    slug: '',
    title: p.title ?? '',
    shortDescription: p.shortDescription ?? '',
    description: '',
    cover: resolveCoverUrl(p.coverUrl),
    gallery: [],
    price: p.price ?? 0,
    originalPrice: undefined,
    discountPercent: undefined,
    format: (p.format ?? 'pdf') as FileFormat,
    pages: 0,
    fileSize: '',
    language: 'th',
    categoryIds: readCategoryIds(p as { categoryIds?: string[] | null; categoryId?: string | null }),
    subcategoryId: undefined,
    gradeLevels: [] as GradeLevel[],
    resourceType: 'lesson-summary' as ResourceType,
    standards: [],
    tags: [],
    rating: 0,
    reviewCount: 0,
    downloads: 0,
    status: 'pending',
    watermarkEnabled: false,
    previewPages: 0,
    seller: {
      ...emptySeller(),
      studioName: sellerLabel,
      ownerName: sellerLabel,
    },
    createdAt: p.submittedAt ?? new Date().toISOString(),
    updatedAt: p.submittedAt ?? '',
    reviews: [],
    isFree: readIsFree(p as { isFree?: boolean | null; price?: number | null }),
    isBestseller: false,
    isFeatured: false,
    isEditorsPick: false,
    bundleDocumentIds: [],
    isAutoGenerated: p.isAutoGenerated ?? false,
    aiPrescreenRiskLevel: p.aiPrescreenRiskLevel ?? null,
    aiPrescreenFlags: p.aiPrescreenFlags ?? [],
  };
}

export function mapDocument(d: MarketplaceDocumentResponse): DocumentItem {
  const previews = (d.galleryPreviewUrls ?? []).map((u) =>
    resolvePublicUrl((u ?? '').replaceAll('%2F', '/')),
  );
  const cover = previews[0] ?? placeholderCoverUrl();
  const gallery = previews.length > 0 ? previews : [];
  return {
    id: d.id ?? '',
    slug: d.slug ?? '',
    title: d.title ?? '',
    shortDescription: d.shortDescription ?? '',
    description: '',
    cover,
    gallery,
    galleryCount: d.galleryCount ?? previews.length,
    price: d.price ?? 0,
    originalPrice: d.originalPrice ?? undefined,
    discountPercent: undefined,
    format: (d.format ?? 'pdf') as FileFormat,
    pages: d.pages ?? 0,
    fileSize: '',
    language: 'th',
    categoryIds: readCategoryIds(d as { categoryIds?: string[] | null; categoryId?: string | null }),
    subcategoryId: undefined,
    gradeLevels: [] as GradeLevel[],
    resourceType: 'lesson-summary' as ResourceType,
    standards: [],
    tags: [],
    rating: d.averageRating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    downloads: d.downloads ?? 0,
    status: 'approved',
    watermarkEnabled: false,
    previewPages: 0,
    seller: {
      ...emptySeller(),
      id: (d as { sellerId?: string }).sellerId ?? '',
      studioName: d.sellerName ?? '',
      ownerName: d.sellerName ?? '',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    reviews: [],
    isFree: readIsFree(d as { isFree?: boolean | null; price?: number | null }),
    isBestseller: d.isBestseller,
    isFeatured: d.isFeatured,
    isEditorsPick: false,
    bundleDocumentIds: [],
    // seller-ads-promotion v1 §3.9.1: additive fields on `MarketplaceDocumentResponse` — every
    // endpoint except `GET /api/marketplace/search` (page 1, sort=popular) always sends
    // `false`/`null` (DEC-6/AC-15), so this mapper trusts the server rather than re-deriving it.
    isSponsored: d.isSponsored ?? false,
    sponsoredCampaignId: d.sponsoredCampaignId ?? undefined,
  };
}

export function mapDocumentDetail(d: MarketplaceDocumentDetailResponse): DocumentItem {
  const reviews: DocumentReview[] = (d.reviews ?? []).map((r) => ({
    id: r.id ?? '',
    buyerName: r.authorName ?? '',
    buyerAvatar: defaultAvatarUrl(),
    rating: r.rating ?? 0,
    comment: r.comment ?? '',
    createdAt: r.createdAt ?? '',
    verified: false,
  }));

  const qna: QnAItem[] = (d.qna ?? []).map((q) => ({
    id: q.id ?? '',
    buyerName: q.buyerName ?? '',
    buyerAvatar: resolveAvatarUrl(q.buyerAvatarUrl),
    question: q.question ?? '',
    askedAt: q.askedAt ?? '',
    answer: q.answerText ? { text: q.answerText, answeredAt: q.answeredAt ?? '' } : undefined,
    isFaq: readQnaIsFaq(q as { isFaq?: boolean | null }),
    faqSortOrder: readQnaFaqSortOrder(q as { faqSortOrder?: number | null }),
  }));
  const faqCounts = readFaqCounts(d as { faqCount?: number | null; qnaCount?: number | null });

  const fromGallery = (d.galleryUrls ?? []).map((u) =>
    resolvePublicUrl((u ?? '').replaceAll('%2F', '/')),
  );
  const coverResolved = fromGallery[0] ?? placeholderCoverUrl();
  const gallery = fromGallery;

  return {
    id: d.id ?? '',
    slug: d.slug ?? '',
    title: d.title ?? '',
    shortDescription: d.shortDescription ?? '',
    description: d.description ?? '',
    cover: coverResolved,
    gallery,
    price: d.price ?? 0,
    originalPrice: d.originalPrice ?? undefined,
    discountPercent: d.discountPercent ?? undefined,
    discountExpiresAt: d.discountExpiresAt ?? undefined,
    soldThisMonthCount: d.soldThisMonthCount ?? undefined,
    format: (d.format ?? 'pdf') as FileFormat,
    pages: d.pages ?? 0,
    fileSize: d.fileSize ?? '',
    language: (d.language === 'en' ? 'en' : 'th') as 'th' | 'en',
    categoryIds: readCategoryIds(d as { categoryIds?: string[] | null; categoryId?: string | null }),
    subcategoryId: d.subcategoryId ?? undefined,
    gradeLevels: (d.gradeLevels ?? []) as GradeLevel[],
    resourceType: (d.resourceType ?? 'lesson-summary') as ResourceType,
    standards: d.standards ?? [],
    tags: d.tags ?? [],
    rating: d.averageRating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    downloads: d.downloads ?? 0,
    status: (d.status ?? 'approved') as DocumentItem['status'],
    watermarkEnabled: d.watermarkEnabled ?? false,
    previewPages: d.previewPages ?? 0,
    previewStorageKey: d.previewStorageKey ?? null,
    seller: mapSeller(d.seller),
    createdAt: d.createdAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt ?? new Date().toISOString(),
    reviews,
    qna,
    faqCount: faqCounts.faqCount,
    qnaCount: faqCounts.qnaCount,
    aiSummary: d.aiSummary ?? undefined,
    aiHighlights: d.aiHighlights ?? undefined,
    isFree: readIsFree(d as { isFree?: boolean | null; price?: number | null }),
    isBestseller: d.isBestseller,
    isFeatured: d.isFeatured,
    isEditorsPick: d.isEditorsPick,
    bundleDocumentIds: d.bundleIds ?? [],
    isAutoGenerated: d.isAutoGenerated ?? false,
    // subscription-membership v3 §3.7: `true` only for a logged-in buyer with an active
    // subscription covering this document — `false` for anonymous/every other case.
    isAccessibleViaActiveSubscription: d.isAccessibleViaActiveSubscription ?? false,
  };
}

export function mapBundle(b: BundleResponse): Bundle {
  return {
    id: b.id ?? '',
    slug: b.slug ?? '',
    title: b.title ?? '',
    description: b.description ?? '',
    cover: resolveCoverUrl(b.coverUrl),
    price: b.price ?? 0,
    originalPrice: b.originalPrice ?? 0,
    documentIds: [],
    documentCount: b.documentCount ?? 0,
    seller: {
      ...emptySeller(),
      id: b.sellerId ?? '',
      studioName: b.sellerName ?? '',
      ownerName: b.sellerName ?? '',
      joinedAt: b.createdAt ?? new Date().toISOString(),
      rating: b.averageRating ?? 0,
    },
    createdAt: b.createdAt ?? new Date().toISOString(),
    rating: b.averageRating ?? 0,
    reviewCount: b.reviewCount ?? 0,
    downloads: b.downloads ?? 0,
  };
}

/**
 * Q-04: `GET /api/marketplace/bundles/{id}` (`BundleDetailResponse`) is a different DTO from the
 * paged `GET /api/marketplace/bundles` (`BundleResponse`) — only the detail response carries the
 * member `documents` array; `mapBundle` above always leaves `documentIds` empty because the list
 * endpoint never sends member ids. Returned alongside the mapped `Bundle` (rather than folded
 * into it) because the bundle-detail page renders document cards straight from this array instead
 * of round-tripping through `CatalogService.getById`, which can't be trusted to already have
 * every document a given bundle happens to contain.
 */
export function mapBundleDetail(
  b: BundleDetailResponse,
): { bundle: Bundle; documents: DocumentItem[] } {
  const documents = (b.documents ?? []).map(mapDocument);
  return {
    bundle: {
      id: b.id ?? '',
      slug: b.slug ?? '',
      title: b.title ?? '',
      description: b.description ?? '',
      cover: resolveCoverUrl(b.coverUrl),
      price: b.price ?? 0,
      originalPrice: b.originalPrice ?? 0,
      documentIds: documents.map((d) => d.id),
      documentCount: documents.length,
      seller: mapSeller(b.seller),
      createdAt: b.createdAt ?? new Date().toISOString(),
      rating: b.averageRating ?? 0,
      reviewCount: b.reviewCount ?? 0,
      downloads: b.downloads ?? 0,
    },
    documents,
  };
}

export function mapLibraryItem(item: LibraryItemResponse): LibraryItem {
  const docStub: DocumentItem = {
    id: item.documentId ?? '',
    slug: '',
    title: item.title ?? '',
    shortDescription: '',
    description: '',
    cover: resolveCoverUrl(item.coverUrl),
    gallery: [],
    price: 0,
    format: (item.format ?? 'pdf') as FileFormat,
    pages: 0,
    fileSize: '',
    language: 'th',
    categoryIds: [],
    gradeLevels: [] as GradeLevel[],
    resourceType: 'lesson-summary',
    tags: [],
    rating: 0,
    reviewCount: 0,
    downloads: item.downloadCount ?? 0,
    status: 'approved',
    watermarkEnabled: false,
    previewPages: 0,
    seller: emptySeller(),
    createdAt: item.purchasedAt ?? '',
    updatedAt: item.purchasedAt ?? '',
    reviews: [],
    // document-versioning v1 §6: seller-facing fields on the library stub (buyer-facing shape) —
    // wired to the real `LibraryItemResponse.currentVersionNumber` (round 2, post-regen).
    currentVersionNumber: item.currentVersionNumber ?? undefined,
    lastVersionNotifiedBuyerCount: undefined,
  };
  return {
    document: docStub,
    purchasedAt: item.purchasedAt ?? '',
    orderNumber: item.orderNumber ?? '',
    downloadCount: item.downloadCount ?? 0,
    lastDownloadAt: item.lastDownloadAt ?? undefined,
    isReviewed: item.isReviewed ?? false,
    myReviewId: item.myReviewId ?? undefined,
    myRating: item.myRating ?? undefined,
    isRead: item.isRead ?? false,
    markedReadAt: item.markedReadAt ?? undefined,
    // document-versioning v1 §3.3/§6: wired to the real `LibraryItemResponse` fields
    // (round 2, post-regen).
    hasNewVersion: item.hasNewVersion ?? false,
    currentVersionNumber: item.currentVersionNumber ?? undefined,
    latestChangeNote: item.latestChangeNote ?? null,
  };
}

/**
 * document-versioning v1 §3.2/§6: `GET /api/seller/documents/{id}/versions` row →
 * {@link SellerDocumentVersionInfo}.
 */
export function mapSellerDocumentVersion(d: SellerDocumentVersionResponse): SellerDocumentVersionInfo {
  return {
    versionNumber: d.versionNumber ?? 0,
    changeNote: d.changeNote ?? null,
    createdAt: d.createdAt ?? '',
    notifiedBuyerCount: d.notifiedBuyerCount ?? null,
  };
}

/**
 * document-versioning v1 §3.5/§6: `GET /api/library/{documentId}/versions` row →
 * {@link BuyerDocumentVersionInfo}.
 */
export function mapBuyerDocumentVersion(d: BuyerDocumentVersionResponse): BuyerDocumentVersionInfo {
  return {
    versionNumber: d.versionNumber ?? 0,
    changeNote: d.changeNote ?? null,
    createdAt: d.createdAt ?? '',
  };
}

export function mapOrder(o: OrderResponse): Order {
  return {
    id: o.id ?? '',
    orderNumber: o.orderNumber ?? '',
    buyerId: '',
    items: (o.items ?? []).map((item) => ({
      document: {
        id: item.documentId ?? '',
        slug: '',
        title: item.title ?? '',
        shortDescription: '',
        description: '',
        cover: resolveCoverUrl(item.coverUrl),
        gallery: [],
        price: item.priceAtPurchase ?? 0,
        format: 'pdf' as FileFormat,
        pages: 0,
        fileSize: '',
        language: 'th' as const,
        categoryIds: [],
        gradeLevels: [] as GradeLevel[],
        resourceType: 'lesson-summary' as ResourceType,
        tags: [],
        rating: 0,
        reviewCount: 0,
        downloads: 0,
        status: 'approved' as DocumentItem['status'],
        watermarkEnabled: false,
        previewPages: 0,
        seller: emptySeller(),
        createdAt: o.createdAt ?? '',
        updatedAt: o.createdAt ?? '',
        reviews: [],
      },
      addedAt: o.createdAt ?? '',
      fromBundleId: item.bundleId ?? undefined,
    })),
    total: o.total ?? 0,
    subtotal: o.subTotal ?? o.total ?? 0,
    vatAmount: o.vatAmount ?? 0,
    status: (o.status ?? 'awaiting_payment') as OrderStatus,
    paymentMethod: (o.paymentMethod ?? 'unknown') as PaymentMethod,
    createdAt: o.createdAt ?? '',
    paidAt: o.paidAt ?? undefined,
    paymentHints: o.paymentHints
      ? {
          stripePaymentIntentId: o.paymentHints.stripePaymentIntentId ?? undefined,
          clientSecret: o.paymentHints.clientSecret ?? undefined,
          status: o.paymentHints.status ?? undefined,
          awaitingWebhook: o.paymentHints.awaitingWebhook ?? undefined,
        }
      : undefined,
    discountAmount: Number((o as unknown as { discountAmount?: number | null; discount_amount?: number | null }).discountAmount ?? (o as unknown as { discount_amount?: number | null }).discount_amount ?? 0),
  };
}

/**
 * order-similar-documents v1 §3.1/§4: `OrderSimilarDocumentResponse` → `OrderSimilarDocument`.
 * `document` reuses {@link mapDocument} (same `MarketplaceDocumentResponse` shape the endpoint's
 * DTO carries) — no second mapper for that part, per §1.2 of the contract.
 */
export function mapOrderSimilarDocument(d: OrderSimilarDocumentResponse): OrderSimilarDocument {
  return {
    document: mapDocument(d.document ?? {}),
    reason: d.reason ?? '',
    matchedDocumentId: d.matchedDocumentId ?? '',
    matchedDocumentTitle: d.matchedDocumentTitle ?? '',
  };
}

/**
 * store-readiness-score v1 §4: `StoreReadinessItemResponse` → `StoreReadinessItem`.
 * `currentCount`/`targetCount` stay `undefined` for `payout_account`/`profile_picture` — backend
 * sends `null` for both on those items (only `listings` carries real numbers).
 */
function mapStoreReadinessItem(i: StoreReadinessItemResponse): StoreReadinessItem {
  return {
    key: i.key ?? '',
    label: i.label ?? '',
    done: i.done ?? false,
    actionLabel: i.actionLabel ?? '',
    actionRoute: i.actionRoute ?? '',
    currentCount: i.currentCount ?? undefined,
    targetCount: i.targetCount ?? undefined,
  };
}

/** store-readiness-score v1 §3.2/§4: `StoreReadinessResponse` → `StoreReadiness`. */
export function mapStoreReadiness(d: StoreReadinessResponse): StoreReadiness {
  return {
    percentComplete: d.percentComplete ?? 0,
    isComplete: d.isComplete ?? false,
    items: (d.items ?? []).map(mapStoreReadinessItem),
    nextActionItemKey: d.nextActionItemKey ?? null,
  };
}

/**
 * seller-analytics-insights v1 §3.3/§4: `SellerInsightsResponse` → {@link SellerInsights}.
 * `?? []`/`?? 0` fallback on every field, same convention as `mapStoreReadiness` above — the
 * backend always sends this object (never `null`/omitted per AC-10), but every scalar/array
 * field on it is technically optional on the generated type.
 */
export function mapSellerInsights(d: SellerInsightsResponse): SellerInsights {
  const traffic = d.trafficBreakdown;
  return {
    documentConversions: (d.documentConversions ?? []).map((c) => ({
      documentId: c.documentId ?? '',
      title: c.title ?? '',
      viewCount: c.viewCount ?? 0,
      salesCount: c.salesCount ?? 0,
      conversionRatePercent: c.conversionRatePercent ?? 0,
    })),
    topSearchTerms: (d.topSearchTerms ?? []).map((t) => ({
      term: t.term ?? '',
      hitCount: t.hitCount ?? 0,
    })),
    trafficBreakdown: {
      totalViews: traffic?.totalViews ?? 0,
      searchViews: traffic?.searchViews ?? 0,
      categoryViews: traffic?.categoryViews ?? 0,
      directViews: traffic?.directViews ?? 0,
      searchPercent: traffic?.searchPercent ?? 0,
      categoryPercent: traffic?.categoryPercent ?? 0,
      directPercent: traffic?.directPercent ?? 0,
    },
  };
}

export function mapSellerStats(d: SellerDashboardResponse): SellerStats {
  return {
    totalRevenue: d.totalRevenue ?? 0,
    monthlyRevenue: d.monthlyRevenue ?? 0,
    totalDownloads: d.totalDownloads ?? 0,
    monthlyDownloads: d.monthlyDownloads ?? 0,
    averageRating: d.averageRating ?? 0,
    totalReviews: d.totalReviews ?? 0,
    pendingPayout: d.pendingPayout ?? 0,
    activeListings: d.activeListings ?? 0,
    pendingApproval: d.pendingApproval ?? 0,
    followerCount: d.followerCount ?? 0,
    newFollowersThisMonth: d.newFollowersThisMonth ?? 0,
    revenueByMonth: (d.revenueByMonth ?? []).map((m) => ({
      month: m.month ?? '',
      amount: m.amount ?? 0,
    })),
    topCategories: (d.topCategories ?? []).map((c) => ({
      category: c.category ?? '',
      sales: c.sales ?? 0,
    })),
    // real-data-stats v1 §3.4: `null` (no baseline to compare against) must stay `undefined`,
    // never `0` (AC-EPIC-3) — the trend badge hides on `undefined`.
    revenueTrendPercent: d.revenueTrendPercent ?? undefined,
    ratingTrendDelta: d.ratingTrendDelta ?? undefined,
    // store-readiness-score v1 §4 "การแบ่งงาน" (รอบสอง): now wired to the real backend field.
    storeReadiness: d.storeReadiness ? mapStoreReadiness(d.storeReadiness) : DEFAULT_STORE_READINESS,
    // seller-analytics-insights v1 §4 "การแบ่งงาน" (รอบสอง): now wired to the real backend field,
    // same pattern as `storeReadiness` above.
    insights: d.insights ? mapSellerInsights(d.insights) : DEFAULT_SELLER_INSIGHTS,
  };
}

/** real-data-stats v1 §4.1: maps `GET /api/marketplace/stats` into {@link PlatformStats}. */
export function mapPlatformStats(s: PlatformStatsResponse): PlatformStats {
  return {
    totalApprovedDocuments: s.totalApprovedDocuments ?? 0,
    totalSellers: s.totalSellers ?? 0,
    totalDownloads: s.totalDownloads ?? 0,
    reviewCount: s.reviewCount ?? 0,
    averageRating: s.averageRating ?? undefined,
    positiveReviewPercent: s.positiveReviewPercent ?? undefined,
    feeRatePercent: s.feeRatePercent ?? 0,
  };
}

/** document-faq-tab v1.1 §3.3: seller Q&A inbox row + `isFaq` / `faqSortOrder`. */
export function mapSellerQna(q: SellerQnaResponse): SellerQnaItem {
  return {
    id: q.id ?? '',
    documentId: q.documentId ?? '',
    documentTitle: q.documentTitle ?? '',
    buyerName: q.buyerName ?? '',
    question: q.question ?? '',
    askedAt: q.askedAt ?? '',
    answerText: q.answerText ?? null,
    answeredAt: q.answeredAt ?? null,
    isFaq: readQnaIsFaq(q as { isFaq?: boolean | null }),
    faqSortOrder: readQnaFaqSortOrder(q as { faqSortOrder?: number | null }),
  };
}

export function mapAdminTransaction(t: AdminTransactionResponse): AdminTransaction {
  return {
    id: t.id ?? '',
    orderNumber: t.orderNumber ?? '',
    buyerName: t.buyerName ?? '',
    sellerName: t.sellerName ?? '',
    documentTitle: t.documentTitle ?? '',
    amount: t.amount ?? 0,
    fee: t.fee ?? 0,
    netAmount: t.netAmount ?? 0,
    paymentMethod: (t.paymentMethod ?? 'unknown') as PaymentMethod,
    status: (t.status ?? 'awaiting_payment') as OrderStatus,
    createdAt: t.createdAt ?? '',
  };
}

/**
 * watermark-completion v1 §0.2/§3.4: narrows the generated bare `string` to the closed
 * capability set. An unknown value means the UI cannot promise a visible stamp, so it maps to
 * `'none'` — the most conservative of the four.
 */
function toWatermarkCapability(value: string | null | undefined): WatermarkCapability {
  switch ((value ?? '').trim()) {
    case 'raster':
    case 'ooxml':
    case 'repack':
      return (value ?? '').trim() as WatermarkCapability;
    default:
      return 'none';
  }
}

export function mapSellerDocument(d: SellerDocumentResponse): DocumentItem {
  const previews = (d.galleryPreviewUrls ?? []).map((u) =>
    resolvePublicUrl((u ?? '').replaceAll('%2F', '/')),
  );
  const fromItems = (d.galleryItems ?? [])
    .filter((it) => (it.imageUrl ?? '').trim() !== '')
    .map((it) => ({
      id: (it.id ?? '').trim(),
      imageUrl: (it.imageUrl ?? '').trim(),
      imageStorageKey: (it.imageStorageKey ?? '').trim(),
    }))
    .filter((it) => it.id !== '' && it.imageUrl !== '');
  const fromGallery = (d.galleryImageUrls ?? []).map((u) =>
    resolvePublicUrl((u ?? '').replaceAll('%2F', '/')),
  );
  const gallerySlots =
    fromItems.length > 0
      ? fromItems.map((it) => ({
          id: it.id,
          imageUrl: it.imageUrl,
          imageStorageKey: it.imageStorageKey,
        }))
      : undefined;
  const galleryFromSlots =
    fromItems.length > 0
      ? fromItems.map((it) => resolvePublicUrl(it.imageUrl.replaceAll('%2F', '/')))
      : [];
  const gallery =
    galleryFromSlots.length > 0
      ? galleryFromSlots
      : previews.length > 0
        ? previews
        : fromGallery.length > 0
          ? fromGallery
          : [];
  const coverUrl = gallery[0] ?? placeholderCoverUrl();
  const mainFilesRaw = d.mainFiles ?? [];
  const mainFiles =
    mainFilesRaw.length > 0
      ? mainFilesRaw
          .map((m) => ({
            id: (m.id ?? '').trim(),
            storageKey: (m.storageKey ?? '').trim(),
            originalFileName: (m.originalFileName ?? '').trim(),
            uploadedAt: (m.uploadedAt ?? '').trim(),
            isListedForSale: !!m.isListedForSale,
          }))
          .filter((m) => m.id !== '' && m.storageKey !== '')
      : undefined;

  return {
    id: d.id ?? '',
    slug: d.slug ?? '',
    title: d.title ?? '',
    shortDescription: d.shortDescription ?? '',
    description: '',
    cover: coverUrl,
    gallery,
    gallerySlots,
    galleryCount: d.galleryCount ?? gallery.length,
    price: d.price ?? 0,
    originalPrice: d.originalPrice ?? undefined,
    discountExpiresAt: d.discountExpiresAt ?? undefined,
    discountPercent: undefined,
    format: (d.format ?? 'pdf') as FileFormat,
    pages: d.pages ?? 0,
    fileSize: d.fileSize ?? '',
    language: (d.language ?? 'th') as 'th' | 'en',
    categoryIds: readCategoryIds(d as { categoryIds?: string[] | null; categoryId?: string | null }),
    gradeLevels: [] as GradeLevel[],
    resourceType: 'lesson-summary' as ResourceType,
    standards: [],
    tags: [],
    rating: d.averageRating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    downloads: d.downloads ?? 0,
    salesCount: d.salesCount ?? 0,
    // seller-analytics-insights v1 §3.4/§4 (รอบสอง): per-document view count + conversion rate.
    viewCount: d.viewCount ?? 0,
    conversionRatePercent: d.conversionRatePercent ?? 0,
    status: (d.status ?? 'pending') as DocumentItem['status'],
    watermarkEnabled: d.watermarkEnabled ?? false,
    // watermark-completion v1 §3.4: platform policy result for this listing. `capability` is
    // generated as a bare `string`, so it is narrowed here to the closed set §0.2 defines;
    // anything unexpected degrades to 'none' rather than leaking an unknown value into the UI.
    watermarkCapability: toWatermarkCapability(d.watermarkCapability),
    watermarkEffective: d.watermarkEffective ?? false,
    watermarkPolicyLocked: d.watermarkPolicyLocked ?? false,
    watermarkWarning: (d.watermarkWarning ?? '').trim() || null,
    previewPages: d.previewPages ?? 0,
    previewWatermarkSubtitle: d.previewWatermarkSubtitle ?? undefined,
    previewWatermarkFontFamily: d.previewWatermarkFontFamily ?? undefined,
    seller: emptySeller(),
    createdAt: d.createdAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt ?? new Date().toISOString(),
    reviews: [],
    isFree: readIsFree(d as { isFree?: boolean | null; price?: number | null }),
    isBestseller: false,
    isFeatured: false,
    isEditorsPick: false,
    bundleDocumentIds: [],
    mainFiles,
    listedMainFileId: (d.listedMainFileId ?? '').trim() || mainFiles?.find((m) => m.isListedForSale)?.id,
    // document-versioning v1 §3.1/§6: wired to the real `SellerDocumentResponse` fields
    // (round 2, post-regen).
    currentVersionNumber: d.currentVersionNumber ?? undefined,
    lastVersionNotifiedBuyerCount: d.lastVersionNotifiedBuyerCount ?? null,
    // document-rejection-reason v1 §4: real SDK fields (post regen) — no cast needed.
    rejectionReason: d.rejectionReason ?? null,
    rejectedAt: d.rejectedAt ?? null,
  };
}

/** loyalty-points v1 §3.1/§3.2: `LoyaltySummaryResponse` / `LoyaltyEntryResponse` (generated). */
export function mapLoyaltySummary(d: LoyaltySummaryResponse): LoyaltySummary {
  return {
    balance: d.balance ?? 0,
    earnedThisMonth: d.earnedThisMonth ?? 0,
    lifetimeEarned: d.lifetimeEarned ?? 0,
    lifetimeSpent: d.lifetimeSpent ?? 0,
    asOf: d.asOf ?? new Date().toISOString(),
  };
}

/** `LoyaltyEntryResponse.kind` is `"earn" | "redeem" | "adjust"` (§3.2) — anything else falls back to `"earn"`. */
function readLoyaltyEntryKind(kind: string | null | undefined): LoyaltyEntry['kind'] {
  return kind === 'redeem' || kind === 'adjust' ? kind : 'earn';
}

export function mapLoyaltyEntry(d: LoyaltyEntryResponse): LoyaltyEntry {
  return {
    id: d.id ?? '',
    points: d.points ?? 0,
    kind: readLoyaltyEntryKind(d.kind),
    reason: d.reason ?? '',
    orderNumber: d.orderNumber ?? undefined,
    occurredAt: d.occurredAt ?? '',
  };
}

/**
 * saved-credit-cards v1 §3.2: `SavedPaymentMethodResponse` (docs/contracts/saved-credit-cards.md
 * §3.2), generated from the live backend by `npm run generate:api`.
 */
export function mapSavedPaymentMethod(d: SavedPaymentMethodResponse): SavedPaymentMethod {
  return {
    id: d.id ?? '',
    stripePaymentMethodId: d.stripePaymentMethodId ?? '',
    brand: d.brand ?? '',
    last4: d.last4 ?? '',
    expMonth: d.expMonth ?? 0,
    expYear: d.expYear ?? 0,
    isDefault: d.isDefault ?? false,
    createdAt: d.createdAt ?? new Date().toISOString(),
  };
}

/** buyer-wallet v1 §3.2: DTO shape until SDK regen ships WalletSummaryResponse. */
export type WalletSummaryResponse = {
  balance?: number | null;
  asOf?: string | null;
};

/** buyer-wallet v1 §3.3: DTO shape until SDK regen ships WalletEntryResponse. */
export type WalletEntryResponse = {
  id?: string | null;
  kind?: string | null;
  amount?: number | null;
  reason?: string | null;
  orderNumber?: string | null;
  occurredAt?: string | null;
};

/** buyer-wallet v1 §3.4/§3.5: DTO shape until SDK regen ships WalletTopUpResponse. */
export type WalletTopUpResponse = {
  id?: string | null;
  amount?: number | null;
  status?: string | null;
  stripePaymentIntentId?: string | null;
  clientSecret?: string | null;
  createdAt?: string | null;
  succeededAt?: string | null;
};

/** buyer-wallet v1 §3.8: DTO shape until SDK regen ships AdminWalletSummaryResponse. */
export type AdminWalletSummaryResponse = {
  userId?: string | null;
  balance?: number | null;
  lifetimeToppedUp?: number | null;
  lifetimeSpent?: number | null;
  asOf?: string | null;
};

function readWalletEntryKind(kind: string | null | undefined): WalletEntryKind {
  if (kind === 'purchase' || kind === 'refund') return kind;
  return 'topup';
}

function readWalletTopUpStatus(status: string | null | undefined): WalletTopUpStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'cancelled') return status;
  return 'pending';
}

/** buyer-wallet v1 §3.2: maps WalletSummaryResponse to WalletSummary. */
export function mapWalletSummary(d: WalletSummaryResponse): WalletSummary {
  return {
    balance: d.balance ?? 0,
    asOf: d.asOf ?? new Date().toISOString(),
  };
}

/** buyer-wallet v1 §3.3: maps WalletEntryResponse to WalletEntry. */
export function mapWalletEntry(d: WalletEntryResponse): WalletEntry {
  return {
    id: d.id ?? '',
    kind: readWalletEntryKind(d.kind),
    amount: d.amount ?? 0,
    reason: d.reason ?? '',
    orderNumber: d.orderNumber ?? undefined,
    occurredAt: d.occurredAt ?? '',
  };
}

/** buyer-wallet v1 §3.4/§3.5: maps WalletTopUpResponse to WalletTopUp. */
export function mapWalletTopUp(d: WalletTopUpResponse): WalletTopUp {
  return {
    id: d.id ?? '',
    amount: d.amount ?? 0,
    status: readWalletTopUpStatus(d.status),
    stripePaymentIntentId: d.stripePaymentIntentId ?? null,
    clientSecret: d.clientSecret ?? null,
    createdAt: d.createdAt ?? '',
    succeededAt: d.succeededAt ?? null,
  };
}

/** buyer-wallet v1 §3.8: maps AdminWalletSummaryResponse to AdminWalletSummary. */
export function mapAdminWalletSummary(d: AdminWalletSummaryResponse): AdminWalletSummary {
  return {
    userId: d.userId ?? '',
    balance: d.balance ?? 0,
    lifetimeToppedUp: d.lifetimeToppedUp ?? 0,
    lifetimeSpent: d.lifetimeSpent ?? 0,
    asOf: d.asOf ?? new Date().toISOString(),
  };
}

/**
 * ml-embedding-recommendations v1 §3.1: one row of `BoughtTogetherResponse.items`. `document` is
 * required on the wire (§3.1) but generated as optional — returns `null` for the rare/defensive
 * case it is missing so the caller can filter it out rather than render a broken card.
 */
export function mapBoughtTogetherItem(d: BoughtTogetherItemResponse): BoughtTogetherItem | null {
  if (!d.document) return null;
  return {
    document: mapDocument(d.document),
    coPurchaseCount: d.coPurchaseCount ?? 0,
  };
}

/**
 * ml-embedding-recommendations v1 §3.2: `GET /api/admin/ml/recommendations/overview`.
 *
 * Wire field is `minCoPurchaseCount` (confirmed against `openapi.snapshot.json` post gate-1 —
 * the spec's §3.2 response table names it `minCoPurchaseThreshold`, a documentation-only naming
 * choice that never made it into the shipped DTO) — the domain model keeps the spec's more
 * readable name; only this mapper needs to know about the mismatch.
 */
export function mapAdminMlRecommendationOverview(
  d: AdminMlRecommendationOverviewResponse,
): AdminMlRecommendationOverview {
  return {
    documentsWithEmbeddingCount: d.documentsWithEmbeddingCount ?? 0,
    documentsWithBoughtTogetherCount: d.documentsWithBoughtTogetherCount ?? 0,
    totalSimilarityPairs: d.totalSimilarityPairs ?? 0,
    averageCoPurchaseCount: d.averageCoPurchaseCount ?? 0,
    lastComputedAt: d.lastComputedAt ?? null,
    embeddingDimensions: d.embeddingDimensions ?? 0,
    minCoPurchaseThreshold: d.minCoPurchaseCount ?? 0,
  };
}

/**
 * seller-payout-account-self-service v1 §3.1: `PayoutAccountResponse`
 * (docs/contracts/seller-payout-account-self-service.md §3.1), generated from the live backend by
 * `npm run generate:api`.
 */
/** payout-request-slip-verification v1 §3.13.2: bare string on the wire, narrowed here. */
function toPayoutAccountType(value: string | null | undefined): PayoutAccountType | null {
  return value === 'bank' || value === 'promptpay' ? value : null;
}

function toPromptPayIdType(value: string | null | undefined): PromptPayIdType | null {
  return value === 'phone' || value === 'national_id' || value === 'qr_code' ? value : null;
}

export function mapPayoutAccount(d: PayoutAccountResponse): PayoutAccount {
  return {
    hasAccount: d.hasAccount ?? false,
    accountType: toPayoutAccountType(d.accountType),
    bankCode: d.bankCode ?? '',
    accountHolderName: d.accountHolderName ?? '',
    accountNumberMasked: d.accountNumberMasked ?? '',
    promptPayType: toPromptPayIdType(d.promptPayType),
    promptPayMasked: d.promptPayMasked ?? '',
    promptPayQrImageUrl: d.promptPayQrImageUrl ?? null,
    updatedAt: d.updatedAt ?? '',
    // payment-method-master-config v1 — platform default (per spec) is QR-only until an admin
    // flips a switch, mirrors `toPlatformSettings` in admin.service.ts.
    payoutMethodBankEnabled: d.payoutMethodBankEnabled ?? false,
    payoutMethodPromptPayPhoneEnabled: d.payoutMethodPromptPayPhoneEnabled ?? false,
    payoutMethodPromptPayNationalIdEnabled: d.payoutMethodPromptPayNationalIdEnabled ?? false,
    payoutMethodPromptPayQrEnabled: d.payoutMethodPromptPayQrEnabled ?? true,
  };
}

/** payout-request-slip-verification v1 §3.5: one row of the seller earnings ledger. */
export function mapSellerBalanceEntry(d: SellerBalanceEntryResponse): SellerBalanceEntry {
  return {
    id: d.id ?? '',
    kind: d.kind ?? '',
    amount: d.amount ?? 0,
    reason: d.reason ?? '',
    sourceType: d.sourceType ?? null,
    sourceId: d.sourceId ?? null,
    note: d.note ?? null,
    occurredAt: d.occurredAt ?? '',
  };
}

/** payout-request-slip-verification v1 §3.7.7: one uploaded e-Slip + its verification result. */
export function mapPayoutSlip(d: PayoutSlipResponse): PayoutSlip {
  return {
    id: d.id ?? '',
    payoutId: d.payoutId ?? '',
    provider: d.provider ?? '',
    verificationStatus: d.verificationStatus ?? 'pending',
    providerReference: d.providerReference ?? null,
    parsedAmount: d.parsedAmount ?? null,
    parsedTransferredAt: d.parsedTransferredAt ?? null,
    parsedReceiverNameMasked: d.parsedReceiverNameMasked ?? null,
    parsedReceiverAccountLast4: d.parsedReceiverAccountLast4 ?? null,
    parsedSenderBankCode: d.parsedSenderBankCode ?? null,
    mismatchReasons: d.mismatchReasons ?? [],
    providerErrorCode: d.providerErrorCode ?? null,
    providerErrorMessage: d.providerErrorMessage ?? null,
    fileUrl: d.fileUrl ?? '',
    uploadedAt: d.uploadedAt ?? '',
    uploadedByName: d.uploadedByName ?? null,
  };
}

function mapBatchPayoutSlipItem(d: ApiBatchPayoutSlipItemResponse): BatchPayoutSlipItemResponse {
  return {
    fileName: d.fileName ?? '',
    fileSizeBytes: d.fileSizeBytes ?? 0,
    slipId: d.slipId ?? null,
    slipUrl: d.slipUrl ?? null,
    payoutId: d.payoutId ?? null,
    sellerName: d.sellerName ?? null,
    sellerEmail: d.sellerEmail ?? null,
    requestedAmount: d.requestedAmount ?? null,
    parsedAmount: d.parsedAmount ?? null,
    parsedReceiverName: d.parsedReceiverName ?? null,
    parsedReceiverAccountLast4: d.parsedReceiverAccountLast4 ?? null,
    providerReference: d.providerReference ?? null,
    verificationStatus: d.verificationStatus ?? 'unmatched',
    mismatchReasons: d.mismatchReasons ?? [],
    payoutStatus: d.payoutStatus ?? null,
    message: d.message ?? null,
  };
}

export function mapBatchPayoutSlipsResponse(d: ApiBatchPayoutSlipsResponse): BatchPayoutSlipsResponse {
  return {
    totalFiles: d.totalFiles ?? 0,
    matchedCount: d.matchedCount ?? 0,
    completedCount: d.completedCount ?? 0,
    failedCount: d.failedCount ?? 0,
    unmatchedCount: d.unmatchedCount ?? 0,
    items: (d.items ?? []).map(mapBatchPayoutSlipItem),
  };
}

/** List row only — cover thumbnail; no full gallery metadata (edit loads via GET by id). */
export function mapSellerDocumentSummary(d: SellerDocumentSummaryResponse): DocumentItem {
  const coverRaw = (d.coverUrl ?? '').trim();
  const realCover = coverRaw ? resolvePublicUrl(coverRaw.replaceAll('%2F', '/')) : '';
  const gallery = realCover ? [realCover] : [];
  const cover = realCover || placeholderCoverUrl();
  return {
    id: d.id ?? '',
    slug: d.slug ?? '',
    title: d.title ?? '',
    shortDescription: '',
    description: '',
    cover,
    gallery,
    gallerySlots: undefined,
    galleryCount: gallery.length,
    price: d.price ?? 0,
    originalPrice: undefined,
    discountPercent: undefined,
    format: (d.format ?? 'pdf') as FileFormat,
    pages: d.pages ?? 0,
    fileSize: '',
    language: 'th',
    categoryIds: readCategoryIds(d as { categoryIds?: string[] | null; categoryId?: string | null }),
    gradeLevels: [] as GradeLevel[],
    resourceType: 'lesson-summary' as ResourceType,
    standards: [],
    tags: [],
    rating: d.averageRating ?? 0,
    reviewCount: d.reviewCount ?? 0,
    downloads: d.downloads ?? 0,
    salesCount: d.salesCount ?? 0,
    // seller-analytics-insights v1 §3.4/§4 (รอบสอง): per-document view count + conversion rate.
    viewCount: d.viewCount ?? 0,
    conversionRatePercent: d.conversionRatePercent ?? 0,
    status: (d.status ?? 'pending') as DocumentItem['status'],
    watermarkEnabled: false,
    previewPages: 0,
    seller: emptySeller(),
    createdAt: d.updatedAt ?? new Date().toISOString(),
    updatedAt: d.updatedAt ?? '',
    reviews: [],
    isFree: readIsFree(d as { isFree?: boolean | null; price?: number | null }),
    isBestseller: false,
    isFeatured: false,
    isEditorsPick: false,
    bundleDocumentIds: [],
    // document-rejection-reason v1 §4: real SDK fields (post regen) — no cast needed.
    rejectionReason: d.rejectionReason ?? null,
    rejectedAt: d.rejectedAt ?? null,
  };
}

export function mapReferralSummary(raw: unknown): ReferralSummary {
  const r = (raw ?? {}) as {
    code?: string | null;
    shareUrl?: string | null;
    share_url?: string | null;
    totalReferred?: number | null;
    total_referred?: number | null;
    unusedCreditCount?: number | null;
    unused_credit_count?: number | null;
    unusedCreditTotal?: number | null;
    unused_credit_total?: number | null;
  };
  return {
    code: r.code ?? '',
    shareUrl: r.shareUrl ?? r.share_url ?? '',
    totalReferred: Number(r.totalReferred ?? r.total_referred ?? 0),
    unusedCreditCount: Number(r.unusedCreditCount ?? r.unused_credit_count ?? 0),
    unusedCreditTotal: Number(r.unusedCreditTotal ?? r.unused_credit_total ?? 0),
  };
}

export function mapReferralCodeValidation(raw: unknown): ReferralCodeValidation {
  const r = (raw ?? {}) as {
    valid?: boolean | null;
    discountAmount?: number | null;
    discount_amount?: number | null;
    reasonText?: string | null;
    reason_text?: string | null;
  };
  return {
    valid: Boolean(r.valid),
    discountAmount: r.discountAmount != null ? Number(r.discountAmount) : (r.discount_amount != null ? Number(r.discount_amount) : undefined),
    reasonText: r.reasonText ?? r.reason_text ?? undefined,
  };
}

export function mapExamHubPage(raw: unknown): ExamHubPage {
  const r = (raw ?? {}) as {
    examType?: string | null;
    exam_type?: string | null;
    title?: string | null;
    metaDescription?: string | null;
    meta_description?: string | null;
    introText?: string | null;
    intro_text?: string | null;
    examDateInfo?: string | null;
    exam_date_info?: string | null;
    scoreCriteriaInfo?: string | null;
    score_criteria_info?: string | null;
    trendInfo?: string | null;
    trend_info?: string | null;
    updatedAt?: string | null;
    updated_at?: string | null;
  };
  return {
    examType: (r.examType ?? r.exam_type ?? 'tcas') as ExamHubType,
    title: r.title ?? '',
    metaDescription: r.metaDescription ?? r.meta_description ?? '',
    introText: r.introText ?? r.intro_text ?? '',
    examDateInfo: r.examDateInfo ?? r.exam_date_info ?? undefined,
    scoreCriteriaInfo: r.scoreCriteriaInfo ?? r.score_criteria_info ?? undefined,
    trendInfo: r.trendInfo ?? r.trend_info ?? undefined,
    updatedAt: r.updatedAt ?? r.updated_at ?? undefined,
  };
}

/**
 * exam-countdown-mode v1 §3.1/§4: `ExamCountdownSettingResponse` → {@link ExamCountdownSetting}.
 * Takes `unknown` (not the generated type) — `npm run generate:api` hasn't shipped
 * `ExamCountdownSettingResponse` yet (round 1, `docs/contracts/exam-countdown-mode.md` §4 "การแบ่งงาน"),
 * same convention as `mapReferralSummary`/`mapExamHubPage` above. `examType` falls back to `'O-NET'`
 * (the first preset) if the raw value is ever missing or outside the known 9 presets — defensive
 * only, the backend never sends anything else per §3.2's validation.
 */
export function mapExamCountdownSetting(raw: unknown): ExamCountdownSetting {
  const r = (raw ?? {}) as {
    examType?: string | null;
    exam_type?: string | null;
    examDate?: string | null;
    exam_date?: string | null;
    isEnabled?: boolean | null;
    is_enabled?: boolean | null;
  };
  const rawExamType = r.examType ?? r.exam_type ?? '';
  const examType = (EXAM_COUNTDOWN_EXAM_TYPES as string[]).includes(rawExamType)
    ? (rawExamType as ExamCountdownExamType)
    : EXAM_COUNTDOWN_EXAM_TYPES[0];
  return {
    examType,
    examDate: r.examDate ?? r.exam_date ?? '',
    isEnabled: r.isEnabled ?? r.is_enabled ?? true,
  };
}

/**
 * line-notification-channel v1 §3.3: `LineConnectionStatusResponse` → `LineConnectionStatus`.
 * `status` is a plain string on the wire (§3.3 note, no OpenAPI enum) — guarded against anything
 * unexpected by defaulting to `'NotConnected'`, the same "no connection" meaning an absent/unknown
 * value would imply.
 */
export function mapLineConnectionStatus(d: LineConnectionStatusResponse): LineConnectionStatus {
  const status: LineConnectionStatusValue =
    d.status === 'Connected' || d.status === 'Disconnected' ? d.status : 'NotConnected';
  return {
    isAvailable: d.isAvailable ?? false,
    isConnected: d.isConnected ?? false,
    status,
    lineDisplayName: d.lineDisplayName ?? null,
    connectedAt: d.connectedAt ?? null,
  };
}

/**
 * subscription-membership v3 §3: `status` is a plain string on the wire on every subscription
 * response (`SubscriptionResponse`/`AdminSubscriptionListItemResponse`, §3.2/§3.3/§3.4/§3.5), not
 * an OpenAPI enum — validated against the 4 known values, falling back to `'incomplete'` for
 * anything unexpected (the least-privileged status: it never implies active download access).
 */
const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'incomplete',
  'active',
  'past_due',
  'canceled',
];

function readSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status ?? '')
    ? (status as SubscriptionStatus)
    : 'incomplete';
}

/**
 * subscription-membership v3 §3.3/§3.4/§3.5: `SubscriptionResponse.paymentHints` — only present
 * right after `POST /api/me/subscription` or while still `incomplete` awaiting the first webhook;
 * `GET`/`POST .../cancel` send `null` once there is nothing left to confirm client-side.
 */
function mapSubscriptionPaymentHints(
  h: SubscriptionPaymentHintsResponse | null | undefined,
): SubscriptionPaymentHints | null {
  if (!h) return null;
  return {
    stripeSubscriptionId: h.stripeSubscriptionId ?? '',
    clientSecret: h.clientSecret ?? null,
    status: h.status ?? '',
    awaitingWebhook: h.awaitingWebhook ?? false,
  };
}

/**
 * subscription-membership v3 §3.3/§3.4/§3.5: `SubscriptionResponse` → {@link Subscription}. Shared
 * by `create`/`loadCurrent`/`cancel` in `core/services/subscription.service.ts` — all three
 * endpoints return this exact shape.
 */
export function mapSubscription(d: SubscriptionResponse): Subscription {
  return {
    id: d.id ?? '',
    status: readSubscriptionStatus(d.status),
    categoryIds: d.categoryIds ?? [],
    monthlyPrice: d.monthlyPrice ?? 0,
    currentPeriodStart: d.currentPeriodStart ?? '',
    currentPeriodEnd: d.currentPeriodEnd ?? '',
    cancelAtPeriodEnd: d.cancelAtPeriodEnd ?? false,
    canceledAt: d.canceledAt ?? null,
    paymentHints: mapSubscriptionPaymentHints(d.paymentHints),
  };
}

/** subscription-membership v3 §3.6: `SubscriptionAccessHistoryItemResponse` → {@link SubscriptionAccessHistoryItem}. */
export function mapSubscriptionAccessHistoryItem(
  d: SubscriptionAccessHistoryItemResponse,
): SubscriptionAccessHistoryItem {
  return {
    documentId: d.documentId ?? '',
    title: d.title ?? '',
    coverUrl: resolveCoverUrl(d.coverUrl),
    sellerName: d.sellerName ?? '',
    firstAccessedAt: d.firstAccessedAt ?? '',
    lastAccessedAt: d.lastAccessedAt ?? '',
    accessCount: d.accessCount ?? 0,
    stillAccessible: d.stillAccessible ?? false,
  };
}

/** subscription-membership v3 §3.2: `AdminSubscriptionListItemResponse` → {@link AdminSubscriptionListItem}. */
export function mapAdminSubscriptionListItem(
  d: AdminSubscriptionListItemResponse,
): AdminSubscriptionListItem {
  return {
    id: d.id ?? '',
    buyerName: d.buyerName ?? '',
    buyerEmail: d.buyerEmail ?? '',
    categoryIds: d.categoryIds ?? [],
    status: readSubscriptionStatus(d.status),
    monthlyPrice: d.monthlyPrice ?? 0,
    currentPeriodStart: d.currentPeriodStart ?? '',
    currentPeriodEnd: d.currentPeriodEnd ?? '',
    cancelAtPeriodEnd: d.cancelAtPeriodEnd ?? false,
    createdAt: d.createdAt ?? '',
  };
}

// ====== Affiliate mappers (referral-program v2, docs/contracts/referral-program.md §3.7–§3.10) ======
// Round 2 (post-regen): every mapper below reads the real generated response types.

/** referral-program v2 §3.7: `GET /api/me/affiliate` response → {@link AffiliateSummary}. */
export function mapAffiliateSummary(d: AffiliateSummaryResponse): AffiliateSummary {
  return {
    code: d.code ?? '',
    shareUrl: d.shareUrl ?? '',
    commissionRatePercent: d.commissionRatePercent ?? 0,
    isActive: d.isActive ?? true,
    totalClicks: d.totalClicks ?? 0,
    totalConversions: d.totalConversions ?? 0,
    commissionEarnedTotal: d.commissionEarnedTotal ?? 0,
  };
}

/** referral-program v2 §3.8: `POST /api/affiliate/click` response → {@link AffiliateClickResult}. */
export function mapAffiliateClickResult(d: AffiliateClickResponse): AffiliateClickResult {
  return {
    clickToken: d.clickToken ?? '',
    expiresAt: d.expiresAt ?? '',
  };
}

/** referral-program v2 §3.10 (+ v3 §1.6): `GET /api/admin/affiliates` item → {@link AdminAffiliateSummary}. */
export function mapAdminAffiliateSummary(d: AdminAffiliateSummaryResponse): AdminAffiliateSummary {
  return {
    userId: d.userId ?? '',
    displayName: d.displayName ?? '',
    email: d.email ?? '',
    code: d.code ?? '',
    commissionRatePercent: d.commissionRatePercent ?? 0,
    commissionRatePercentOverride: d.commissionRatePercentOverride ?? null,
    isActive: d.isActive ?? true,
    totalClicks: d.totalClicks ?? 0,
    totalConversions: d.totalConversions ?? 0,
    commissionEarnedTotal: d.commissionEarnedTotal ?? 0,
  };
}

// ====== Seller Ads Promotion mappers (seller-ads-promotion v1, docs/contracts/seller-ads-promotion.md §3) ======
// F-14 round 2 (this round): backend shipped and `npm run generate:api` regenerated the SDK
// against the live backend — every mapper below reads the real generated response types.

/** §2.3: bare wire string → the narrow union, defaulting to `scheduled` for an unrecognised value. */
function toAdsCampaignStatus(value: string | undefined): AdsCampaignStatus {
  switch (value) {
    case 'active':
    case 'completed':
    case 'cancelled':
    case 'stopped':
      return value;
    default:
      return 'scheduled';
  }
}

/** §2.2: bare wire string → the narrow union, or `null` when the campaign never stopped early. */
function toAdsStopReason(value: string | null | undefined): AdsStopReason | null {
  switch (value) {
    case 'seller_cancelled':
    case 'admin_stopped':
    case 'account_suspended':
    case 'document_unavailable':
      return value;
    default:
      return null;
  }
}

/** §3.1: only `IsEnabled` placements are ever sent by this endpoint. */
export function mapAdsPlacement(d: AdsPlacementResponse): AdsPlacement {
  return {
    placementKey: d.placementKey ?? '',
    displayName: d.displayName ?? '',
    description: d.description ?? '',
    pricePerDay: d.pricePerDay ?? 0,
    weeklyPrice: d.weeklyPrice ?? null,
    dailySlotCapacity: d.dailySlotCapacity ?? 0,
    requiresTarget: d.requiresTarget ?? false,
  };
}

/** §3.11.3: admin variant — includes disabled placements + the editable knobs. */
export function mapAdminAdsPlacement(d: AdminAdsPlacementResponse): AdminAdsPlacement {
  return {
    ...mapAdsPlacement(d),
    maxPerResultPage: d.maxPerResultPage ?? 1,
    isEnabled: d.isEnabled ?? false,
    activeCampaignCount: d.activeCampaignCount ?? 0,
    updatedAt: d.updatedAt ?? null,
  };
}

/** §3.2: `GET /api/seller/ads/availability` response. */
export function mapAdsAvailability(d: AdsAvailabilityResponse): AdsAvailability {
  return {
    placementKey: d.placementKey ?? '',
    targetKey: d.targetKey ?? '*',
    pricePerDay: d.pricePerDay ?? 0,
    weeklyPrice: d.weeklyPrice ?? null,
    dailySlotCapacity: d.dailySlotCapacity ?? 0,
    days: (d.days ?? []).map((day) => ({
      date: day.date ?? '',
      remainingSlots: day.remainingSlots ?? 0,
      isSelectable: day.isSelectable ?? false,
    })),
  };
}

/** §3.3: `POST /api/seller/ads/campaigns/quote` response — §4.2 rule 1: the only source of money figures in the create-campaign form. */
export function mapAdsCampaignQuote(d: AdsCampaignQuoteResponse): AdsCampaignQuote {
  return {
    dayCount: d.dayCount ?? 0,
    pricePerDay: d.pricePerDay ?? 0,
    pricingMode: d.pricingMode ?? 'daily',
    totalAmount: d.totalAmount ?? 0,
    availableBalance: d.availableBalance ?? 0,
    canAfford: d.canAfford ?? false,
    fullDates: d.fullDates ?? [],
  };
}

/** §3.6: one campaign row, shared by every seller-facing ads endpoint that returns `AdsCampaignResponse`. */
export function mapAdsCampaign(d: AdsCampaignResponse): AdsCampaign {
  return {
    id: d.id ?? '',
    documentId: d.documentId ?? '',
    documentTitle: d.documentTitle ?? '',
    documentCoverUrl: resolvePublicUrl(d.documentCoverUrl),
    sellerId: d.sellerId ?? '',
    placementKey: d.placementKey ?? '',
    placementName: d.placementName ?? '',
    targetKey: d.targetKey ?? '*',
    targetLabel: d.targetLabel ?? null,
    startDate: d.startDate ?? '',
    endDate: d.endDate ?? '',
    dayCount: d.dayCount ?? 0,
    pricePerDay: d.pricePerDay ?? 0,
    totalAmount: d.totalAmount ?? 0,
    refundedAmount: d.refundedAmount ?? 0,
    status: toAdsCampaignStatus(d.status),
    stopReason: toAdsStopReason(d.stopReason),
    stopNote: d.stopNote ?? null,
    stoppedAt: d.stoppedAt ?? null,
    impressions: d.impressions ?? 0,
    clicks: d.clicks ?? 0,
    createdAt: d.createdAt ?? '',
  };
}

/** §3.6: `GET /api/seller/ads/campaigns/{id}` response = {@link AdsCampaign} + per-day stats. */
export function mapAdsCampaignDetail(d: AdsCampaignDetailResponse): AdsCampaignDetail {
  return {
    ...mapAdsCampaign(d),
    dailyStats: (d.dailyStats ?? []).map((s) => ({
      date: s.date ?? '',
      impressions: s.impressions ?? 0,
      clicks: s.clicks ?? 0,
    })),
  };
}

/** §3.11.1: the admin campaign list row = {@link AdsCampaign} + who owns it and their balance. */
export function mapAdminAdsCampaign(d: AdminAdsCampaignResponse): AdminAdsCampaign {
  return {
    ...mapAdsCampaign(d),
    sellerName: d.sellerName ?? '',
    sellerAvailableBalance: d.sellerAvailableBalance ?? 0,
  };
}


/**
 * Maps OpenAPI-generated types to the frontend domain models.
 * Keep this file OUTSIDE the generated `core/api/` folder.
 */

import type {
  AdminPendingDocumentResponse,
  AdminSellerResponse,
  AdminTransactionResponse,
  BundleDetailResponse,
  BundleResponse,
  CategoryResponse,
  CategoryDetailResponse,
  LibraryItemResponse,
  LoyaltyEntryResponse,
  LoyaltySummaryResponse,
  MarketplaceDocumentDetailResponse,
  MarketplaceDocumentResponse,
  OrderResponse,
  PlatformStatsResponse,
  SellerDashboardResponse,
  SellerDocumentResponse,
  SellerDocumentSummaryResponse,
  SellerInfoResponse,
  SellerQnaResponse,
  SubcategoryAdminResponse,
  SubcategoryResponse,
} from '../api';
import type {
  AdminTransaction,
  Bundle,
  Category,
  DocumentItem,
  DocumentReview,
  FileFormat,
  GradeLevel,
  LibraryItem,
  LoyaltyEntry,
  LoyaltySummary,
  Order,
  OrderStatus,
  PaymentMethod,
  PlatformStats,
  QnAItem,
  ResourceType,
  Seller,
  SellerQnaItem,
  SellerStats,
  Subcategory,
  SubcategoryAdmin,
} from '../models';
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
  };
}

export function mapAdminSellerCard(s: AdminSellerResponse): Seller {
  const name = s.studioName ?? s.ownerName ?? 'Seller';
  return {
    id: s.id ?? '',
    studioName: name,
    ownerName: s.ownerName ?? '',
    avatar: resolveAvatarUrl(s.avatarUrl),
    bio: s.email ? `ติดต่อ: ${s.email}` : '',
    joinedAt: s.joinedAt ?? new Date().toISOString(),
    rating: 0,
    totalSales: s.totalSales ?? 0,
    totalDocuments: s.totalDocuments ?? 0,
    followerCount: 0,
    responseHours: 0,
    badges: s.isVerified ? ['Verified'] : [],
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
    downloads: 0,
    status: 'approved',
    watermarkEnabled: false,
    previewPages: 0,
    seller: {
      ...emptySeller(),
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
    originalPrice: undefined,
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
    status: (d.status ?? 'pending') as DocumentItem['status'],
    watermarkEnabled: d.watermarkEnabled ?? false,
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
  };
}


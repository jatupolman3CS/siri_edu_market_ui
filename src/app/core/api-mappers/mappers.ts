/**
 * Maps OpenAPI-generated types to the frontend domain models.
 * Keep this file OUTSIDE the generated `core/api/` folder.
 */

import type {
  AdminPendingDocumentResponse,
  AdminSellerResponse,
  AdminTransactionResponse,
  BundleResponse,
  CategoryResponse,
  CategoryDetailResponse,
  LibraryItemResponse,
  MarketplaceDocumentDetailResponse,
  MarketplaceDocumentResponse,
  OrderResponse,
  SellerDashboardResponse,
  SellerDocumentResponse,
  SellerDocumentSummaryResponse,
  SellerInfoResponse,
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
  Order,
  OrderStatus,
  PaymentMethod,
  QnAItem,
  ResourceType,
  Seller,
  SellerStats,
  Subcategory,
} from '../models';
import { resolvePublicUrl } from '../api-runtime';

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

const EMPTY_SELLER: Seller = {
  id: '',
  studioName: '',
  ownerName: '',
  avatar: '',
  bio: '',
  joinedAt: new Date().toISOString(),
  rating: 0,
  totalSales: 0,
  totalDocuments: 0,
  followerCount: 0,
  responseHours: 0,
  badges: [],
};

export function mapSeller(s: SellerInfoResponse | undefined): Seller {
  if (!s) return EMPTY_SELLER;
  return {
    id: s.id ?? '',
    studioName: s.studioName ?? '',
    ownerName: s.ownerName ?? '',
    avatar: resolvePublicUrl(s.avatarUrl ?? ''),
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

export function mapCategoryDetail(c: CategoryDetailResponse): Category {
  return {
    id: c.id ?? '',
    name: c.name ?? '',
    slug: c.slug ?? '',
    icon: c.icon ?? '📚',
    color: c.color ?? '#F9A8D4',
    description: c.description ?? '',
    documentCount: c.documentCount ?? 0,
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
    cover: resolvePublicUrl(p.coverUrl ?? ''),
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
      ...EMPTY_SELLER,
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
    avatar: resolvePublicUrl(s.avatarUrl ?? ''),
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
  const cover = previews[0] ?? '';
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
      ...EMPTY_SELLER,
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
    buyerAvatar: '',
    rating: r.rating ?? 0,
    comment: r.comment ?? '',
    createdAt: r.createdAt ?? '',
    verified: false,
  }));

  const qna: QnAItem[] = (d.qna ?? []).map((q) => ({
    id: q.id ?? '',
    buyerName: q.buyerName ?? '',
    buyerAvatar: resolvePublicUrl(q.buyerAvatarUrl ?? ''),
    question: q.question ?? '',
    askedAt: q.askedAt ?? '',
    answer: q.answerText ? { text: q.answerText, answeredAt: q.answeredAt ?? '' } : undefined,
  }));

  const fromGallery = (d.galleryUrls ?? []).map((u) =>
    resolvePublicUrl((u ?? '').replaceAll('%2F', '/')),
  );
  const coverResolved = fromGallery[0] ?? '';
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
    cover: resolvePublicUrl(b.coverUrl ?? ''),
    price: b.price ?? 0,
    originalPrice: b.originalPrice ?? 0,
    documentIds: [],
    seller: {
      ...EMPTY_SELLER,
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

export function mapLibraryItem(item: LibraryItemResponse): LibraryItem {
  const docStub: DocumentItem = {
    id: item.documentId ?? '',
    slug: '',
    title: item.title ?? '',
    shortDescription: '',
    description: '',
    cover: resolvePublicUrl(item.coverUrl ?? ''),
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
    seller: EMPTY_SELLER,
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
        cover: resolvePublicUrl(item.coverUrl ?? ''),
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
        seller: EMPTY_SELLER,
        createdAt: o.createdAt ?? '',
        updatedAt: o.createdAt ?? '',
        reviews: [],
      },
      addedAt: o.createdAt ?? '',
      fromBundleId: item.bundleId ?? undefined,
    })),
    total: o.total ?? 0,
    status: (o.status ?? 'awaiting_payment') as OrderStatus,
    paymentMethod: (o.paymentMethod ?? 'promptpay') as PaymentMethod,
    createdAt: o.createdAt ?? '',
    paidAt: o.paidAt ?? undefined,
    paymentHints: o.paymentHints
      ? {
          omiseChargeId: o.paymentHints.omiseChargeId ?? undefined,
          promptPayQrImageUrl: o.paymentHints.promptPayQrImageUrl ?? undefined,
          trueMoneyAuthorizeUri: o.paymentHints.trueMoneyAuthorizeUri ?? undefined,
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
    paymentMethod: (t.paymentMethod ?? 'promptpay') as PaymentMethod,
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
  const coverUrl = gallery[0] ?? '';
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
    seller: EMPTY_SELLER,
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

/** List row only — cover thumbnail; no full gallery metadata (edit loads via GET by id). */
export function mapSellerDocumentSummary(d: SellerDocumentSummaryResponse): DocumentItem {
  const coverRaw = (d.coverUrl ?? '').trim();
  const cover = coverRaw ? resolvePublicUrl(coverRaw.replaceAll('%2F', '/')) : '';
  const gallery = cover ? [cover] : [];
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
    seller: EMPTY_SELLER,
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


import {
  mapOrder,
  mapDocument,
  mapDocumentDetail,
  mapLibraryItem,
  mapBundle,
  mapBundleDetail,
  mapSellerQna,
  mapCategory,
  mapCategoryDetail,
  mapSellerStats,
  mapPlatformStats,
} from './mappers';
import { defaultAvatarUrl, placeholderCoverUrl } from '../brand-assets';
import type {
  BundleDetailResponse,
  BundleResponse,
  CategoryDetailResponse,
  CategoryResponse,
  LibraryItemResponse,
  MarketplaceDocumentDetailResponse,
  MarketplaceDocumentResponse,
  OrderResponse,
  SellerDashboardResponse,
  SellerQnaResponse,
} from '../api/types.gen';

/**
 * The mappers sit between generated response types, where every field is optional, and the
 * domain models the templates bind to, where they are not. A wrong default here shows the
 * buyer a number the server never sent — which is exactly what BUG-01 was.
 */
describe('mapOrder', () => {
  const paidOrder: OrderResponse = {
    id: 'ord-1',
    orderNumber: 'SEM-2026-000123',
    total: 214,
    subTotal: 200,
    vatAmount: 14,
    status: 'paid',
    paymentMethod: 'promptpay',
    createdAt: '2026-08-24T10:00:00Z',
    paidAt: '2026-08-24T10:05:00Z',
    items: [],
  };

  it('BUG-01: keeps the VAT breakdown the server sent instead of recomputing it', () => {
    const order = mapOrder(paidOrder);

    expect(order.total).toBe(214);
    expect(order.subtotal).toBe(200);
    expect(order.vatAmount).toBe(14);
    // The total is VAT-inclusive: subtotal + VAT is the total, never total + VAT.
    expect(order.subtotal + order.vatAmount).toBe(order.total);
  });

  it('falls back to the total when the server sends no subtotal, rather than to zero', () => {
    const order = mapOrder({ ...paidOrder, subTotal: undefined });

    // Showing ฿0 before tax next to a ฿214 charge would read as a pricing bug to the buyer.
    expect(order.subtotal).toBe(214);
  });

  it('defaults the money fields to 0 rather than NaN or undefined', () => {
    const order = mapOrder({ id: 'ord-2' });

    expect(order.total).toBe(0);
    expect(order.subtotal).toBe(0);
    expect(order.vatAmount).toBe(0);
  });

  it('defaults an order with no status to awaiting payment, never to paid', () => {
    const order = mapOrder({ id: 'ord-3' });

    expect(order.status).toBe('awaiting_payment');
  });

  it('carries the payment hints through only when the server sent them', () => {
    expect(mapOrder(paidOrder).paymentHints).toBeUndefined();

    const withHints = mapOrder({
      ...paidOrder,
      paymentHints: { stripePaymentIntentId: 'pi_1', clientSecret: 'cs_1', awaitingWebhook: true },
    });

    expect(withHints.paymentHints?.stripePaymentIntentId).toBe('pi_1');
    expect(withHints.paymentHints?.clientSecret).toBe('cs_1');
    expect(withHints.paymentHints?.awaitingWebhook).toBe(true);
    // S-04: absent fields stay absent rather than becoming null, so `@if` in the template works.
    expect(withHints.paymentHints?.status).toBeUndefined();
  });

  it('tags an item bought as part of a bundle so the receipt can say so', () => {
    const order = mapOrder({
      ...paidOrder,
      items: [
        { documentId: 'doc-1', title: 'A', priceAtPurchase: 100, bundleId: 'bun-1' },
        { documentId: 'doc-2', title: 'B', priceAtPurchase: 100 },
      ],
    });

    expect(order.items[0].fromBundleId).toBe('bun-1');
    expect(order.items[1].fromBundleId).toBeUndefined();
    expect(order.items[0].document.price).toBe(100);
  });

  it('leaves paidAt undefined for an unpaid order', () => {
    const order = mapOrder({ ...paidOrder, status: 'awaiting_payment', paidAt: undefined });

    expect(order.paidAt).toBeUndefined();
  });
});

describe('mapDocument', () => {
  const doc: MarketplaceDocumentResponse = {
    id: 'doc-1',
    title: 'สรุปเคมี ม.6',
    price: 149,
  };

  it('marks a zero-price document as free', () => {
    expect(mapDocument({ ...doc, price: 0 }).isFree).toBe(true);
  });

  it('does not mark a priced document as free', () => {
    expect(mapDocument(doc).isFree).toBe(false);
  });

  it('defaults a missing price to 0 rather than NaN', () => {
    const mapped = mapDocument({ id: 'doc-2' });

    expect(mapped.price).toBe(0);
    expect(Number.isNaN(mapped.price)).toBe(false);
  });

  it('reads the real downloads count from the DTO instead of hardcoding 0', () => {
    expect(mapDocument({ ...doc, downloads: 238 }).downloads).toBe(238);
  });

  it('falls back to 0 when the DTO omits downloads', () => {
    expect(mapDocument({ ...doc, downloads: undefined }).downloads).toBe(0);
  });
});

describe('mapLibraryItem', () => {
  it('keeps the document id, which is what a download call is keyed on', () => {
    const item: LibraryItemResponse = {
      documentId: 'doc-9',
      title: 'ชีววิทยา',
      purchasedAt: '2026-08-01T00:00:00Z',
    };

    expect(mapLibraryItem(item).document.id).toBe('doc-9');
  });

  it('falls back to not-reviewed when the response omits isReviewed/myReviewId/myRating', () => {
    const item: LibraryItemResponse = {
      documentId: 'doc-9',
      title: 'ชีววิทยา',
      purchasedAt: '2026-08-01T00:00:00Z',
    };

    const mapped = mapLibraryItem(item);

    expect(mapped.isReviewed).toBe(false);
    expect(mapped.myReviewId).toBeUndefined();
    expect(mapped.myRating).toBeUndefined();
  });

  /** library-is-reviewed v1, AC-3/AC-10: real values flow through once a document is reviewed. */
  it('carries isReviewed/myReviewId/myRating through when the buyer has reviewed the document', () => {
    const item: LibraryItemResponse = {
      documentId: 'doc-9',
      title: 'ชีววิทยา',
      purchasedAt: '2026-08-01T00:00:00Z',
      isReviewed: true,
      myReviewId: 'rev-1',
      myRating: 4,
    };

    const mapped = mapLibraryItem(item);

    expect(mapped.isReviewed).toBe(true);
    expect(mapped.myReviewId).toBe('rev-1');
    expect(mapped.myRating).toBe(4);
  });
});

describe('mapBundle', () => {
  it('carries the bundle price through unchanged', () => {
    const bundle: BundleResponse = { id: 'bun-1', title: 'แพ็กรวม', price: 499 };

    expect(mapBundle(bundle).price).toBe(499);
  });

  // document-bundle-cross-sell v1 §3.1: `documentCount` is what the "N เอกสาร" pill reads —
  // `documentIds` stays `[]` because paged bundle responses never carry member document ids.
  it('maps documentCount from BundleResponse.documentCount, defaulting to 0', () => {
    const withCount: BundleResponse = { id: 'bun-1', title: 'แพ็กรวม', documentCount: 4 };
    const withoutCount: BundleResponse = { id: 'bun-2', title: 'แพ็กรวม 2' };

    expect(mapBundle(withCount).documentCount).toBe(4);
    expect(mapBundle(withoutCount).documentCount).toBe(0);
  });
});

/**
 * Q-04: `BundleDetailResponse` (from `GET /api/marketplace/bundles/{id}`) is the only response
 * that carries member `documents` — this is what the bundle-detail page must use instead of
 * `mapBundle`'s always-empty `documentIds` to stop rendering "0 เอกสารในแพ็กเกจ".
 */
describe('mapBundleDetail', () => {
  const detail: BundleDetailResponse = {
    id: 'bun-1',
    title: 'แพ็กคณิตศาสตร์',
    price: 199,
    originalPrice: 299,
    seller: { id: 'seller-1', studioName: 'ครูเอ', totalDocuments: 5 },
    documents: [
      { id: 'doc-1', title: 'เอกสาร 1', price: 100 },
      { id: 'doc-2', title: 'เอกสาร 2', price: 150 },
    ],
  };

  it('maps member documents through mapDocument', () => {
    const { documents } = mapBundleDetail(detail);

    expect(documents).toHaveLength(2);
    expect(documents[0].id).toBe('doc-1');
    expect(documents[0].title).toBe('เอกสาร 1');
  });

  it('derives documentIds/documentCount from the documents array rather than leaving them empty', () => {
    const { bundle } = mapBundleDetail(detail);

    expect(bundle.documentIds).toEqual(['doc-1', 'doc-2']);
    expect(bundle.documentCount).toBe(2);
  });

  it('maps the full seller info via mapSeller instead of the partial id/name pair mapBundle uses', () => {
    const { bundle } = mapBundleDetail(detail);

    expect(bundle.seller.studioName).toBe('ครูเอ');
    expect(bundle.seller.totalDocuments).toBe(5);
  });

  it('defaults to an empty documents array/list when the server sends none', () => {
    const { bundle, documents } = mapBundleDetail({ id: 'bun-2', title: 'แพ็กว่าง' });

    expect(documents).toEqual([]);
    expect(bundle.documentIds).toEqual([]);
    expect(bundle.documentCount).toBe(0);
  });
});

/**
 * document-faq-tab v1.1 §3.2/§4: `faqCount` / `qnaCount` / `qna[].isFaq` / `qna[].faqSortOrder`
 * are now real fields the backend always sends. `mapDocumentDetail` reads them directly — the
 * `?? 0` / `?? false` below are just defensive null-safety (matches every other field in this
 * mapper), not a stand-in for `qna.length` anymore.
 */
describe('mapDocumentDetail — FAQ fields (document-faq-tab v1.1)', () => {
  const base: MarketplaceDocumentDetailResponse = {
    id: 'doc-1',
    title: 'สรุปคณิต ม.6',
    qna: [
      { id: 'q-1', question: 'มีบทที่ 5 ไหม', askedAt: '2026-08-01T00:00:00Z', answerText: 'มีค่ะ', answeredAt: '2026-08-02T00:00:00Z' },
      { id: 'q-2', question: 'ไฟล์เป็น PDF ไหม', askedAt: '2026-08-03T00:00:00Z' },
    ],
  };

  it('defaults faqCount/qnaCount to 0 if the backend response omits them (defensive only)', () => {
    const mapped = mapDocumentDetail(base);

    expect(mapped.faqCount).toBe(0);
    expect(mapped.qnaCount).toBe(0);
  });

  it('defaults every qna item to isFaq:false if the backend response omits it (defensive only)', () => {
    const mapped = mapDocumentDetail(base);

    expect(mapped.qna?.every((q) => q.isFaq === false)).toBe(true);
  });

  it('uses the real faqCount/qnaCount once the backend sends them', () => {
    const mapped = mapDocumentDetail({
      ...base,
      ...({ faqCount: 1, qnaCount: 2 } as Partial<MarketplaceDocumentDetailResponse>),
    });

    expect(mapped.faqCount).toBe(1);
    expect(mapped.qnaCount).toBe(2);
  });

  it('carries a real isFaq:true through once the backend sends it', () => {
    const mapped = mapDocumentDetail({
      ...base,
      qna: [{ ...base.qna![0], ...({ isFaq: true } as Record<string, unknown>) }],
    });

    expect(mapped.qna?.[0].isFaq).toBe(true);
  });

  it('carries the real faqSortOrder through (v1.1 delta on DocumentQnaResponse)', () => {
    const mapped = mapDocumentDetail({
      ...base,
      qna: [{ ...base.qna![0], ...({ isFaq: true, faqSortOrder: 5 } as Record<string, unknown>) }],
    });

    expect(mapped.qna?.[0].faqSortOrder).toBe(5);
  });
});

describe('mapSellerQna (document-faq-tab v1 §3.3)', () => {
  const raw: SellerQnaResponse = {
    id: 'q-1',
    documentId: 'doc-1',
    documentTitle: 'สรุปคณิต ม.6',
    buyerName: 'น้องเอ',
    question: 'มีบทที่ 5 ไหม',
    askedAt: '2026-08-01T00:00:00Z',
    answerText: 'มีค่ะ',
    answeredAt: '2026-08-02T00:00:00Z',
  };

  it('defaults isFaq:false and faqSortOrder:0 if the backend response omits them (defensive only)', () => {
    const mapped = mapSellerQna(raw);

    expect(mapped.isFaq).toBe(false);
    expect(mapped.faqSortOrder).toBe(0);
  });

  it('carries the real isFaq/faqSortOrder through once the backend sends them', () => {
    const mapped = mapSellerQna({ ...raw, ...({ isFaq: true, faqSortOrder: 3 } as Record<string, unknown>) });

    expect(mapped.isFaq).toBe(true);
    expect(mapped.faqSortOrder).toBe(3);
  });

  it('keeps answerText/answeredAt null (not undefined) so `q.answerText` template checks stay stable', () => {
    const mapped = mapSellerQna({ id: 'q-2', question: 'ยังไม่ตอบ' });

    expect(mapped.answerText).toBeNull();
    expect(mapped.answeredAt).toBeNull();
  });
});

/**
 * Every image the UI renders is streamed out of R2 by the API, the fallbacks included. A mapper
 * that left `cover` or `avatar` empty put a broken image in the card, which is what the
 * third-party placehold.co / ui-avatars URLs used to paper over.
 */
describe('brand asset fallbacks', () => {
  it('gives a document with no gallery the R2 placeholder cover', () => {
    const doc = mapDocument({ id: 'doc-1', title: 'ไม่มีรูป' } as MarketplaceDocumentResponse);

    expect(doc.cover).toBe(placeholderCoverUrl());
    // The placeholder is a fallback for display only — it must not be mistaken for a real image.
    expect(doc.gallery).toEqual([]);
    expect(doc.cover).toContain('/api/files/download/');
  });

  it('gives a document whose seller has no picture the R2 default avatar', () => {
    const doc = mapDocument({ id: 'doc-1', sellerName: 'ครูพิม' } as MarketplaceDocumentResponse);

    expect(doc.seller.avatar).toBe(defaultAvatarUrl());
  });

  it('keeps the real cover when the server sent one', () => {
    const doc = mapDocument({
      id: 'doc-1',
      galleryPreviewUrls: ['/api/files/download/seller/cover.png'],
    } as MarketplaceDocumentResponse);

    expect(doc.cover).not.toBe(placeholderCoverUrl());
    expect(doc.cover).toContain('seller/cover.png');
  });
});

/**
 * real-data-stats v1 §3.1 (round 2 — SDK wired) — `CategoryResponse.subcategoryCount` (active
 * subcategory count, computed server-side, 1 query, no N+1).
 */
describe('mapCategory (real-data-stats v1 §3.1 — subcategoryCount)', () => {
  const base: CategoryResponse = {
    id: 'cat-1',
    name: 'การศึกษา',
    slug: 'education',
    icon: '📚',
    color: '#F9A8D4',
    description: 'หมวดการศึกษา',
    documentCount: 120,
  };

  it('reads subcategoryCount from the response', () => {
    const category = mapCategory({ ...base, subcategoryCount: 7 });

    expect(category.subcategoryCount).toBe(7);
  });

  it('leaves subcategoryCount undefined when the backend omits it (defensive)', () => {
    const category = mapCategory(base);

    expect(category.subcategoryCount).toBeUndefined();
  });
});

/**
 * real-data-stats v1 §3.2 (round 2 — SDK wired) — `CategoryDetailResponse.averageRating` /
 * `.reviewCount`. `averageRating` must stay `undefined` when the backend reports zero reviews
 * (`null`) — AC-EPIC-3: never show "0 ★".
 */
describe('mapCategoryDetail (real-data-stats v1 §3.2 — averageRating/reviewCount)', () => {
  const base: CategoryDetailResponse = {
    id: 'cat-1',
    name: 'การศึกษา',
    slug: 'education',
    icon: '📚',
    color: '#F9A8D4',
    description: 'หมวดการศึกษา',
    documentCount: 10,
    subcategories: [],
  };

  it('reads averageRating/reviewCount from the response', () => {
    const category = mapCategoryDetail({ ...base, averageRating: 4.8, reviewCount: 132 });

    expect(category.averageRating).toBe(4.8);
    expect(category.reviewCount).toBe(132);
  });

  it('AC-EPIC-3: surfaces a null averageRating (zero reviews) as undefined, never 0', () => {
    const category = mapCategoryDetail({ ...base, averageRating: null, reviewCount: 0 });

    expect(category.averageRating).toBeUndefined();
    expect(category.reviewCount).toBe(0);
  });

  it('defaults reviewCount to 0 and leaves averageRating undefined when the backend sends neither (defensive)', () => {
    const category = mapCategoryDetail(base);

    expect(category.averageRating).toBeUndefined();
    expect(category.reviewCount).toBe(0);
  });
});

/**
 * real-data-stats v1 §3.4 (round 2 — SDK wired) — `SellerDashboardResponse.revenueTrendPercent`
 * / `.ratingTrendDelta`. Both must stay `undefined` (hide the trend badge) rather than `0`
 * ("+0%" would misleadingly read as "no change" instead of "cannot be computed").
 */
describe('mapSellerStats (real-data-stats v1 §3.4 — trend fields)', () => {
  const base: SellerDashboardResponse = {
    totalRevenue: 100000,
    monthlyRevenue: 20000,
    totalDownloads: 500,
    monthlyDownloads: 0,
    averageRating: 4.7,
    totalReviews: 40,
    pendingPayout: 5000,
    activeListings: 12,
    pendingApproval: 1,
    followerCount: 80,
    newFollowersThisMonth: 3,
    revenueByMonth: [],
    topCategories: [],
  };

  it('reads the trend fields from the response', () => {
    const stats = mapSellerStats({ ...base, revenueTrendPercent: 18.4, ratingTrendDelta: -0.12 });

    expect(stats.revenueTrendPercent).toBe(18.4);
    expect(stats.ratingTrendDelta).toBe(-0.12);
  });

  it('AC-EPIC-3: surfaces a null trend (no baseline) as undefined, never 0', () => {
    const stats = mapSellerStats({ ...base, revenueTrendPercent: null, ratingTrendDelta: null });

    expect(stats.revenueTrendPercent).toBeUndefined();
    expect(stats.ratingTrendDelta).toBeUndefined();
  });

  it('leaves both undefined when the backend omits them (defensive)', () => {
    const stats = mapSellerStats(base);

    expect(stats.revenueTrendPercent).toBeUndefined();
    expect(stats.ratingTrendDelta).toBeUndefined();
  });
});

/**
 * real-data-stats v1 §3.3/§4.1 — `mapPlatformStats` maps `PlatformStatsResponse` from
 * `GET /api/marketplace/stats`. `averageRating` / `positiveReviewPercent` must stay `undefined`
 * when the backend reports zero reviews (`null`), never `0` — AC-EPIC-3.
 */
describe('mapPlatformStats (real-data-stats v1 §3.3/§4.1)', () => {
  it('maps every field when the backend sends full data', () => {
    const stats = mapPlatformStats({
      totalApprovedDocuments: 12500,
      totalSellers: 3200,
      totalDownloads: 98000,
      reviewCount: 8400,
      averageRating: 4.9,
      positiveReviewPercent: 98,
      feeRatePercent: 10,
    });

    expect(stats).toEqual({
      totalApprovedDocuments: 12500,
      totalSellers: 3200,
      totalDownloads: 98000,
      reviewCount: 8400,
      averageRating: 4.9,
      positiveReviewPercent: 98,
      feeRatePercent: 10,
    });
  });

  it('surfaces null averageRating/positiveReviewPercent (no reviews yet) as undefined, never 0', () => {
    const stats = mapPlatformStats({
      totalApprovedDocuments: 0,
      totalSellers: 0,
      totalDownloads: 0,
      reviewCount: 0,
      averageRating: null,
      positiveReviewPercent: null,
      feeRatePercent: 10,
    });

    expect(stats.averageRating).toBeUndefined();
    expect(stats.positiveReviewPercent).toBeUndefined();
  });

  it('defaults the required counters to 0 when the server sends nothing (defensive)', () => {
    const stats = mapPlatformStats({});

    expect(stats.totalApprovedDocuments).toBe(0);
    expect(stats.totalSellers).toBe(0);
    expect(stats.totalDownloads).toBe(0);
    expect(stats.reviewCount).toBe(0);
    expect(stats.feeRatePercent).toBe(0);
    expect(stats.averageRating).toBeUndefined();
    expect(stats.positiveReviewPercent).toBeUndefined();
  });
});

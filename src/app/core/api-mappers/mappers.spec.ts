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
  mapReferralSummary,
  mapReferralCodeValidation,
  mapExamHubPage,
  mapLineConnectionStatus,
} from './mappers';
import { defaultAvatarUrl, placeholderCoverUrl } from '../brand-assets';
import { DEFAULT_STORE_READINESS } from '../models';
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

  it('maps discountAmount from server or defaults to 0', () => {
    const withDiscount = mapOrder({ ...paidOrder, discountAmount: 20 } as unknown as OrderResponse);
    expect(withDiscount.discountAmount).toBe(20);

    const withSnakeDiscount = mapOrder({ ...paidOrder, discount_amount: 15 } as unknown as OrderResponse);
    expect(withSnakeDiscount.discountAmount).toBe(15);

    const noDiscount = mapOrder(paidOrder);
    expect(noDiscount.discountAmount).toBe(0);
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

  /** library-read-progress v1 §4: falls back to not-read when response omits isRead/markedReadAt */
  it('falls back to not-read when the response omits isRead/markedReadAt', () => {
    const item: LibraryItemResponse = {
      documentId: 'doc-9',
      title: 'ชีววิทยา',
      purchasedAt: '2026-08-01T00:00:00Z',
    };

    const mapped = mapLibraryItem(item);

    expect(mapped.isRead).toBe(false);
    expect(mapped.markedReadAt).toBeUndefined();
  });

  /** library-read-progress v1 §4: carries isRead/markedReadAt through when present */
  it('carries isRead/markedReadAt through when the response has them', () => {
    const item: LibraryItemResponse = {
      documentId: 'doc-9',
      title: 'ชีววิทยา',
      purchasedAt: '2026-08-01T00:00:00Z',
      ...({ isRead: true, markedReadAt: '2026-09-08T12:00:00Z' } as any),
    };

    const mapped = mapLibraryItem(item);

    expect(mapped.isRead).toBe(true);
    expect(mapped.markedReadAt).toBe('2026-09-08T12:00:00Z');
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

/**
 * subscription-membership v2 §3.7 (round 1 stub — awaiting SDK regen):
 * `MarketplaceDocumentDetailResponse.isAccessibleViaActiveSubscription`.
 */
describe('mapDocumentDetail — isAccessibleViaActiveSubscription (subscription-membership v2)', () => {
  const base: MarketplaceDocumentDetailResponse = {
    id: 'doc-1',
    title: 'สรุปคณิต ม.6',
  };

  it('defaults to false when the backend response omits the field (round 1, not wired yet)', () => {
    const mapped = mapDocumentDetail(base);

    expect(mapped.isAccessibleViaActiveSubscription).toBe(false);
  });

  it('carries the real value through once the backend sends it', () => {
    const mapped = mapDocumentDetail({
      ...base,
      ...({ isAccessibleViaActiveSubscription: true } as Partial<MarketplaceDocumentDetailResponse>),
    });

    expect(mapped.isAccessibleViaActiveSubscription).toBe(true);
  });
});

describe('mapDocumentDetail — isAutoGenerated (category-content-auto-generation v2 / AI-11 AC-3)', () => {
  const base: MarketplaceDocumentDetailResponse = {
    id: 'doc-1',
    title: 'แนะนำหมวดหมู่: คณิตศาสตร์',
  };

  it('defaults to false when isAutoGenerated is omitted or undefined', () => {
    const mapped = mapDocumentDetail(base);
    expect(mapped.isAutoGenerated).toBe(false);
  });

  it('carries true when isAutoGenerated is true from the backend', () => {
    const mapped = mapDocumentDetail({
      ...base,
      isAutoGenerated: true,
    });
    expect(mapped.isAutoGenerated).toBe(true);
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
 * subscription-membership v2 §3.1 (round 1 stub — awaiting SDK regen):
 * `CategoryResponse.subscriptionMonthlyPrice`.
 */
describe('mapCategory (subscription-membership v2 §3.1 — subscriptionMonthlyPrice)', () => {
  const base: CategoryResponse = {
    id: 'cat-1',
    name: 'การศึกษา',
    slug: 'education',
    icon: '📚',
    color: '#F9A8D4',
    description: 'หมวดการศึกษา',
    documentCount: 120,
  };

  it('reads subscriptionMonthlyPrice from the response once the backend sends it', () => {
    const category = mapCategory({
      ...base,
      ...({ subscriptionMonthlyPrice: 199 } as Partial<CategoryResponse>),
    });

    expect(category.subscriptionMonthlyPrice).toBe(199);
  });

  it('defaults to null when the backend omits it (round 1, not wired yet)', () => {
    const category = mapCategory(base);

    expect(category.subscriptionMonthlyPrice).toBeNull();
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
 * store-readiness-score v1 §3.2/§4 (round 2 — SDK wired) — `mapSellerStats` reads
 * `SellerDashboardResponse.storeReadiness` via `mapStoreReadiness`. Falls back to
 * `DEFAULT_STORE_READINESS` only when the backend omits the field entirely (defensive).
 */
describe('mapSellerStats (store-readiness-score v1 §3.2/§4 — storeReadiness field)', () => {
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

  it('AC-4/AC-6: maps percentComplete/isComplete/items/nextActionItemKey and per-item currentCount/targetCount', () => {
    const stats = mapSellerStats({
      ...base,
      storeReadiness: {
        percentComplete: 67,
        isComplete: false,
        nextActionItemKey: 'listings',
        items: [
          {
            key: 'payout_account',
            label: 'ตั้งค่าบัญชีรับเงิน',
            done: true,
            actionLabel: 'ตั้งค่าบัญชีรับเงิน',
            actionRoute: '/seller/settings',
            currentCount: null,
            targetCount: null,
          },
          {
            key: 'profile_picture',
            label: 'อัปโหลดรูปโปรไฟล์ร้าน',
            done: true,
            actionLabel: 'อัปโหลดรูปโปรไฟล์',
            actionRoute: '/seller/settings',
            currentCount: null,
            targetCount: null,
          },
          {
            key: 'listings',
            label: 'อัปโหลดเอกสารอย่างน้อย 3 ชิ้น',
            done: false,
            actionLabel: 'อัปโหลดเอกสาร',
            actionRoute: '/seller/upload',
            currentCount: 1,
            targetCount: 3,
          },
        ],
      },
    });

    expect(stats.storeReadiness).toEqual({
      percentComplete: 67,
      isComplete: false,
      nextActionItemKey: 'listings',
      items: [
        {
          key: 'payout_account',
          label: 'ตั้งค่าบัญชีรับเงิน',
          done: true,
          actionLabel: 'ตั้งค่าบัญชีรับเงิน',
          actionRoute: '/seller/settings',
          currentCount: undefined,
          targetCount: undefined,
        },
        {
          key: 'profile_picture',
          label: 'อัปโหลดรูปโปรไฟล์ร้าน',
          done: true,
          actionLabel: 'อัปโหลดรูปโปรไฟล์',
          actionRoute: '/seller/settings',
          currentCount: undefined,
          targetCount: undefined,
        },
        {
          key: 'listings',
          label: 'อัปโหลดเอกสารอย่างน้อย 3 ชิ้น',
          done: false,
          actionLabel: 'อัปโหลดเอกสาร',
          actionRoute: '/seller/upload',
          currentCount: 1,
          targetCount: 3,
        },
      ],
    });
  });

  it('AC-5: maps isComplete=true / nextActionItemKey=null at 100%', () => {
    const stats = mapSellerStats({
      ...base,
      storeReadiness: {
        percentComplete: 100,
        isComplete: true,
        nextActionItemKey: null,
        items: [],
      },
    });

    expect(stats.storeReadiness.percentComplete).toBe(100);
    expect(stats.storeReadiness.isComplete).toBe(true);
    expect(stats.storeReadiness.nextActionItemKey).toBeNull();
  });

  it('falls back to DEFAULT_STORE_READINESS when the backend omits storeReadiness entirely (defensive)', () => {
    const stats = mapSellerStats(base);

    expect(stats.storeReadiness).toEqual(DEFAULT_STORE_READINESS);
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

describe('mapReferralSummary', () => {
  it('maps summary correctly from server payload', () => {
    const summary = mapReferralSummary({
      code: 'ABCD2345',
      shareUrl: 'http://localhost:4200/marketplace?ref=ABCD2345',
      totalReferred: 3,
      unusedCreditCount: 2,
      unusedCreditTotal: 40,
    });

    expect(summary).toEqual({
      code: 'ABCD2345',
      shareUrl: 'http://localhost:4200/marketplace?ref=ABCD2345',
      totalReferred: 3,
      unusedCreditCount: 2,
      unusedCreditTotal: 40,
    });
  });

  it('handles snake_case fields and missing defaults', () => {
    const summary = mapReferralSummary({
      code: 'WXYZ6789',
      share_url: 'http://localhost:4200/marketplace?ref=WXYZ6789',
      total_referred: 1,
      unused_credit_count: 1,
      unused_credit_total: 20,
    });

    expect(summary.code).toBe('WXYZ6789');
    expect(summary.shareUrl).toBe('http://localhost:4200/marketplace?ref=WXYZ6789');
    expect(summary.totalReferred).toBe(1);
    expect(summary.unusedCreditCount).toBe(1);
    expect(summary.unusedCreditTotal).toBe(20);

    const empty = mapReferralSummary({});
    expect(empty.code).toBe('');
    expect(empty.shareUrl).toBe('');
    expect(empty.totalReferred).toBe(0);
    expect(empty.unusedCreditCount).toBe(0);
    expect(empty.unusedCreditTotal).toBe(0);
  });
});

describe('mapReferralCodeValidation', () => {
  it('maps valid code response correctly', () => {
    const valid = mapReferralCodeValidation({
      valid: true,
      discountAmount: 20,
      reasonText: null,
    });

    expect(valid.valid).toBe(true);
    expect(valid.discountAmount).toBe(20);
    expect(valid.reasonText).toBeUndefined();
  });

  it('maps invalid code response correctly', () => {
    const invalid = mapReferralCodeValidation({
      valid: false,
      reasonText: 'ใช้โค้ดแนะนำเพื่อนของตัวเองไม่ได้',
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.discountAmount).toBeUndefined();
    expect(invalid.reasonText).toBe('ใช้โค้ดแนะนำเพื่อนของตัวเองไม่ได้');
  });

  it('handles snake_case fallback for validation', () => {
    const snakeValid = mapReferralCodeValidation({
      valid: true,
      discount_amount: 20,
    });
    expect(snakeValid.discountAmount).toBe(20);

    const snakeInvalid = mapReferralCodeValidation({
      valid: false,
      reason_text: 'ไม่พบโค้ดแนะนำเพื่อนนี้',
    });
    expect(snakeInvalid.reasonText).toBe('ไม่พบโค้ดแนะนำเพื่อนนี้');
  });
});

describe('mapExamHubPage', () => {
  it('maps complete exam hub page response correctly', () => {
    const page = mapExamHubPage({
      examType: 'tgat-tpat',
      title: 'TGAT/TPAT — เตรียมสอบวัดความถนัด',
      metaDescription: 'รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท',
      introText: 'รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท ครบถ้วน',
      examDateInfo: '10-12 ธันวาคม 2569',
      scoreCriteriaInfo: 'ใช้คะแนนยื่น TCAS รอบ 2 และ 3',
      trendInfo: 'เน้นข้อสอบประยุกต์และ Critical Thinking',
      updatedAt: '2026-09-08T12:00:00.000Z',
    });

    expect(page.examType).toBe('tgat-tpat');
    expect(page.title).toBe('TGAT/TPAT — เตรียมสอบวัดความถนัด');
    expect(page.metaDescription).toBe('รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท');
    expect(page.introText).toBe('รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท ครบถ้วน');
    expect(page.examDateInfo).toBe('10-12 ธันวาคม 2569');
    expect(page.scoreCriteriaInfo).toBe('ใช้คะแนนยื่น TCAS รอบ 2 และ 3');
    expect(page.trendInfo).toBe('เน้นข้อสอบประยุกต์และ Critical Thinking');
    expect(page.updatedAt).toBe('2026-09-08T12:00:00.000Z');
  });

  it('handles snake_case fields and default fallbacks', () => {
    const page = mapExamHubPage({
      exam_type: 'a-level',
      title: 'A-Level',
      meta_description: 'A-Level desc',
      intro_text: 'A-Level intro',
      exam_date_info: null,
      score_criteria_info: undefined,
      trend_info: null,
      updated_at: null,
    });

    expect(page.examType).toBe('a-level');
    expect(page.title).toBe('A-Level');
    expect(page.metaDescription).toBe('A-Level desc');
    expect(page.introText).toBe('A-Level intro');
    expect(page.examDateInfo).toBeUndefined();
    expect(page.scoreCriteriaInfo).toBeUndefined();
    expect(page.trendInfo).toBeUndefined();
    expect(page.updatedAt).toBeUndefined();
  });

  it('handles null/empty raw object gracefully', () => {
    const page = mapExamHubPage(null);

    expect(page.examType).toBe('tcas');
    expect(page.title).toBe('');
    expect(page.metaDescription).toBe('');
    expect(page.introText).toBe('');
    expect(page.examDateInfo).toBeUndefined();
  });
});

describe('mapLineConnectionStatus', () => {
  it('maps a complete Connected response', () => {
    const status = mapLineConnectionStatus({
      isAvailable: true,
      isConnected: true,
      status: 'Connected',
      lineDisplayName: 'สมชาย ใจดี',
      connectedAt: '2026-09-08T00:00:00.000Z',
    });

    expect(status).toEqual({
      isAvailable: true,
      isConnected: true,
      status: 'Connected',
      lineDisplayName: 'สมชาย ใจดี',
      connectedAt: '2026-09-08T00:00:00.000Z',
    });
  });

  it('§1 item 8: isAvailable:false maps through as-is (not forced to NotConnected)', () => {
    const status = mapLineConnectionStatus({
      isAvailable: false,
      isConnected: false,
      status: 'NotConnected',
      lineDisplayName: null,
      connectedAt: null,
    });

    expect(status.isAvailable).toBe(false);
  });

  it('§3.7: maps Disconnected (auto-flip on push error) through as-is', () => {
    const status = mapLineConnectionStatus({
      isAvailable: true,
      isConnected: false,
      status: 'Disconnected',
      lineDisplayName: 'สมชาย ใจดี',
      connectedAt: '2026-09-08T00:00:00.000Z',
    });

    expect(status.status).toBe('Disconnected');
  });

  it('defaults every missing/unexpected field to a safe value', () => {
    const status = mapLineConnectionStatus({});

    expect(status).toEqual({
      isAvailable: false,
      isConnected: false,
      status: 'NotConnected',
      lineDisplayName: null,
      connectedAt: null,
    });
  });

  it('defaults an unrecognized status string to NotConnected (defensive — §3.3 says only 3 values exist)', () => {
    const status = mapLineConnectionStatus({ status: 'SomethingUnexpected' });

    expect(status.status).toBe('NotConnected');
  });
});

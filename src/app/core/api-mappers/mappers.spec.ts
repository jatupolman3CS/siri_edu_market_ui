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
  mapAffiliateSummary,
  mapAffiliateClickResult,
  mapAdminAffiliateSummary,
  mapWalletSummary,
  mapWalletEntry,
  mapWalletTopUp,
  mapAdminWalletSummary,
  mapBoughtTogetherItem,
  mapAdminMlRecommendationOverview,
  mapSellerDocument,
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
  SellerDocumentResponse,
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

  /** document-versioning-fe: falls back to safe defaults when version fields are omitted */
  it('falls back to hasNewVersion=false and undefined versions when omitted', () => {
    const item: LibraryItemResponse = {
      documentId: 'doc-10',
      title: 'เคมีเบื้องต้น',
      purchasedAt: '2026-08-01T00:00:00Z',
    };

    const mapped = mapLibraryItem(item);

    expect(mapped.hasNewVersion).toBe(false);
    expect(mapped.currentVersionNumber).toBeUndefined();
    expect(mapped.latestChangeNote).toBeNull();
  });

  /** document-versioning-fe: carries hasNewVersion/currentVersionNumber/latestChangeNote through */
  it('carries hasNewVersion/currentVersionNumber/latestChangeNote through when present', () => {
    const raw = {
      documentId: 'doc-10',
      title: 'เคมีเบื้องต้น',
      purchasedAt: '2026-08-01T00:00:00Z',
      hasNewVersion: true,
      currentVersionNumber: 2,
      latestChangeNote: 'ปรับปรุงเนื้อหาบทที่ 3',
    };

    const mapped = mapLibraryItem(raw as unknown as LibraryItemResponse);

    expect(mapped.hasNewVersion).toBe(true);
    expect(mapped.currentVersionNumber).toBe(2);
    expect(mapped.latestChangeNote).toBe('ปรับปรุงเนื้อหาบทที่ 3');
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

  /**
   * preview-rasters-to-r2 v1 §4.1 / AC-17 (docs/contracts/preview-rasters-to-r2.md) — supersedes
   * the `document-preview-access-fixes` v1 pinning of `/Previews/...` static paths. Page rasters
   * now live on R2 and the backend hands them over as a ready-made download URL
   * (`/api/files/download/{sellerId}/previews/{docId}/page-N.jpg?v={epoch}`). What this test
   * protects is that the mapper passes that URL through untouched: no second
   * `/api/files/download/` prefix on top of the one already there, and no fall back to the
   * placeholder icon the buyer-side fix exists to remove.
   */
  it('keeps a download-URL raster cover intact instead of falling back to the placeholder', () => {
    const doc = mapDocument({
      id: 'doc-1',
      galleryPreviewUrls: [
        '/api/files/download/3f2504e0-4f89-11d3-9a0c-0305e82c3301/previews/2c670625a7194445948a3f105204332a/page-1.jpg?v=1789990769',
      ],
    } as MarketplaceDocumentResponse);

    expect(doc.cover).not.toBe(placeholderCoverUrl());
    expect(doc.cover).toContain('/api/files/download/');
    expect(doc.cover).toContain('/previews/2c670625a7194445948a3f105204332a/page-1.jpg');
    expect(doc.cover).not.toContain('/api/files/download/api/files/download/');
    expect(doc.cover).toContain('v=1789990769');
  });

  it('keeps every raster download URL in the detail gallery', () => {
    const detail = mapDocumentDetail({
      id: 'doc-1',
      title: 'ไม่มีแกลเลอรี',
      galleryUrls: [
        '/api/files/download/3f2504e0-4f89-11d3-9a0c-0305e82c3301/previews/2c670625a7194445948a3f105204332a/page-1.jpg?v=1789990769',
        '/api/files/download/3f2504e0-4f89-11d3-9a0c-0305e82c3301/previews/2c670625a7194445948a3f105204332a/page-2.jpg?v=1789990769',
      ],
    } as MarketplaceDocumentDetailResponse);

    expect(detail.gallery).toHaveLength(2);
    expect(detail.cover).toBe(detail.gallery[0]);
    for (const url of detail.gallery) {
      expect(url).toContain('/api/files/download/');
      expect(url).toContain('/previews/2c670625a7194445948a3f105204332a/');
      expect(url).not.toContain('/api/files/download/api/files/download/');
      expect(url).toContain('v=1789990769');
    }
  });
});

/**
 * marketplace-cover-preview-count v1 §0 item 6 / AC-14 (docs/contracts/marketplace-cover-preview-count.md)
 * — `mapDocument()` used to hardcode `previewPages: 0`, which is why the "ลองฟรี" badge on the
 * compact document card never showed even for documents with real free previews. Wired round:
 * `previewPages` is now a real field on the generated `MarketplaceDocumentResponse` type (SDK
 * regenerated against the backend that sends it).
 */
describe('mapDocument (marketplace-cover-preview-count v1 AC-14 — previewPages)', () => {
  it('reads previewPages from the response once the backend sends it', () => {
    const doc = mapDocument({
      id: 'doc-1',
      previewPages: 4,
    } as MarketplaceDocumentResponse);

    expect(doc.previewPages).toBe(4);
  });

  it('defaults to 0 when the backend omits it', () => {
    const doc = mapDocument({ id: 'doc-1' } as MarketplaceDocumentResponse);

    expect(doc.previewPages).toBe(0);
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

describe('mapAffiliateSummary', () => {
  it('maps complete payload correctly', () => {
    const raw = {
      code: 'AFF12345',
      shareUrl: 'http://localhost:4200/marketplace?aff=AFF12345',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 15,
      totalConversions: 3,
      commissionEarnedTotal: 300,
    };

    const mapped = mapAffiliateSummary(raw);

    expect(mapped.code).toBe('AFF12345');
    expect(mapped.shareUrl).toBe('http://localhost:4200/marketplace?aff=AFF12345');
    expect(mapped.commissionRatePercent).toBe(10);
    expect(mapped.isActive).toBe(true);
    expect(mapped.totalClicks).toBe(15);
    expect(mapped.totalConversions).toBe(3);
    expect(mapped.commissionEarnedTotal).toBe(300);
  });

  it('falls back to safe defaults when optional fields are missing', () => {
    const mapped = mapAffiliateSummary({ code: '', shareUrl: '' });

    expect(mapped.code).toBe('');
    expect(mapped.shareUrl).toBe('');
    expect(mapped.commissionRatePercent).toBe(0);
    expect(mapped.isActive).toBe(true);
    expect(mapped.totalClicks).toBe(0);
    expect(mapped.totalConversions).toBe(0);
    expect(mapped.commissionEarnedTotal).toBe(0);
  });
});

describe('mapAffiliateClickResult', () => {
  it('maps valid response correctly', () => {
    const raw = {
      clickToken: 'tok-abc-123',
      expiresAt: '2026-10-15T00:00:00.000Z',
    };

    const mapped = mapAffiliateClickResult(raw);

    expect(mapped.clickToken).toBe('tok-abc-123');
    expect(mapped.expiresAt).toBe('2026-10-15T00:00:00.000Z');
  });

  it('defaults fields to empty strings when missing', () => {
    const mapped = mapAffiliateClickResult({ clickToken: '', expiresAt: '' });

    expect(mapped.clickToken).toBe('');
    expect(mapped.expiresAt).toBe('');
  });
});

describe('mapAdminAffiliateSummary', () => {
  it('maps complete admin affiliate payload correctly', () => {
    const raw = {
      userId: 'usr-1',
      displayName: 'สมชาย นักแชร์',
      email: 'somchai@example.com',
      code: 'AFF100',
      commissionRatePercent: 12,
      isActive: true,
      totalClicks: 50,
      totalConversions: 10,
      commissionEarnedTotal: 1500,
    };

    const mapped = mapAdminAffiliateSummary(raw);

    expect(mapped.userId).toBe('usr-1');
    expect(mapped.displayName).toBe('สมชาย นักแชร์');
    expect(mapped.email).toBe('somchai@example.com');
    expect(mapped.code).toBe('AFF100');
    expect(mapped.commissionRatePercent).toBe(12);
    expect(mapped.isActive).toBe(true);
    expect(mapped.totalClicks).toBe(50);
    expect(mapped.totalConversions).toBe(10);
    expect(mapped.commissionEarnedTotal).toBe(1500);
  });

  it('falls back to defaults when optional fields are missing', () => {
    const mapped = mapAdminAffiliateSummary({ userId: '', displayName: '', email: '', code: '' });

    expect(mapped.userId).toBe('');
    expect(mapped.displayName).toBe('');
    expect(mapped.email).toBe('');
    expect(mapped.code).toBe('');
    expect(mapped.commissionRatePercent).toBe(0);
    expect(mapped.isActive).toBe(true);
    expect(mapped.totalClicks).toBe(0);
    expect(mapped.totalConversions).toBe(0);
    expect(mapped.commissionEarnedTotal).toBe(0);
  });

  // referral-program v3 §1.6/§3.10 (AC-39): commissionRatePercentOverride is the raw override —
  // distinct from the effective `commissionRatePercent` above — and must round-trip both when set
  // and when absent.
  it('maps commissionRatePercentOverride when present', () => {
    const raw = {
      userId: 'usr-1',
      displayName: 'สมชาย นักแชร์',
      email: 'somchai@example.com',
      code: 'AFF100',
      commissionRatePercent: 12,
      commissionRatePercentOverride: 8.5,
      isActive: true,
      totalClicks: 50,
      totalConversions: 10,
      commissionEarnedTotal: 1500,
    };

    const mapped = mapAdminAffiliateSummary(raw);

    expect(mapped.commissionRatePercentOverride).toBe(8.5);
  });

  it('maps commissionRatePercentOverride to null when absent (no override set)', () => {
    const mapped = mapAdminAffiliateSummary({ userId: '', displayName: '', email: '', code: '' });

    expect(mapped.commissionRatePercentOverride).toBeNull();
  });
});

describe('mapWalletSummary', () => {
  it('maps every field from the response', () => {
    const summary = mapWalletSummary({
      balance: 250.5,
      asOf: '2026-09-15T12:00:00.000Z',
    });

    expect(summary).toEqual({
      balance: 250.5,
      asOf: '2026-09-15T12:00:00.000Z',
    });
  });

  it('defaults missing balance to 0 and provides default asOf ISO string', () => {
    const summary = mapWalletSummary({});

    expect(summary.balance).toBe(0);
    expect(summary.asOf).toBeTruthy();
  });
});

describe('mapWalletEntry', () => {
  it('maps a topup entry', () => {
    const entry = mapWalletEntry({
      id: 'entry-topup-1',
      kind: 'topup',
      amount: 100,
      reason: 'wallet_topup',
      occurredAt: '2026-09-15T12:00:00.000Z',
    });

    expect(entry).toEqual({
      id: 'entry-topup-1',
      kind: 'topup',
      amount: 100,
      reason: 'wallet_topup',
      orderNumber: undefined,
      occurredAt: '2026-09-15T12:00:00.000Z',
    });
  });

  it('maps a purchase entry with orderNumber', () => {
    const entry = mapWalletEntry({
      id: 'entry-purchase-1',
      kind: 'purchase',
      amount: -50,
      reason: 'order_paid_by_wallet',
      orderNumber: 'ORD-2026-001',
      occurredAt: '2026-09-15T12:10:00.000Z',
    });

    expect(entry).toEqual({
      id: 'entry-purchase-1',
      kind: 'purchase',
      amount: -50,
      reason: 'order_paid_by_wallet',
      orderNumber: 'ORD-2026-001',
      occurredAt: '2026-09-15T12:10:00.000Z',
    });
  });

  it('maps a refund entry', () => {
    const entry = mapWalletEntry({
      id: 'entry-refund-1',
      kind: 'refund',
      amount: 50,
      reason: 'order_refunded_to_wallet',
      orderNumber: 'ORD-2026-001',
      occurredAt: '2026-09-15T12:20:00.000Z',
    });

    expect(entry).toEqual({
      id: 'entry-refund-1',
      kind: 'refund',
      amount: 50,
      reason: 'order_refunded_to_wallet',
      orderNumber: 'ORD-2026-001',
      occurredAt: '2026-09-15T12:20:00.000Z',
    });
  });

  it('falls back to topup kind and 0 amount on missing/empty response', () => {
    const entry = mapWalletEntry({});

    expect(entry.kind).toBe('topup');
    expect(entry.amount).toBe(0);
    expect(entry.id).toBe('');
    expect(entry.reason).toBe('');
    expect(entry.orderNumber).toBeUndefined();
  });
});

describe('mapWalletTopUp', () => {
  it('maps a pending topup response with clientSecret', () => {
    const topup = mapWalletTopUp({
      id: 'topup-1',
      amount: 100,
      status: 'pending',
      stripePaymentIntentId: 'pi_test_123',
      clientSecret: 'pi_test_123_secret_xyz',
      createdAt: '2026-09-15T12:00:00.000Z',
      succeededAt: null,
    });

    expect(topup).toEqual({
      id: 'topup-1',
      amount: 100,
      status: 'pending',
      stripePaymentIntentId: 'pi_test_123',
      clientSecret: 'pi_test_123_secret_xyz',
      createdAt: '2026-09-15T12:00:00.000Z',
      succeededAt: null,
    });
  });

  it('maps a succeeded topup response without clientSecret', () => {
    const topup = mapWalletTopUp({
      id: 'topup-2',
      amount: 200,
      status: 'succeeded',
      stripePaymentIntentId: 'pi_test_456',
      clientSecret: null,
      createdAt: '2026-09-15T12:00:00.000Z',
      succeededAt: '2026-09-15T12:05:00.000Z',
    });

    expect(topup.status).toBe('succeeded');
    expect(topup.succeededAt).toBe('2026-09-15T12:05:00.000Z');
    expect(topup.clientSecret).toBeNull();
  });

  it('falls back to pending status on unknown status', () => {
    const topup = mapWalletTopUp({ status: 'unknown' });
    expect(topup.status).toBe('pending');
  });
});

describe('mapAdminWalletSummary', () => {
  it('maps admin wallet summary correctly', () => {
    const summary = mapAdminWalletSummary({
      userId: 'usr-1',
      balance: 150,
      lifetimeToppedUp: 500,
      lifetimeSpent: 350,
      asOf: '2026-09-15T12:00:00.000Z',
    });

    expect(summary).toEqual({
      userId: 'usr-1',
      balance: 150,
      lifetimeToppedUp: 500,
      lifetimeSpent: 350,
      asOf: '2026-09-15T12:00:00.000Z',
    });
  });
});

// ml-embedding-recommendations v1 §3.1/§3.2
describe('mapBoughtTogetherItem', () => {
  const document: MarketplaceDocumentResponse = {
    id: 'doc-2',
    title: 'แบบฝึกหัดฟิสิกส์ ม.5',
    price: 39,
  };

  it('maps document + coPurchaseCount correctly', () => {
    const item = mapBoughtTogetherItem({ document, coPurchaseCount: 5 });

    expect(item).not.toBeNull();
    expect(item?.document.id).toBe('doc-2');
    expect(item?.coPurchaseCount).toBe(5);
  });

  it('defaults a missing coPurchaseCount to 0', () => {
    const item = mapBoughtTogetherItem({ document });
    expect(item?.coPurchaseCount).toBe(0);
  });

  it('returns null when the wire response omits document (defensive — §3.1 says required)', () => {
    expect(mapBoughtTogetherItem({ coPurchaseCount: 3 })).toBeNull();
  });
});

describe('mapAdminMlRecommendationOverview', () => {
  it('maps every field correctly', () => {
    const overview = mapAdminMlRecommendationOverview({
      documentsWithEmbeddingCount: 120,
      documentsWithBoughtTogetherCount: 80,
      totalSimilarityPairs: 640,
      averageCoPurchaseCount: 3.25,
      lastComputedAt: '2026-09-15T03:00:00.000Z',
      embeddingDimensions: 32,
      minCoPurchaseCount: 1,
    });

    expect(overview).toEqual({
      documentsWithEmbeddingCount: 120,
      documentsWithBoughtTogetherCount: 80,
      totalSimilarityPairs: 640,
      averageCoPurchaseCount: 3.25,
      lastComputedAt: '2026-09-15T03:00:00.000Z',
      embeddingDimensions: 32,
      minCoPurchaseThreshold: 1,
    });
  });

  it('defaults lastComputedAt to null when the job has never run — not a rendering bug', () => {
    const overview = mapAdminMlRecommendationOverview({});
    expect(overview.lastComputedAt).toBeNull();
    expect(overview.documentsWithEmbeddingCount).toBe(0);
  });
});


/**
 * document-watermark-scope-options v1 §3.5/§4.1 — Option A (the watermark stamped on the PUBLIC
 * preview: preview pages, cover, gallery) reaches `/seller/upload` only through this mapper.
 * Until the wiring round it returned three hard-coded optimistic constants, so a listing whose
 * preview watermark the seller had switched off still came back looking switched on, and a
 * policy-locked one looked freely editable. Both are silent data losses on save.
 */
describe('mapSellerDocument — preview watermark flags', () => {
  it('reads all three flags off the response rather than assuming them', () => {
    const doc = mapSellerDocument({
      id: 'doc-1',
      previewWatermarkEnabled: false,
      previewWatermarkEffective: false,
      previewWatermarkPolicyLocked: false,
    } as SellerDocumentResponse);

    expect(doc.previewWatermarkEnabled).toBe(false);
    expect(doc.previewWatermarkEffective).toBe(false);
    expect(doc.previewWatermarkPolicyLocked).toBe(false);
  });

  it('keeps effective stamping on when the platform policy overrides the seller (§3.1)', () => {
    const doc = mapSellerDocument({
      id: 'doc-1',
      previewWatermarkEnabled: false,
      previewWatermarkEffective: true,
      previewWatermarkPolicyLocked: true,
    } as SellerDocumentResponse);

    expect(doc.previewWatermarkEnabled).toBe(false);
    expect(doc.previewWatermarkEffective).toBe(true);
    expect(doc.previewWatermarkPolicyLocked).toBe(true);
  });

  it('falls back to "stamped and seller-editable" when the response omits them (§4.1)', () => {
    const doc = mapSellerDocument({ id: 'doc-1' } as SellerDocumentResponse);

    expect(doc.previewWatermarkEnabled).toBe(true);
    expect(doc.previewWatermarkEffective).toBe(true);
    expect(doc.previewWatermarkPolicyLocked).toBe(false);
  });

  it('is independent of Option B — the download watermark flags do not bleed into it (§1.1)', () => {
    const doc = mapSellerDocument({
      id: 'doc-1',
      watermarkEnabled: false,
      watermarkPolicyLocked: true,
      previewWatermarkEnabled: true,
      previewWatermarkPolicyLocked: false,
    } as SellerDocumentResponse);

    expect(doc.watermarkEnabled).toBe(false);
    expect(doc.watermarkPolicyLocked).toBe(true);
    expect(doc.previewWatermarkEnabled).toBe(true);
    expect(doc.previewWatermarkPolicyLocked).toBe(false);
  });
});

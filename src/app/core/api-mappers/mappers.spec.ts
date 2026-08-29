import { mapOrder, mapDocument, mapDocumentDetail, mapLibraryItem, mapBundle, mapSellerQna } from './mappers';
import type {
  BundleResponse,
  LibraryItemResponse,
  MarketplaceDocumentDetailResponse,
  MarketplaceDocumentResponse,
  OrderResponse,
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

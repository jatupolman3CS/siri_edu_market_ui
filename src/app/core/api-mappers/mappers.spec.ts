import { mapOrder, mapDocument, mapLibraryItem, mapBundle } from './mappers';
import type {
  BundleResponse,
  LibraryItemResponse,
  MarketplaceDocumentResponse,
  OrderResponse,
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
      paymentHints: { omiseChargeId: 'chrg_1', awaitingWebhook: true },
    });

    expect(withHints.paymentHints?.omiseChargeId).toBe('chrg_1');
    expect(withHints.paymentHints?.awaitingWebhook).toBe(true);
    expect(withHints.paymentHints?.promptPayQrImageUrl).toBeUndefined();
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
});

describe('mapBundle', () => {
  it('carries the bundle price through unchanged', () => {
    const bundle: BundleResponse = { id: 'bun-1', title: 'แพ็กรวม', price: 499 };

    expect(mapBundle(bundle).price).toBe(499);
  });
});

import { Injectable, inject, signal } from '@angular/core';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  getApiOrdersById,
  getApiOrdersByIdSimilarDocuments,
  getApiPaymentsStripeConfig,
  postApiOrders,
  postApiOrdersByIdCancel,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { mapOrder, mapOrderSimilarDocument } from '../api-mappers/mappers';
import type { Order, OrderSimilarDocument } from '../models';

/**
 * saved-credit-cards v1 §4: `POST /api/orders` (`CreateOrderRequest`, §3.1) grew two optional
 * fields. `savedPaymentMethodId` picks an existing `SAVED_PAYMENT_METHOD` row to pay with instead
 * of collecting a fresh card through the Payment Element; `saveNewCard` only matters when
 * `savedPaymentMethodId` is absent, and asks Stripe to keep the card just entered for next time.
 * Neither is sent unless the buyer opted in — see `checkout.page.ts`.
 */
export interface CreateOrderInput {
  savedPaymentMethodId?: string;
  saveNewCard?: boolean;
  referralCode?: string;
  useReferralCredit?: boolean;
}

export type CreateOrderOutcome =
  | { ok: true; order: Order }
  | {
      ok: false;
      alreadyOwned?: boolean;
      /** BUG-09: an earlier unpaid order still covers these documents. */
      pendingOrder?: boolean;
      /**
       * T-13: the card was charged and the order could not be completed. The money is gone,
       * an operator has been alerted, and paying again would charge the buyer twice.
       */
      paymentNeedsReview?: boolean;
      status?: number;
      message?: string;
    };

/**
 * Wraps `POST /api/orders` and `GET /api/orders/{id}` so that pages never
 * touch the OpenAPI SDK directly (audit-guard: no-sdk-gen-in-features).
 *
 * Centralises:
 *   - error reporting via {@link ApiFailureReporter}
 *   - 409 handling for "already owned" (used by checkout to redirect users to library)
 *   - shared {@link ActionState} for buttons
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _checkoutState = signal<ActionState>(idleActionState());
  readonly checkoutState = this._checkoutState.asReadonly();

  private readonly _detail = signal<Order | null>(null);
  readonly detail = this._detail.asReadonly();

  // order-similar-documents v1 §4: "เอกสารที่คล้ายกับคำสั่งซื้อนี้" block on `/orders/:id`.
  private readonly _similar = signal<OrderSimilarDocument[]>([]);
  readonly similar = this._similar.asReadonly();
  private readonly _similarState = signal<ActionState>(idleActionState());
  readonly similarState = this._similarState.asReadonly();

  async create(input: CreateOrderInput = {}): Promise<CreateOrderOutcome> {
    this._checkoutState.set(loadingActionState());
    try {
      // saved-credit-cards v1 §4/§3.1: `CreateOrderRequest` (generated) carries
      // `savedPaymentMethodId` / `saveNewCard` straight through. Both are optional on the wire —
      // `JSON.stringify` drops an `undefined` field rather than sending it as `null`.
      const result = await postApiOrders({
        body: {
          savedPaymentMethodId: input.savedPaymentMethodId,
          saveNewCard: input.saveNewCard,
          referralCode: input.referralCode,
          useReferralCredit: input.useReferralCredit,
        } as unknown as { savedPaymentMethodId?: string; saveNewCard?: boolean },
      });
      const data = unwrapSdkResult(result);
      const order = mapOrder(data);
      this._checkoutState.set(successActionState('สร้างคำสั่งซื้อสำเร็จ'));
      return { ok: true, order };
    } catch (e) {
      const status = extractStatus(e);
      if (status === 409) {
        // BUG-09: 409 is no longer only "already owned", so branch on the server's code
        // rather than assuming. Falling back to already-owned keeps older API builds working.
        const code = extractCode(e);
        if (code === 'pending_order_exists') {
          const message = extractMessage(e) ?? 'คุณมีคำสั่งซื้อที่ยังไม่ได้ชำระเงินสำหรับเอกสารเหล่านี้อยู่แล้ว';
          this._checkoutState.set(errorActionState(message));
          return { ok: false, pendingOrder: true, status, message };
        }

        // T-13: the charge went through and the order could not be completed. This must never
        // fall through to the already-owned branch below, which would tell the buyer they own
        // something they do not and send them to an empty library.
        if (code === 'payment_needs_review') {
          const message =
            extractMessage(e) ??
            'ชำระเงินสำเร็จแล้ว แต่ระบบยังจับคู่การชำระเงินกับคำสั่งซื้อไม่สำเร็จ ทีมงานกำลังตรวจสอบ กรุณาอย่าชำระเงินซ้ำ';
          this._checkoutState.set(errorActionState(message));
          return { ok: false, paymentNeedsReview: true, status, message };
        }

        this._checkoutState.set(
          errorActionState('มีบางรายการที่คุณเป็นเจ้าของอยู่แล้ว'),
        );
        return { ok: false, alreadyOwned: true, status, message: 'already_owned' };
      }
      this.apiFail.report('สร้างคำสั่งซื้อ', e);
      this._checkoutState.set(errorActionState('สร้างคำสั่งซื้อไม่สำเร็จ'));
      return { ok: false, status, message: extractMessage(e) };
    }
  }

  async loadDetail(id: string): Promise<Order | null> {
    // order-similar-documents v1 §4: clear stale results from a previous order before the new
    // one resolves, so a slow/failed similar-documents call never leaves the last order's cards
    // showing under this one.
    this._similar.set([]);
    this._similarState.set(idleActionState());
    try {
      const result = await getApiOrdersById({ path: { id } });
      const data = unwrapSdkResult(result);
      const order = mapOrder(data);
      this._detail.set(order);
      return order;
    } catch (e) {
      this.apiFail.report('โหลดรายละเอียดคำสั่งซื้อ', e);
      this._detail.set(null);
      return null;
    }
  }

  /**
   * order-similar-documents v1 §3.1/§4: `GET /api/orders/{id}/similar-documents`. Caller
   * (`order-detail.page.ts`) only invokes this once per order, and only while its status is
   * `paid`/`fulfilled` — this method itself does not gate on status.
   *
   * Never rejects: an empty result or a failed call both just leave `similar` as `[]`, which the
   * page reads as "hide the section entirely" (§1.6 — no empty state, no error banner).
   */
  async loadSimilar(orderId: string, take = 4): Promise<void> {
    this._similarState.set(loadingActionState());
    try {
      const result = await getApiOrdersByIdSimilarDocuments({ path: { id: orderId }, query: { take } });
      const data = unwrapSdkResult(result);
      this._similar.set((data.items ?? []).map(mapOrderSimilarDocument));
      this._similarState.set(successActionState());
    } catch (e) {
      this.apiFail.report('โหลดเอกสารที่คล้ายกัน', e);
      this._similar.set([]);
      this._similarState.set(errorActionState('โหลดเอกสารที่คล้ายกันไม่สำเร็จ'));
    }
  }

  /**
   * BUG-09: releases an unpaid order that is blocking a new checkout. The payment intent stays
   * payable, and the webhook still fulfils it if it lands, so nothing is lost by cancelling.
   */
  async cancel(id: string): Promise<Order | null> {
    try {
      const result = await postApiOrdersByIdCancel({ path: { id } });
      const order = mapOrder(unwrapSdkResult(result));
      this._detail.set(order);
      return order;
    } catch (e) {
      this.apiFail.report('ยกเลิกคำสั่งซื้อ', e);
      return null;
    }
  }

  resetCheckout(): void {
    this._checkoutState.set(idleActionState());
  }

  /**
   * F-01: the checkout page read the publishable key straight off the SDK barrel. It belongs
   * with the rest of the S-04 payment flow, which this service already owns.
   *
   * Returns null rather than an empty string when the server has no key configured, so the
   * caller cannot accidentally hand `''` to Stripe and get a less obvious failure.
   */
  async getStripePublishableKey(): Promise<string | null> {
    const config = unwrapSdkResult(await getApiPaymentsStripeConfig({}));
    return config.publishableKey?.trim() || null;
  }
}

function extractStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const o = error as Record<string, unknown>;
  if (typeof o['status'] === 'number') return o['status'] as number;
  const r = o['response'] as Record<string, unknown> | undefined;
  if (r && typeof r['status'] === 'number') return r['status'] as number;
  return undefined;
}

function extractCode(error: unknown): string | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const o = error as Record<string, unknown>;
  if (typeof o['code'] === 'string') return o['code'] as string;
  return undefined;
}

function extractMessage(error: unknown): string | undefined {
  if (error == null) return undefined;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>;
    const detail = o['detail'];
    if (typeof detail === 'string') return detail;
    const message = o['message'];
    if (typeof message === 'string') return message;
  }
  return undefined;
}

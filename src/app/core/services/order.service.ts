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
  getApiPaymentsStripeConfig,
  postApiOrders,
  postApiOrdersByIdCancel,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { mapOrder } from '../api-mappers/mappers';
import type { Order } from '../models';

/**
 * S-04: checkout sends nothing. The buyer picks a payment method inside Stripe's Payment
 * Element after the order exists, so there is no card token and no phone number to carry — and
 * no way for this layer to touch either.
 */
export type CreateOrderInput = Record<string, never>;

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

  async create(_input: CreateOrderInput = {}): Promise<CreateOrderOutcome> {
    this._checkoutState.set(loadingActionState());
    try {
      const result = await postApiOrders({ body: {} });
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

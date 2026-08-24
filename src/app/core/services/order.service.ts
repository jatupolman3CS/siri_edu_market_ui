import { Injectable, inject, signal } from '@angular/core';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { getApiOrdersById, postApiOrders, postApiOrdersByIdCancel } from '../api';
import { unwrapSdkResult } from './api-result';
import { mapOrder } from '../api-mappers/mappers';
import type { Order } from '../models';

export type CreateOrderInput = {
  paymentMethod: 'promptpay' | 'credit_card' | 'truemoney';
  omiseCardToken?: string;
  trueMoneyPhoneNumber?: string;
};

export type CreateOrderOutcome =
  | { ok: true; order: Order }
  | {
      ok: false;
      alreadyOwned?: boolean;
      /** BUG-09: an earlier unpaid order still covers these documents. */
      pendingOrder?: boolean;
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

  async create(input: CreateOrderInput): Promise<CreateOrderOutcome> {
    this._checkoutState.set(loadingActionState());
    try {
      const result = await postApiOrders({
        body: {
          paymentMethod: input.paymentMethod,
          omiseCardToken: input.omiseCardToken ?? null,
          trueMoneyPhoneNumber: input.trueMoneyPhoneNumber ?? null,
        },
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
   * BUG-09: releases an unpaid order that is blocking a new checkout. The Omise charge stays
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

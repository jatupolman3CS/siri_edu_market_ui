import { Injectable, inject, signal } from '@angular/core';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { getApiOrdersById, postApiOrders } from '../api';
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
  | { ok: false; alreadyOwned?: boolean; status?: number; message?: string };

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

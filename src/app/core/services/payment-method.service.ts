import { Injectable, inject, signal } from '@angular/core';
import type { SavedPaymentMethod } from '../models';
import { mapSavedPaymentMethod } from '../api-mappers/mappers';
import {
  deleteApiMePaymentMethodsById,
  getApiMePaymentMethods,
  postApiMePaymentMethods,
  postApiMePaymentMethodsByIdDefault,
  postApiMePaymentMethodsSetupIntent,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { TranslationService } from '../i18n';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';

/**
 * saved-credit-cards v1 (docs/contracts/saved-credit-cards.md §3.2-§3.6, §4) — service-as-store
 * for "บัตรที่บันทึกไว้" on `/account` (manage mode) and embedded in `/checkout` (select mode),
 * via `shared/components/saved-cards/saved-cards.component.ts`.
 *
 * Round 2 (this round): backend shipped and `npm run generate:api` regenerated the SDK helpers
 * for all 5 `/api/me/payment-methods*` endpoints — every method below calls through the real
 * generated `core/api` functions, mapped via `mapSavedPaymentMethod`.
 *
 * Error handling follows what each caller already does with the return value (never a duplicate
 * toast on top of the caller's own):
 *  - `refreshList()` toasts "โหลดรายการบัตรไม่สำเร็จ" itself (no caller-level toast for a list load).
 *  - `confirmSaved()` / `remove()` / `createSetupIntent()` fail silently (return `null`/`false`) —
 *    every caller already shows its own Thai toast (or, for the best-effort checkout save-card
 *    call, swallows the error entirely per §4 step 4).
 *  - `setDefault()` has no caller-level toast, so it reports through {@link ApiFailureReporter}
 *    itself, same as `LoyaltyService`/`WishlistService` do for actions with no dedicated UI copy.
 */
@Injectable({ providedIn: 'root' })
export class PaymentMethodService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  private readonly _list = signal<SavedPaymentMethod[]>([]);
  private readonly _state = signal<ActionState>(idleActionState());

  readonly list = this._list.asReadonly();
  readonly state = this._state.asReadonly();

  /** `GET /api/me/payment-methods` (§3.2) — backs AC-15/AC-16. */
  async refreshList(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      const result = await getApiMePaymentMethods();
      const data = unwrapSdkResult(result);
      this._list.set((data ?? []).map(mapSavedPaymentMethod));
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('errors.context.loadSavedCards', e);
      this._list.set([]);
      this._state.set(errorActionState(this.translation.t('payment.loadCardsFailed')));
    }
  }

  /**
   * `POST /api/me/payment-methods` (§3.3) — confirms a `pm_...` Stripe.js just captured (either
   * the best-effort call after a "new card" checkout with `saveNewCard` checked, §4 step 4, or
   * the explicit "บันทึกบัตร" action in manage mode, §4 manage-flow step 2).
   */
  async confirmSaved(stripePaymentMethodId: string): Promise<SavedPaymentMethod | null> {
    try {
      const result = await postApiMePaymentMethods({ body: { stripePaymentMethodId } });
      const data = unwrapSdkResult(result);
      return mapSavedPaymentMethod(data);
    } catch {
      // §4 step 4: the best-effort checkout caller must never surface this as an error. The
      // manage-mode caller (`saved-cards.component.confirmAddCard`) already toasts
      // "บันทึกบัตรไม่สำเร็จ" on a `null` return.
      return null;
    }
  }

  /** `POST /api/me/payment-methods/{id}/default` (§3.4). */
  async setDefault(id: string): Promise<SavedPaymentMethod | null> {
    try {
      const result = await postApiMePaymentMethodsByIdDefault({ path: { id } });
      const data = unwrapSdkResult(result);
      return mapSavedPaymentMethod(data);
    } catch (e) {
      this.apiFail.report('errors.context.setDefaultCard', e);
      return null;
    }
  }

  /** `DELETE /api/me/payment-methods/{id}` (§3.5) — returns whether the row is gone. */
  async remove(id: string): Promise<boolean> {
    try {
      const result = await deleteApiMePaymentMethodsById({ path: { id } });
      if (result.error) throw result.error;
      return true;
    } catch {
      // `saved-cards.component.remove` already toasts "ลบบัตรไม่สำเร็จ" on a `false` return.
      return false;
    }
  }

  /** `POST /api/me/payment-methods/setup-intent` (§3.6) — returns the SetupIntent client secret. */
  async createSetupIntent(): Promise<string | null> {
    try {
      const result = await postApiMePaymentMethodsSetupIntent();
      const data = unwrapSdkResult(result);
      return data.clientSecret ?? null;
    } catch {
      // `saved-cards.component.openAddCard` already toasts "บันทึกบัตรไม่สำเร็จ" on a `null` return.
      return null;
    }
  }
}

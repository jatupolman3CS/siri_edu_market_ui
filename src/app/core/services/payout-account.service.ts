import { Injectable, inject, signal } from '@angular/core';
import type { PayoutAccount } from '../models';
import { mapPayoutAccount } from '../api-mappers/mappers';
import {
  getApiSellerPayoutAccount,
  postApiSellerPayoutAccountReveal,
  putApiSellerPayoutAccount,
} from '../api';
import { extractErrorCode, extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';

/**
 * seller-payout-account-self-service v1 (docs/contracts/seller-payout-account-self-service.md
 * §3.1, §4) — service-as-store for "บัญชีรับเงิน" on `/seller` (Studio Mode settings), via
 * `shared/components/payout-account-form/payout-account-form.component.ts`.
 *
 * Round 2 (this round): backend shipped and `npm run generate:api` regenerated the SDK helpers
 * for `/api/seller/payout-account*` — every method below calls through the real generated
 * `core/api` functions, mapped via `mapPayoutAccount`.
 *
 * Error handling (§3.1, §4) — every endpoint in this feature returns the plain
 * `BadRequest(new { message })` / `NotFound()` shape (§0/§3), not ProblemDetails, except the
 * automatic `403 seller_profile_required` from `RequireSellerProfileFilter`:
 *  - `load()` never sets `_account` on failure — the component falls back to its own
 *    "กำลังโหลด…" text (see component doc comment) rather than showing stale/fake data. A
 *    generic failure also reports through {@link ApiFailureReporter} (there is no other UI for
 *    it — the component's `loadError()` banner only ever comes from this same `state()`).
 *  - `save()` returns `{ ok: false, error }` with the backend's `{ message }` for a real `400`
 *    (shown inline under the form by the component), or `{ ok: false }` (no `error`) for
 *    anything else — this service never toasts here, the component owns the generic
 *    "บันทึกบัญชีรับเงินไม่สำเร็จ" toast for that case.
 *  - `reveal()` never sets `_revealed` on failure and never toasts — the component checks
 *    `revealed()` after the call and toasts "แสดงเลขบัญชีไม่สำเร็จ" itself (covers the expected
 *    `404` "ยังไม่เคยตั้งค่า" too).
 *  - all three special-case `403 seller_profile_required` by flipping `sellerProfileRequired()`
 *    (never a toast for this one — the component hides the whole section silently instead).
 */
/**
 * payout-request-slip-verification v1 §3.13.2: `POST .../reveal` returns exactly one of
 * `accountNumber` (bank) or `promptPayId` (PromptPay) — never both.
 */
export interface RevealedPayoutAccount {
  accountNumber: string | null;
  promptPayId: string | null;
}

@Injectable({ providedIn: 'root' })
export class PayoutAccountService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _account = signal<PayoutAccount | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());
  private readonly _revealed = signal<RevealedPayoutAccount | null>(null);
  /**
   * True when the last `load()` answered `403 seller_profile_required` (an Admin viewing
   * `/seller` without their own store) — §4: the component hides the whole section silently on
   * this, same pattern as `SellerService.sellerProfileRequired`.
   */
  private readonly _sellerProfileRequired = signal(false);

  readonly account = this._account.asReadonly();
  readonly state = this._state.asReadonly();
  readonly revealed = this._revealed.asReadonly();
  readonly sellerProfileRequired = this._sellerProfileRequired.asReadonly();

  /**
   * True + flips `sellerProfileRequired()` when `error` is `403 seller_profile_required` — never
   * toasts. Shared by every catch block below; `handleSellerScopedError` layers the *generic*
   * toast on top for `load()`, which has no other way to surface a real failure to the user.
   */
  private flagIfSellerProfileRequired(error: unknown): boolean {
    if (extractErrorStatus(error) === 403 && extractErrorCode(error) === 'seller_profile_required') {
      this._sellerProfileRequired.set(true);
      return true;
    }
    return false;
  }

  /** True when `error` is the expected `403 seller_profile_required` — never the generic toast. */
  private handleSellerScopedError(context: string, error: unknown): boolean {
    if (this.flagIfSellerProfileRequired(error)) return true;
    this.apiFail.report(context, error);
    return false;
  }

  /**
   * §3.1/§0: `PUT`'s `400` is the controller's own `catch (ArgumentException) { return
   * BadRequest(new { message = ex.Message }); }` — verified live against the running backend
   * (`{"message":"ธนาคารไม่ถูกต้อง"}`, HTTP 400, **no** `status`/`statusCode`/`title`/`code`
   * field at all). That is unlike every other failure in this app, which bubbles through
   * `GlobalExceptionMiddleware`'s `ApiErrorResponse` and always carries a `status` — so
   * `extractErrorStatus(error) === 400` (the pattern every other service in this codebase uses)
   * can never match here. The *absence* of a `status` field is what identifies this shape
   * instead: a native `Error`/`TypeError` (network failure) is excluded so a "Failed to fetch"
   * message is never shown to the user as if it were a validation message.
   */
  private static plainValidationMessage(error: unknown): string | null {
    if (error == null || typeof error !== 'object' || error instanceof Error) return null;
    const o = error as Record<string, unknown>;
    if (extractErrorStatus(o) !== undefined) return null;
    return typeof o['message'] === 'string' && o['message'] ? o['message'] : null;
  }

  /** `GET /api/seller/payout-account` (§3.1). */
  async load(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      const data = unwrapSdkResult(await getApiSellerPayoutAccount());
      this._account.set(mapPayoutAccount(data));
      this._sellerProfileRequired.set(false);
      this._state.set(idleActionState());
    } catch (e) {
      if (this.handleSellerScopedError('โหลดข้อมูลบัญชีรับเงินไม่สำเร็จ', e)) {
        this._state.set(idleActionState());
        return;
      }
      this._state.set(errorActionState('โหลดข้อมูลบัญชีรับเงินไม่สำเร็จ'));
    }
  }

  /**
   * `PUT /api/seller/payout-account` (§3.1, upsert).
   *
   * payout-request-slip-verification v1 §3.13: `accountType` selects which of the two field
   * groups is required — `bankCode`/`accountNumber` for `'bank'`, `promptPayType`/`promptPayId`
   * for `'promptpay'`. The unused group is simply omitted here; the backend clears it to `null`
   * in the DB regardless of what a stale caller might send (§3.13 "ส่ง field ของอีกประเภทมาด้วย").
   */
  async save(input: {
    accountType: 'bank' | 'promptpay';
    accountHolderName: string;
    bankCode?: string;
    accountNumber?: string;
    promptPayType?: 'phone' | 'national_id';
    promptPayId?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    this._state.set(loadingActionState());
    try {
      const data = unwrapSdkResult(await putApiSellerPayoutAccount({ body: input }));
      this._account.set(mapPayoutAccount(data));
      this._sellerProfileRequired.set(false);
      this._state.set(idleActionState());
      return { ok: true };
    } catch (e) {
      this._state.set(idleActionState());
      // §4: the component owns every toast for a `save()` failure (400 shown inline, anything
      // else a generic "บันทึกบัญชีรับเงินไม่สำเร็จ") — this service must never toast on top of
      // that. A `403 seller_profile_required` still flips the shared flag (defensive: `save()`
      // can only run once the form is already rendered, which itself requires this flag to be
      // `false`, so this branch is effectively unreachable in normal use).
      this.flagIfSellerProfileRequired(e);
      const validationMessage = PayoutAccountService.plainValidationMessage(e);
      if (validationMessage) {
        return { ok: false, error: validationMessage };
      }
      return { ok: false };
    }
  }

  /**
   * `POST /api/seller/payout-account/reveal` (§3.1). payout-request-slip-verification v1 §3.13.2:
   * the response now carries `accountNumber` (bank) or `promptPayId` (PromptPay) — never both —
   * so the full pair is kept rather than collapsing to one string.
   */
  async reveal(): Promise<void> {
    try {
      const data = unwrapSdkResult(await postApiSellerPayoutAccountReveal());
      this._revealed.set({
        accountNumber: data.accountNumber ?? null,
        promptPayId: data.promptPayId ?? null,
      });
    } catch (e) {
      // §4: component checks `revealed()` after the `await` and toasts "แสดงเลขบัญชีไม่สำเร็จ"
      // itself when it's still `null` — this service must never toast on top of that (covers the
      // expected `404` "ยังไม่เคยตั้งค่า" too, same as every other error here). A `403
      // seller_profile_required` still flips the shared flag so the section hides.
      this.flagIfSellerProfileRequired(e);
    }
  }

  clearRevealed(): void {
    this._revealed.set(null);
  }
}

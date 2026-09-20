import { Injectable, inject, signal } from '@angular/core';
import type { LineConnectionStatus } from '../models';
import { mapLineConnectionStatus } from '../api-mappers/mappers';
import type { UpdateNotificationSettingsRequest } from '../api/types.gen';
import { normalizeSetting, type NotificationSettingItem } from './notification.service';
import {
  deleteApiNotificationsLineConnection,
  getApiNotificationsLineConnection,
  getApiNotificationsLineSettings,
  postApiNotificationsLineConnect,
  putApiNotificationsLineSettings,
} from '../api';
import { extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { TranslationService } from '../i18n';
import { errorActionState, idleActionState, loadingActionState, type ActionState } from './action-state';

/**
 * line-notification-channel v1 (docs/contracts/line-notification-channel.md §3, §5) —
 * service-as-store for "เชื่อมต่อ LINE" on `/seller/settings`, via
 * `shared/components/line-notification/line-notification.component.ts` (own component, own
 * service — same pattern as `PayoutAccountService`/`payout-account-form.component.ts`).
 *
 * Round 2 (this round): backend shipped and gate 1 confirmed `/api/notifications/line/*` matches
 * the contract; `npm run generate:api` regenerated the SDK — every method below calls through the
 * real generated `core/api` functions, mapping `LineConnectionStatusResponse` via
 * {@link mapLineConnectionStatus} the same way `PayoutAccountService` maps via `mapPayoutAccount`.
 * `NotificationSettingResponse[]`/`UpdateNotificationSettingsRequest` are reused 1:1 from the email
 * settings feature (§3.5/§3.6 — no new schema), same as round 1 already assumed.
 *
 * Error handling convention (mirrors `PayoutAccountService`'s doc comment):
 *  - `loadStatus()`/`loadSettings()` are fetches with no other UI for a failure — both report
 *    through {@link ApiFailureReporter}. `loadStatus()` additionally flips `state()` to `error` so
 *    the component can show an inline banner (same split as `PayoutAccountService.load()`).
 *  - `connect()` / `disconnect()` / `updateSettings()` are user-initiated actions — the component
 *    owns every toast for these (success *and* failure), so none of them call
 *    {@link ApiFailureReporter} (mirrors `PaymentMethodService.remove()`/`createSetupIntent()`).
 *  - `connect()`'s `503` (§3.1, LINE not configured on this server) is the controller's own plain
 *    `{ message }` body — verified live against the running backend
 *    (`{"message":"บริการเชื่อมต่อ LINE ยังไม่เปิดใช้งานบนระบบนี้"}`, HTTP 503, **no**
 *    `status`/`statusCode`/`title`/`code` field), unlike 401/403 which bubble through the
 *    standard `[Authorize]`/`ProblemDetails` pipeline and always carry a `status`. `connect()`
 *    surfaces that message verbatim via `plainMessage()` (mirrors
 *    `PayoutAccountService.plainValidationMessage`) so the component can show it instead of the
 *    generic "เชื่อมต่อ LINE ไม่สำเร็จ" toast.
 */
@Injectable({ providedIn: 'root' })
export class LineNotificationService {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  private readonly _status = signal<LineConnectionStatus | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());
  private readonly _settings = signal<NotificationSettingItem[]>([]);

  readonly status = this._status.asReadonly();
  readonly state = this._state.asReadonly();
  readonly settings = this._settings.asReadonly();

  /** `GET /api/notifications/line/connection` (§3.3). */
  loadStatus(): void {
    this._state.set(loadingActionState());
    void (async () => {
      try {
        const data = unwrapSdkResult(await getApiNotificationsLineConnection());
        this._status.set(mapLineConnectionStatus(data));
        this._state.set(idleActionState());
      } catch (e) {
        this._state.set(errorActionState(this.translation.t('lineNotification.loadStatusFailed')));
        this.apiFail.report('errors.context.loadLineStatus', e);
      }
    })();
  }

  /**
   * `GET /api/notifications/line/settings` (§3.5) — reuses `NotificationSettingResponse[]`, no new
   * schema.
   *
   * notification-master-config v1 §3.6: that response now also carries `description`/`audience`/
   * `isLocked`/`lockReason`, and the LINE card has to honour `isLocked` exactly like the email card
   * does (a key an admin switched off, or one nobody may opt out of, is dropped by the API anyway —
   * showing a live switch for it would only lie to the seller). Rows are therefore normalised
   * through the same {@link normalizeSetting} the email settings use.
   */
  loadSettings(): void {
    void (async () => {
      try {
        const data = unwrapSdkResult(await getApiNotificationsLineSettings());
        this._settings.set(data.map(normalizeSetting));
      } catch (e) {
        this.apiFail.report('errors.context.loadLineSettings', e);
      }
    })();
  }

  /**
   * `PUT /api/notifications/line/settings` (§3.6) — caller must always send the full key→boolean
   * map (endpoint replaces the whole set), same as `notification-settings.component.ts.toggle()`.
   * §3.6: locked keys are excluded from that map by the caller — the API filters them out silently.
   */
  async updateSettings(request: UpdateNotificationSettingsRequest): Promise<boolean> {
    try {
      const data = unwrapSdkResult(await putApiNotificationsLineSettings({ body: request }));
      this._settings.set(data.map(normalizeSetting));
      return true;
    } catch {
      // component owns the toast for this failure — see class doc comment.
      return false;
    }
  }

  /**
   * `POST /api/notifications/line/connect` (§3.1). Discriminated on `ok` rather than returning
   * `string | null` so the `503` (LINE not configured — see class doc comment) can carry its own
   * user-facing `error` message back to the component instead of collapsing into the generic
   * "เชื่อมต่อ LINE ไม่สำเร็จ" toast.
   */
  async connect(): Promise<{ ok: true; authorizeUrl: string } | { ok: false; error?: string }> {
    try {
      const data = unwrapSdkResult(await postApiNotificationsLineConnect());
      const authorizeUrl = data.authorizeUrl;
      // Defensive: §3.1 always returns `authorizeUrl` on 200, but the generated field is
      // optional — treat an (unexpected) empty one as a failure rather than navigating nowhere.
      if (!authorizeUrl) return { ok: false };
      return { ok: true, authorizeUrl };
    } catch (e) {
      // component owns the toast for this failure — see class doc comment.
      return { ok: false, error: LineNotificationService.plainMessage(e) ?? undefined };
    }
  }

  /** `DELETE /api/notifications/line/connection` (§3.4) — always resolves `true` on 204 (idempotent by design). */
  async disconnect(): Promise<boolean> {
    try {
      await deleteApiNotificationsLineConnection();
      return true;
    } catch {
      // component owns the toast for this failure — see class doc comment.
      return false;
    }
  }

  /**
   * §5: thin wrapper around a full-page navigation to LINE's consent page — kept off `window`
   * directly in the component so component specs can substitute a spy instead of triggering a
   * real browser navigation in jsdom.
   */
  redirectToLine(authorizeUrl: string): void {
    window.location.href = authorizeUrl;
  }

  /**
   * §3.1: extracts the plain `{ message }` body of a `503` (or any other endpoint in this app
   * that answers the same way, e.g. `PayoutAccountService`'s `PUT` `400`) — identified by the
   * *absence* of a `status` field, which every response through `GlobalExceptionMiddleware`'s
   * `ApiErrorResponse` (401/403 included) always carries. A native `Error`/`TypeError` (network
   * failure) is excluded so "Failed to fetch" is never shown to the user as a real backend message.
   */
  private static plainMessage(error: unknown): string | null {
    if (error == null || typeof error !== 'object' || error instanceof Error) return null;
    const o = error as Record<string, unknown>;
    if (extractErrorStatus(o) !== undefined) return null;
    return typeof o['message'] === 'string' && o['message'] ? o['message'] : null;
  }

  /** Test helper. */
  setStatusForTest(status: LineConnectionStatus | null): void {
    this._status.set(status);
  }

  /** Test helper — see {@link setStatusForTest}. */
  setSettingsForTest(settings: NotificationSettingItem[]): void {
    this._settings.set(settings);
  }
}

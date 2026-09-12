import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { getApiNotificationsSettings, putApiNotificationsSettings } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { toNotificationAudience, type NotificationAudience } from './notification-context.service';
import type {
  NotificationSettingResponse,
  UpdateNotificationSettingsRequest,
} from '../api/types.gen';

/**
 * notification-master-config v1 §3.6 — one row of the user's email notification settings.
 *
 * The generated `NotificationSettingResponse` marks its three original fields optional and does
 * not know about the four the contract adds, so (like `NotificationFeedItemResponse` in
 * `notification-feed.service.ts`) the shape the UI binds to is narrowed here, in the one place
 * that normalises a raw response.
 */
export interface NotificationSettingItem {
  key: string;
  label: string;
  isEnabled: boolean;
  /** §3.6: Thai, one line — when this notification reaches you. */
  description: string;
  audience: NotificationAudience;
  /** §3.6 / AC-20: true = admin switched the event off, or it cannot be opted out of at all. */
  isLocked: boolean;
  lockReason: string | null;
}

function normalizeSetting(raw: NotificationSettingResponse): NotificationSettingItem {
  // TODO(contract): notification-master-config §3.6 — `description`, `audience`, `isLocked` and
  // `lockReason` are not in the generated SDK yet (backend be-1 built them in parallel).
  // Remove this cast in the fe-3 regen round.
  const extra = raw as {
    description?: unknown;
    audience?: unknown;
    isLocked?: unknown;
    lockReason?: unknown;
  };

  return {
    key: raw.key ?? '',
    label: raw.label ?? '',
    isEnabled: raw.isEnabled ?? false,
    description: typeof extra.description === 'string' ? extra.description : '',
    audience: toNotificationAudience(extra.audience) ?? 'buyer',
    isLocked: extra.isLocked === true,
    lockReason: typeof extra.lockReason === 'string' && extra.lockReason.trim() ? extra.lockReason : null,
  };
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _settings = signal<NotificationSettingItem[]>([]);

  readonly settings = this._settings.asReadonly();

  loadSettings(): void {
    void (async () => {
      try {
        const result = await getApiNotificationsSettings();
        const data = unwrapSdkResult(result);
        this._settings.set(data.map(normalizeSetting));
      } catch (e) {
        this.apiFail.report('โหลดการตั้งค่าแจ้งเตือน', e);
      }
    })();
  }

  updateSettings(
    request: UpdateNotificationSettingsRequest,
  ): Observable<NotificationSettingItem[]> {
    return from(putApiNotificationsSettings({ body: request })).pipe(
      map(unwrapSdkResult),
      map((settings) => settings.map(normalizeSetting)),
      tap((s) => this._settings.set(s)),
      catchError((e) => {
        this.apiFail.report('บันทึกการตั้งค่าแจ้งเตือน', e);
        return throwError(() => e);
      }),
    );
  }

  /**
   * Test helper — component specs drive the settings card without a network layer. Mirrors the
   * `*ForTest` helpers on `NotificationFeedService`/`NotificationConfigService`.
   */
  setSettingsForTest(settings: NotificationSettingItem[]): void {
    this._settings.set(settings);
  }
}

import { Injectable, inject, signal } from '@angular/core';
import {
  getApiAdminNotificationConfig,
  postApiAdminNotificationConfigByEventKeyReset,
  putApiAdminNotificationConfigByEventKey,
} from '../api';
import type { NotificationEventConfigItem as GeneratedNotificationEventConfigItem } from '../api/types.gen';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { toNotificationAudience, type NotificationAudience } from './notification-context.service';

/**
 * notification-master-config v2 §3.7 (`docs/contracts/notification-master-config.md`) — the admin
 * master switchboard behind `/admin/notification-config`: which of the 18 catalog events the
 * platform sends at all, and over which channels (อีเมล / LINE / ในระบบ).
 *
 * All three calls go through generated SDK helpers (fe-3 regen round). Each passes
 * `throwOnError: false` even though `api-runtime.ts` configures the client the other way round:
 * this contract answers 400/403/404 with a Thai sentence in the body and the thrown form loses the
 * status code that tells them apart (§4.2 / AC-21–AC-23).
 */
export type NotificationEventGroup =
  | 'commerce'
  | 'engagement'
  | 'content'
  | 'moderation'
  | 'payout'
  | 'system';

/** §3.7 `NotificationEventConfigItem`. `supports*`/`hasTrigger` are read-only catalog facts. */
export interface NotificationEventConfigItem {
  eventKey: string;
  label: string;
  description: string;
  audience: NotificationAudience;
  /** One of {@link NotificationEventGroup}; kept as `string` so an event added by a later wave still renders. */
  group: string;
  isEnabled: boolean;
  emailEnabled: boolean;
  lineEnabled: boolean;
  inAppEnabled: boolean;
  userOverridable: boolean;
  throttleWindowMinutes: number;
  dailyCapPerRecipient: number;
  supportsEmail: boolean;
  supportsLine: boolean;
  supportsInApp: boolean;
  hasTrigger: boolean;
  isCustomized: boolean;
  updatedAt: string | null;
}

/** §3.7: a PUT replaces the whole row — every field is required, there is no patch semantic. */
export interface UpdateNotificationEventConfigRequest {
  isEnabled: boolean;
  emailEnabled: boolean;
  lineEnabled: boolean;
  inAppEnabled: boolean;
  userOverridable: boolean;
  throttleWindowMinutes: number;
  dailyCapPerRecipient: number;
}

/** §3.7 validation bounds — mirrored client-side so an obvious typo never costs a round trip. */
export const THROTTLE_WINDOW_MIN_MINUTES = 0;
export const THROTTLE_WINDOW_MAX_MINUTES = 10080;
export const DAILY_CAP_MIN = 0;
export const DAILY_CAP_MAX = 1000;

/**
 * Carries the Thai sentence the caller should show. `status` is kept so a page can tell an
 * expected 400/404 (ข้อความจาก body) from a 403 (`ไม่มีสิทธิ์เข้าถึง`) — see §4.2 and the fe-3
 * error-handling requirement.
 */
export class NotificationConfigError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
  ) {
    super(message);
    this.name = 'NotificationConfigError';
  }
}

const FORBIDDEN_MESSAGE = 'ไม่มีสิทธิ์เข้าถึง';
const UNAUTHORIZED_MESSAGE = 'กรุณาเข้าสู่ระบบอีกครั้ง';
const GENERIC_FAILURE_MESSAGE = 'บันทึกไม่สำเร็จ กรุณาลองใหม่';

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * Narrows the generated DTO (every flag optional, `audience` a bare `string`) to the complete shape
 * the admin table binds to — the same "normalise once, in the service" pattern as
 * `normalizeSetting` in `notification.service.ts`.
 */
function parseItem(raw: GeneratedNotificationEventConfigItem): NotificationEventConfigItem {
  return {
    eventKey: raw.eventKey,
    label: raw.label,
    description: raw.description,
    audience: toNotificationAudience(raw.audience) ?? 'buyer',
    group: raw.group || 'system',
    isEnabled: raw.isEnabled === true,
    emailEnabled: raw.emailEnabled === true,
    lineEnabled: raw.lineEnabled === true,
    inAppEnabled: raw.inAppEnabled === true,
    userOverridable: raw.userOverridable === true,
    throttleWindowMinutes: Math.trunc(raw.throttleWindowMinutes ?? 0),
    dailyCapPerRecipient: Math.trunc(raw.dailyCapPerRecipient ?? 0),
    supportsEmail: raw.supportsEmail === true,
    supportsLine: raw.supportsLine === true,
    supportsInApp: raw.supportsInApp === true,
    hasTrigger: raw.hasTrigger === true,
    isCustomized: raw.isCustomized === true,
    updatedAt: raw.updatedAt ?? null,
  };
}

/** §3.7 error bodies are `{ "message": "<ไทย>" }` for every non-2xx this contract defines. */
function messageFromBody(body: unknown): string | null {
  const message = asRecord(body)['message'];
  return typeof message === 'string' && message.trim() ? message.trim() : null;
}

@Injectable({ providedIn: 'root' })
export class NotificationConfigService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _items = signal<NotificationEventConfigItem[]>([]);
  private readonly _loading = signal(false);
  /** `true` once a request has come back (success or not), so "empty" and "not loaded yet" stay distinct. */
  private readonly _loaded = signal(false);

  /** Server-confirmed state only — the page never keeps an optimistic copy (same as job toggles). */
  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly loaded = this._loaded.asReadonly();

  /** §3.7 `GET /api/admin/notification-config` — all 18 catalog events, ordered by group then key. */
  async load(): Promise<NotificationEventConfigItem[]> {
    this._loading.set(true);
    try {
      const raw = this.take(await getApiAdminNotificationConfig({ throwOnError: false }));
      const items = (raw ?? []).map(parseItem);
      this._items.set(items);
      return items;
    } catch (e) {
      this.apiFail.report('โหลดการตั้งค่าการแจ้งเตือนของระบบ', e);
      this._items.set([]);
      return [];
    } finally {
      this._loaded.set(true);
      this._loading.set(false);
    }
  }

  /**
   * §3.7 `PUT /api/admin/notification-config/{eventKey}` — replaces the whole row. Throws
   * {@link NotificationConfigError} so the page can toast the exact Thai sentence the API chose
   * (e.g. "การแจ้งเตือนนี้ไม่รองรับช่องทาง LINE").
   */
  async update(
    eventKey: string,
    request: UpdateNotificationEventConfigRequest,
  ): Promise<NotificationEventConfigItem> {
    const raw = this.take(
      await putApiAdminNotificationConfigByEventKey({
        path: { eventKey },
        body: request,
        throwOnError: false,
      }),
    );
    return this.replaceItem(parseItem(this.requireItem(raw)));
  }

  /** §3.7 `POST /api/admin/notification-config/{eventKey}/reset` — drops the override. */
  async reset(eventKey: string): Promise<NotificationEventConfigItem> {
    const raw = this.take(
      await postApiAdminNotificationConfigByEventKeyReset({
        path: { eventKey },
        throwOnError: false,
      }),
    );
    return this.replaceItem(parseItem(this.requireItem(raw)));
  }

  /**
   * Test helper — the admin page's specs drive rendering/validation without a network layer.
   * Mirrors `setItemsForTest` on `NotificationFeedService`.
   */
  setItemsForTest(items: NotificationEventConfigItem[]): void {
    this._items.set(items);
    this._loaded.set(true);
  }

  private replaceItem(item: NotificationEventConfigItem): NotificationEventConfigItem {
    this._items.update((items) =>
      items.map((existing) => (existing.eventKey === item.eventKey ? item : existing)),
    );
    return item;
  }

  /**
   * The status-aware counterpart of `unwrapSdkResult`: the three helpers above run with
   * `throwOnError: false`, so a non-2xx arrives as data rather than an exception and the HTTP
   * status — the thing that separates "ไม่มีสิทธิ์" (403) from the body's own sentence (400/404) — is
   * still on the response.
   */
  private take<T>(result: { data?: T; error?: unknown; response?: Response }): T | undefined {
    const status = result.response?.status;
    if (status !== undefined && status >= 200 && status < 300) return result.data;

    throw new NotificationConfigError(this.failureMessage(status, result.error), status);
  }

  /** A 200 on `PUT`/`POST …/reset` always carries the row it just wrote (§3.7). */
  private requireItem(
    raw: GeneratedNotificationEventConfigItem | undefined,
  ): GeneratedNotificationEventConfigItem {
    if (raw) return raw;
    throw new NotificationConfigError(GENERIC_FAILURE_MESSAGE, undefined);
  }

  private failureMessage(status: number | undefined, error: unknown): string {
    if (status === 403) return FORBIDDEN_MESSAGE;
    if (status === 401) return UNAUTHORIZED_MESSAGE;
    return messageFromBody(error) ?? GENERIC_FAILURE_MESSAGE;
  }
}

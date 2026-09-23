import { DestroyRef, Injectable, InjectionToken, computed, effect, inject, signal, untracked } from '@angular/core';
import { applyApiRequestHeaders, resolveApiUrl } from '../api-runtime';
import { AuthService } from './auth.service';
import { NotificationFeedService } from './notification-feed.service';
import { NotificationToastService } from './notification-toast.service';

/**
 * kafka-redis-notifications v1 §4: the `fetch` the stream uses. A token (not the global) so
 * specs can feed scripted responses without touching `globalThis.fetch`.
 */
export const NOTIFICATION_STREAM_FETCH = new InjectionToken<typeof fetch>('NOTIFICATION_STREAM_FETCH', {
  providedIn: 'root',
  factory: () => (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
});

/** §3.3: minimal-API endpoint, deliberately absent from OpenAPI (so no SDK helper exists). */
export const NOTIFICATION_STREAM_PATH = '/api/notifications/stream';

export const NOTIFICATION_STREAM_BACKOFF_MIN_MS = 1_000;
export const NOTIFICATION_STREAM_BACKOFF_MAX_MS = 30_000;
/** §4: pushed signals are coalesced before hitting `GET feed/unread-count`. */
export const NOTIFICATION_STREAM_DEBOUNCE_MS = 300;

/** One dispatched Server-Sent Event. `event` defaults to `"message"` per the SSE spec. */
export interface SseEvent {
  event: string;
  data: string;
}

/** Payload of an `event: notification` frame (§3.3). */
export interface NotificationStreamSignal {
  key: string;
  kind?: string;
}

/**
 * Pure SSE framing: splits `buffer` into complete events (blank-line terminated) and returns
 * the unterminated tail as `rest` for the next chunk. Comment lines (`: ping`) and frames with
 * no `data:` line are dropped; multiple `data:` lines join with `\n`. Accepts `\n`, `\r\n`, `\r`.
 */
export function parseSseChunk(buffer: string): { events: SseEvent[]; rest: string } {
  // A lone trailing `\r` may be the first half of a `\r\n` split across chunks — keep it back.
  const heldBack = buffer.endsWith('\r') ? '\r' : '';
  const text = (heldBack ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, '\n');

  const events: SseEvent[] = [];
  let start = 0;
  let boundary = text.indexOf('\n\n', start);
  while (boundary !== -1) {
    const event = parseSseBlock(text.slice(start, boundary));
    if (event) events.push(event);
    start = boundary + 2;
    boundary = text.indexOf('\n\n', start);
  }
  return { events, rest: text.slice(start) + heldBack };
}

function parseSseBlock(block: string): SseEvent | null {
  let eventName = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value || 'message';
    else if (field === 'data') data.push(value);
  }
  return data.length === 0 ? null : { event: eventName, data: data.join('\n') };
}

/** Exponential backoff 1s → 30s with ±20% jitter (clamped to the range); `attempt` is 0-based. */
export function notificationStreamBackoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(
    NOTIFICATION_STREAM_BACKOFF_MAX_MS,
    NOTIFICATION_STREAM_BACKOFF_MIN_MS * 2 ** Math.max(0, attempt),
  );
  const jittered = base * (0.8 + random() * 0.4);
  return Math.round(
    Math.min(NOTIFICATION_STREAM_BACKOFF_MAX_MS, Math.max(NOTIFICATION_STREAM_BACKOFF_MIN_MS, jittered)),
  );
}

type ConnectOutcome = 'closed' | 'unauthorized' | 'not-found' | 'failed' | 'aborted';

/**
 * kafka-redis-notifications v1 §4 — real-time "your feed changed" signals over SSE.
 *
 * Uses `fetch` streaming rather than `EventSource` so the request carries the same
 * `Authorization: Bearer` / `Accept-Language` / `X-Dev-Role` headers the generated SDK sends
 * (`applyApiRequestHeaders`). Runs while a user is signed in (effect on the auth user id) and
 * also owns starting/stopping `NotificationFeedService`'s single fallback poll timer, whose
 * cadence follows `connected` (60s down / 5 min up).
 *
 * Failure policy: network error / stream end → reconnect with backoff; 401 →
 * `auth.refreshSession()` once, then reconnect (a second 401 in a row stops); 404 (realtime
 * disabled server-side) → stop until the next sign-in. Polling keeps the bell correct meanwhile.
 *
 * Force-instantiated from `app.ts`, like `NotificationToastService`.
 */
@Injectable({ providedIn: 'root' })
export class NotificationStreamService {
  private readonly auth = inject(AuthService);
  private readonly feed = inject(NotificationFeedService);
  private readonly toast = inject(NotificationToastService);
  private readonly fetchFn = inject(NOTIFICATION_STREAM_FETCH);

  private readonly _connected = signal<boolean>(false);
  /** True while the SSE response is open and being read. */
  readonly connected = this._connected.asReadonly();

  /** Bumped on every start/stop/halt so stale async loops notice they were superseded. */
  private generation = 0;
  private abort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingToastCheck = false;
  private attempt = 0;
  private refreshTried = false;
  private hasConnectedBefore = false;
  private running = false;

  /**
   * Only the id is tracked: a new `user` object for the same account (profile edit, session
   * re-hydrate) must not tear down and reopen the stream.
   */
  private readonly signedInUserId = computed(() => this.auth.user()?.id ?? null);

  constructor() {
    effect(() => {
      const userId = this.signedInUserId();
      untracked(() => {
        if (userId) this.start();
        else this.stop();
      });
    });
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  /** True between `start()` and `stop()` — stays true after a 404/401 halt (poll still runs). */
  isRunning(): boolean {
    return this.running;
  }

  /** (Re)starts the stream and the fallback poll for the current session. */
  start(): void {
    this.stop();
    this.running = true;
    this.attempt = 0;
    this.refreshTried = false;
    this.hasConnectedBefore = false;
    this.feed.startPolling();
    void this.connectLoop(this.generation);
  }

  stop(): void {
    this.generation++;
    this.running = false;
    this.abort?.abort();
    this.abort = null;
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.pendingToastCheck = false;
    this.setConnected(false);
    this.feed.stopPolling();
  }

  private async connectLoop(generation: number): Promise<void> {
    const outcome = await this.connectOnce(generation);
    if (generation !== this.generation) return;
    this.setConnected(false);

    switch (outcome) {
      case 'aborted':
        return;
      case 'not-found':
        // §4: realtime is disabled server-side — keep polling, stop trying for this session.
        this.halt();
        return;
      case 'unauthorized': {
        if (this.refreshTried) {
          this.halt();
          return;
        }
        this.refreshTried = true;
        const token = await this.auth.refreshSession().catch(() => null);
        if (generation !== this.generation) return;
        if (!token) {
          this.halt();
          return;
        }
        void this.connectLoop(generation);
        return;
      }
      default:
        this.scheduleReconnect(generation);
    }
  }

  private scheduleReconnect(generation: number): void {
    const delay = notificationStreamBackoffMs(this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (generation === this.generation) void this.connectLoop(generation);
    }, delay);
  }

  /** Stops reconnecting for this session but keeps the fallback poll running. */
  private halt(): void {
    this.generation++;
    this.abort = null;
  }

  private async connectOnce(generation: number): Promise<ConnectOutcome> {
    const controller = new AbortController();
    this.abort = controller;

    const headers = applyApiRequestHeaders(
      new Headers({ Accept: 'text/event-stream' }),
      untracked(() => this.auth.accessToken()),
    );

    let response: Response;
    try {
      response = await this.fetchFn(resolveApiUrl(NOTIFICATION_STREAM_PATH), {
        method: 'GET',
        headers,
        credentials: 'include',
        cache: 'no-store',
        signal: controller.signal,
      });
    } catch {
      return controller.signal.aborted ? 'aborted' : 'failed';
    }
    if (generation !== this.generation) return 'aborted';
    if (response.status === 401) return 'unauthorized';
    if (response.status === 404) return 'not-found';
    if (!response.ok || !response.body) return 'failed';

    this.attempt = 0;
    this.refreshTried = false;
    this.setConnected(true);
    if (this.hasConnectedBefore) {
      // Signals may have been missed while disconnected — catch up once.
      this.queueRefresh(false);
    }
    this.hasConnectedBefore = true;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (generation !== this.generation) return 'aborted';
        if (done) return 'closed';
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) this.handleEvent(event);
      }
    } catch {
      return controller.signal.aborted ? 'aborted' : 'failed';
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* already released */
      }
    }
  }

  private handleEvent(event: SseEvent): void {
    if (event.event !== 'notification') return;
    let key = '';
    try {
      const payload = JSON.parse(event.data) as Partial<NotificationStreamSignal> | null;
      key = typeof payload?.key === 'string' ? payload.key : '';
    } catch {
      /* a malformed payload still means "something changed" */
    }
    this.queueRefresh(key !== 'read');
  }

  /**
   * §4: debounced 300ms — unread count + (if loaded) bell preview; toast check unless every
   * coalesced signal was a read-state change.
   */
  private queueRefresh(checkToast: boolean): void {
    this.pendingToastCheck ||= checkToast;
    if (this.debounceTimer !== null) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      const toast = this.pendingToastCheck;
      this.pendingToastCheck = false;
      this.feed.refreshUnreadCount();
      this.feed.reloadPreview();
      if (toast) void this.toast.checkForNewNotifications();
    }, NOTIFICATION_STREAM_DEBOUNCE_MS);
  }

  private setConnected(connected: boolean): void {
    this._connected.set(connected);
    this.feed.setStreamConnected(connected);
  }
}

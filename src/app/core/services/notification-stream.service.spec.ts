import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from './auth.service';
import { NotificationFeedService } from './notification-feed.service';
import { NotificationToastService } from './notification-toast.service';
import {
  NOTIFICATION_STREAM_BACKOFF_MAX_MS,
  NOTIFICATION_STREAM_DEBOUNCE_MS,
  NOTIFICATION_STREAM_FETCH,
  NotificationStreamService,
  notificationStreamBackoffMs,
  parseSseChunk,
} from './notification-stream.service';

/** kafka-redis-notifications v1 §3.3 frames / §4 client behaviour. */

describe('parseSseChunk', () => {
  it('parses the three frame shapes the server sends', () => {
    const { events, rest } = parseSseChunk(
      'event: ready\ndata: {"heartbeatSeconds":20}\n\n: ping\n\nevent: notification\ndata: {"key":"sale","kind":"user"}\n\n',
    );
    expect(events).toEqual([
      { event: 'ready', data: '{"heartbeatSeconds":20}' },
      { event: 'notification', data: '{"key":"sale","kind":"user"}' },
    ]);
    expect(rest).toBe('');
  });

  it('keeps an unterminated frame as rest and completes it with the next chunk', () => {
    const first = parseSseChunk('event: notification\ndata: {"key":');
    expect(first.events).toEqual([]);
    const second = parseSseChunk(`${first.rest}"read"}\n\n`);
    expect(second.events).toEqual([{ event: 'notification', data: '{"key":"read"}' }]);
    expect(second.rest).toBe('');
  });

  it('accepts CRLF line endings, including a CRLF split across chunks', () => {
    const first = parseSseChunk('event: notification\r\ndata: {"key":"sale"}\r\n\r');
    expect(first.events).toEqual([]);
    const second = parseSseChunk(`${first.rest}\n`);
    expect(second.events).toEqual([{ event: 'notification', data: '{"key":"sale"}' }]);
  });

  it('joins multiple data lines, defaults the event name, and drops data-less frames', () => {
    const { events } = parseSseChunk('data: a\ndata: b\n\nevent: ready\n\nid: 1\n\n');
    expect(events).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});

describe('notificationStreamBackoffMs', () => {
  it('grows from 1s and caps at 30s with jitter inside ±20%', () => {
    expect(notificationStreamBackoffMs(0, () => 0.5)).toBe(1_000);
    expect(notificationStreamBackoffMs(1, () => 0.5)).toBe(2_000);
    expect(notificationStreamBackoffMs(10, () => 0.5)).toBe(NOTIFICATION_STREAM_BACKOFF_MAX_MS);
    expect(notificationStreamBackoffMs(3, () => 0)).toBe(6_400);
    expect(notificationStreamBackoffMs(3, () => 0.999)).toBeLessThanOrEqual(9_600);
    expect(notificationStreamBackoffMs(0, () => 0)).toBe(1_000);
    expect(notificationStreamBackoffMs(20, () => 0.999)).toBe(NOTIFICATION_STREAM_BACKOFF_MAX_MS);
  });
});

/** A fake `response.body` whose chunks the test pushes by hand. */
function controllableBody() {
  const encoder = new TextEncoder();
  const queue: Array<{ value?: Uint8Array; done: boolean }> = [];
  let waiting: ((r: { value?: Uint8Array; done: boolean }) => void) | null = null;
  const deliver = (item: { value?: Uint8Array; done: boolean }) => {
    if (waiting) {
      const w = waiting;
      waiting = null;
      w(item);
    } else {
      queue.push(item);
    }
  };
  const reader = {
    read: () =>
      new Promise<{ value?: Uint8Array; done: boolean }>((resolve) => {
        const next = queue.shift();
        if (next) resolve(next);
        else waiting = resolve;
      }),
    releaseLock: () => {},
  };
  return {
    body: { getReader: () => reader },
    push: (text: string) => deliver({ value: encoder.encode(text), done: false }),
    close: () => deliver({ done: true }),
  };
}

function okResponse(body: { getReader: () => unknown }): Response {
  return { status: 200, ok: true, body } as unknown as Response;
}

function statusResponse(status: number): Response {
  return { status, ok: false, body: null } as unknown as Response;
}

function build(initialUserId: string | null = 'user-1') {
  const user = signal<{ id: string } | null>(initialUserId ? { id: initialUserId } : null);
  const accessToken = signal<string | null>('token-1');
  const refreshSession = vi.fn<() => Promise<string | null>>().mockResolvedValue('token-2');
  const feed = {
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    setStreamConnected: vi.fn(),
    refreshUnreadCount: vi.fn(),
    reloadPreview: vi.fn(),
  };
  const toast = { checkForNewNotifications: vi.fn().mockResolvedValue(undefined) };
  const fetchFn = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { user, accessToken, refreshSession } },
      { provide: NotificationFeedService, useValue: feed },
      { provide: NotificationToastService, useValue: { ...toast } },
      { provide: NOTIFICATION_STREAM_FETCH, useValue: fetchFn },
    ],
  });
  const toastInstance = TestBed.inject(NotificationToastService) as unknown as typeof toast;
  return { user, accessToken, refreshSession, feed, toast: toastInstance, fetchFn };
}

function startService(): NotificationStreamService {
  const service = TestBed.inject(NotificationStreamService);
  TestBed.tick();
  return service;
}

describe('NotificationStreamService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('opens the stream with Bearer / Accept-Language / SSE accept and starts polling when signed in', async () => {
    const ctx = build();
    const stream = controllableBody();
    ctx.fetchFn.mockResolvedValue(okResponse(stream.body));

    const service = startService();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.feed.startPolling).toHaveBeenCalledTimes(1);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = ctx.fetchFn.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/notifications\/stream$/);
    const headers = init!.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-1');
    expect(headers.get('Accept')).toBe('text/event-stream');
    expect(headers.get('Accept-Language')).toBeTruthy();
    expect(init!.credentials).toBe('include');
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(service.connected()).toBe(true);
    expect(ctx.feed.setStreamConnected).toHaveBeenLastCalledWith(true);
  });

  it('does nothing while signed out', async () => {
    const ctx = build(null);
    startService();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.fetchFn).not.toHaveBeenCalled();
    expect(ctx.feed.startPolling).not.toHaveBeenCalled();
  });

  it('debounces notification frames into one refresh + one toast check', async () => {
    const ctx = build();
    const stream = controllableBody();
    ctx.fetchFn.mockResolvedValue(okResponse(stream.body));
    startService();
    await vi.advanceTimersByTimeAsync(0);

    stream.push('event: ready\ndata: {"heartbeatSeconds":20}\n\n');
    stream.push('event: notification\ndata: {"key":"sale","kind":"user"}\n\n');
    stream.push(': ping\n\nevent: notification\ndata: {"key":"review","kind":"user"}\n\n');
    await vi.advanceTimersByTimeAsync(NOTIFICATION_STREAM_DEBOUNCE_MS - 1);
    expect(ctx.feed.refreshUnreadCount).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.feed.refreshUnreadCount).toHaveBeenCalledTimes(1);
    expect(ctx.feed.reloadPreview).toHaveBeenCalledTimes(1);
    expect(ctx.toast.checkForNewNotifications).toHaveBeenCalledTimes(1);
  });

  it('refreshes the count but skips the toast check for a "read" signal', async () => {
    const ctx = build();
    const stream = controllableBody();
    ctx.fetchFn.mockResolvedValue(okResponse(stream.body));
    startService();
    await vi.advanceTimersByTimeAsync(0);

    stream.push('event: notification\ndata: {"key":"read","kind":"user"}\n\n');
    await vi.advanceTimersByTimeAsync(NOTIFICATION_STREAM_DEBOUNCE_MS);

    expect(ctx.feed.refreshUnreadCount).toHaveBeenCalledTimes(1);
    expect(ctx.toast.checkForNewNotifications).not.toHaveBeenCalled();
  });

  it('reconnects with backoff when the stream ends, and reports disconnected meanwhile', async () => {
    const ctx = build();
    const first = controllableBody();
    const second = controllableBody();
    ctx.fetchFn.mockResolvedValueOnce(okResponse(first.body)).mockResolvedValueOnce(okResponse(second.body));
    const service = startService();
    await vi.advanceTimersByTimeAsync(0);

    first.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(service.connected()).toBe(false);
    expect(ctx.feed.setStreamConnected).toHaveBeenLastCalledWith(false);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_200); // attempt 0: 1s ± 20%
    expect(ctx.fetchFn).toHaveBeenCalledTimes(2);
    expect(service.connected()).toBe(true);
  });

  it('retries a failed fetch with growing backoff', async () => {
    const ctx = build();
    ctx.fetchFn.mockRejectedValue(new TypeError('network down'));
    startService();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_200);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000); // attempt 1 needs ≥ 1.6s
    expect(ctx.fetchFn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(3);
  });

  it('on 401 refreshes the session once and reconnects with the new token', async () => {
    const ctx = build();
    const stream = controllableBody();
    ctx.refreshSession.mockImplementation(async () => {
      ctx.accessToken.set('token-2');
      return 'token-2';
    });
    ctx.fetchFn.mockResolvedValueOnce(statusResponse(401)).mockResolvedValueOnce(okResponse(stream.body));
    const service = startService();
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.refreshSession).toHaveBeenCalledTimes(1);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(2);
    const headers = ctx.fetchFn.mock.calls[1][1]!.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-2');
    expect(service.connected()).toBe(true);
  });

  it('stops after a second consecutive 401 (no refresh loop)', async () => {
    const ctx = build();
    ctx.fetchFn.mockResolvedValue(statusResponse(401));
    startService();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(ctx.refreshSession).toHaveBeenCalledTimes(1);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(2);
  });

  it('on 404 stops trying for the session but keeps the fallback poll', async () => {
    const ctx = build();
    ctx.fetchFn.mockResolvedValue(statusResponse(404));
    const service = startService();
    await vi.advanceTimersByTimeAsync(120_000);

    expect(ctx.fetchFn).toHaveBeenCalledTimes(1);
    expect(ctx.feed.stopPolling).toHaveBeenCalledTimes(1); // only the reset inside start()
    expect(service.isRunning()).toBe(true);
  });

  it('keeps the stream open when the user object changes but the id does not', async () => {
    const ctx = build();
    const stream = controllableBody();
    ctx.fetchFn.mockResolvedValue(okResponse(stream.body));
    const service = startService();
    await vi.advanceTimersByTimeAsync(0);
    const signal = ctx.fetchFn.mock.calls[0][1]!.signal as AbortSignal;

    ctx.user.set({ id: 'user-1' });
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);

    expect(signal.aborted).toBe(false);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(1);
    expect(service.connected()).toBe(true);
  });

  it('aborts the stream and stops polling on sign-out, and restarts on the next sign-in', async () => {
    const ctx = build();
    const stream = controllableBody();
    ctx.fetchFn.mockResolvedValue(okResponse(stream.body));
    const service = startService();
    await vi.advanceTimersByTimeAsync(0);
    const signal = ctx.fetchFn.mock.calls[0][1]!.signal as AbortSignal;

    ctx.user.set(null);
    TestBed.tick();
    expect(signal.aborted).toBe(true);
    expect(service.connected()).toBe(false);
    expect(service.isRunning()).toBe(false);
    expect(ctx.feed.stopPolling).toHaveBeenCalledTimes(2);

    // Frames arriving on the dead stream are ignored.
    stream.push('event: notification\ndata: {"key":"sale"}\n\n');
    await vi.advanceTimersByTimeAsync(NOTIFICATION_STREAM_DEBOUNCE_MS);
    expect(ctx.feed.refreshUnreadCount).not.toHaveBeenCalled();

    ctx.user.set({ id: 'user-2' });
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctx.fetchFn).toHaveBeenCalledTimes(2);
    expect(ctx.feed.startPolling).toHaveBeenCalledTimes(2);
  });
});

import { TestBed } from '@angular/core/testing';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  NOTIFICATION_POLL_CONNECTED_MS,
  NOTIFICATION_POLL_DISCONNECTED_MS,
  NotificationFeedService,
} from './notification-feed.service';

/**
 * kafka-redis-notifications v1 §4: the single app-wide poll timer — 60s while the SSE stream
 * is disconnected, 5 min while it is connected. `refreshUnreadCount` is stubbed so no request
 * leaves; only the timer behaviour is under test.
 */
function build() {
  TestBed.configureTestingModule({
    providers: [NotificationFeedService, { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  const service = TestBed.inject(NotificationFeedService);
  const refresh = vi.spyOn(service, 'refreshUnreadCount').mockImplementation(() => {});
  return { service, refresh };
}

describe('NotificationFeedService poll timer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('does not poll until started', () => {
    const { refresh } = build();
    vi.advanceTimersByTime(NOTIFICATION_POLL_CONNECTED_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('polls every 60s while the stream is disconnected', () => {
    const { service, refresh } = build();
    service.startPolling();
    expect(service.pollIntervalMs()).toBe(NOTIFICATION_POLL_DISCONNECTED_MS);

    vi.advanceTimersByTime(NOTIFICATION_POLL_DISCONNECTED_MS * 3);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('switches to 5 min while connected and back to 60s on disconnect', () => {
    const { service, refresh } = build();
    service.startPolling();
    service.setStreamConnected(true);
    expect(service.pollIntervalMs()).toBe(NOTIFICATION_POLL_CONNECTED_MS);

    vi.advanceTimersByTime(NOTIFICATION_POLL_CONNECTED_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);

    service.setStreamConnected(false);
    vi.advanceTimersByTime(NOTIFICATION_POLL_DISCONNECTED_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps a single timer when started twice and runs poll listeners on each tick', () => {
    const { service, refresh } = build();
    const listener = vi.fn();
    const remove = service.addPollListener(listener);
    service.startPolling();
    service.startPolling();

    vi.advanceTimersByTime(NOTIFICATION_POLL_DISCONNECTED_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);

    remove();
    vi.advanceTimersByTime(NOTIFICATION_POLL_DISCONNECTED_MS);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops ticking after stopPolling', () => {
    const { service, refresh } = build();
    service.startPolling();
    service.stopPolling();
    vi.advanceTimersByTime(NOTIFICATION_POLL_DISCONNECTED_MS * 5);
    expect(refresh).not.toHaveBeenCalled();
    expect(service.isPolling()).toBe(false);
  });

  it('reloadPreview re-runs the last loadPreview arguments and is a no-op before one', async () => {
    const { service } = build();
    const fetchPage = vi
      .spyOn(service as unknown as { fetchFeedPage: (...args: unknown[]) => Promise<unknown> }, 'fetchFeedPage')
      .mockResolvedValue({ items: [], totalCount: 0 });

    service.reloadPreview();
    expect(fetchPage).not.toHaveBeenCalled();

    service.loadPreview(10, 'seller');
    service.reloadPreview();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage.mock.calls[1]).toEqual([1, 10, 'seller']);
  });
});

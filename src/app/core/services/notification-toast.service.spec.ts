import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { NotificationToastService, severityForNotificationKey } from './notification-toast.service';
import { AuthService } from './auth.service';
import { NotificationContextService, type NotificationAudience } from './notification-context.service';
import { NotificationFeedService, type NotificationFeedItemResponse } from './notification-feed.service';

/**
 * Feature request: "เมื่อมีการแจ้งเตือนเข้ามาอยากให้มี popup ... เด้งขึ้นด้านขวามือ".
 *
 * Every test drives `checkForNewNotifications()` directly (the same method the constructor's
 * `effect()`/`interval()` call) rather than relying on real timers or flushing Angular's effect
 * scheduler — same approach `seller-application.service.spec.ts` takes with its own
 * account-switch effect: the reactive wiring is a thin, hard-to-flush-deterministically shell
 * around a plain testable method.
 */
function feedItem(overrides: Partial<NotificationFeedItemResponse> = {}): NotificationFeedItemResponse {
  return {
    id: 'n-1',
    key: 'sale',
    title: 'ขายได้แล้ว!',
    body: 'มีคำสั่งซื้อใหม่เข้ามาในร้านของคุณ',
    linkUrl: '/orders/1',
    isRead: false,
    createdAt: '2026-09-18T03:00:00Z',
    audience: 'buyer',
    ...overrides,
  };
}

function build(opts: { authed?: boolean; userId?: string | null } = {}) {
  const authed = opts.authed ?? true;
  const fetchRecentForToast = vi.fn<
    (size: number, audience?: NotificationAudience) => Promise<NotificationFeedItemResponse[]>
  >().mockResolvedValue([]);
  const markRead = vi.fn(() => ({ subscribe: (_o?: unknown) => {} }));
  const create = vi.fn<
    (type: string, title: string, content: string) => { onClick: Subject<MouseEvent> }
  >(() => ({ onClick: new Subject<MouseEvent>() }));
  const info = vi.fn<
    (title: string, content: string) => { onClick: Subject<MouseEvent> }
  >(() => ({ onClick: new Subject<MouseEvent>() }));
  const navigateByUrl = vi.fn();
  const contextSignal = signal<NotificationAudience>('buyer');

  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          isAuthenticated: () => authed,
          user: () => (opts.userId !== undefined && opts.userId !== null ? { id: opts.userId } : null),
        },
      },
      { provide: NotificationContextService, useValue: { context: contextSignal } },
      { provide: NotificationFeedService, useValue: { fetchRecentForToast, markRead } },
      { provide: Router, useValue: { navigateByUrl } },
      { provide: NzNotificationService, useValue: { create, info } },
    ],
  });

  const service = TestBed.inject(NotificationToastService);
  return { service, fetchRecentForToast, markRead, create, info, navigateByUrl, contextSignal };
}

afterEach(() => TestBed.resetTestingModule());

describe('NotificationToastService', () => {
  it('does not toast anything on the very first poll (baseline only)', async () => {
    const { service, fetchRecentForToast, create } = build();
    fetchRecentForToast.mockResolvedValue([feedItem({ id: 'a' }), feedItem({ id: 'b' })]);

    await service.checkForNewNotifications();

    expect(create).not.toHaveBeenCalled();
  });

  it('toasts an item that appears on a later poll but was absent from the baseline poll', async () => {
    const { service, fetchRecentForToast, create } = build();
    fetchRecentForToast.mockResolvedValue([feedItem({ id: 'a' })]);
    await service.checkForNewNotifications();

    fetchRecentForToast.mockResolvedValue([
      feedItem({ id: 'a' }),
      feedItem({ id: 'b', key: 'document_approved', title: 'เอกสารได้รับอนุมัติแล้ว' }),
    ]);
    await service.checkForNewNotifications();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('success', 'เอกสารได้รับอนุมัติแล้ว', expect.any(String));
  });

  it('truncates a long body to a brief preview', async () => {
    const { service, fetchRecentForToast, create } = build();
    fetchRecentForToast.mockResolvedValue([]);
    await service.checkForNewNotifications();

    const longBody = 'ก'.repeat(120);
    fetchRecentForToast.mockResolvedValue([feedItem({ id: 'a', body: longBody })]);
    await service.checkForNewNotifications();

    const content = create.mock.calls[0][2] as string;
    expect(content.length).toBeLessThan(longBody.length);
    expect(content.endsWith('…')).toBe(true);
  });

  it('never toasts the same id twice across polls', async () => {
    const { service, fetchRecentForToast, create } = build();
    fetchRecentForToast.mockResolvedValue([]);
    await service.checkForNewNotifications();

    fetchRecentForToast.mockResolvedValue([feedItem({ id: 'a' })]);
    await service.checkForNewNotifications();
    await service.checkForNewNotifications();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it('shows at most 3 individual toasts and groups the rest into one "+N more" toast', async () => {
    const { service, fetchRecentForToast, create, info } = build();
    fetchRecentForToast.mockResolvedValue([]);
    await service.checkForNewNotifications();

    fetchRecentForToast.mockResolvedValue([
      feedItem({ id: 'a' }),
      feedItem({ id: 'b' }),
      feedItem({ id: 'c' }),
      feedItem({ id: 'd' }),
      feedItem({ id: 'e' }),
    ]);
    await service.checkForNewNotifications();

    expect(create).toHaveBeenCalledTimes(3);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toContain('2');
  });

  it('does not poll the API while signed out', async () => {
    const { service, fetchRecentForToast } = build({ authed: false });

    await service.checkForNewNotifications();

    expect(fetchRecentForToast).not.toHaveBeenCalled();
  });

  it('navigates to the safe link and marks the item read when a single toast is clicked', async () => {
    const { service, fetchRecentForToast, create, markRead, navigateByUrl } = build();
    fetchRecentForToast.mockResolvedValue([]);
    await service.checkForNewNotifications();

    fetchRecentForToast.mockResolvedValue([feedItem({ id: 'a', linkUrl: '/orders/1' })]);
    await service.checkForNewNotifications();

    const onClick$ = create.mock.results[0].value.onClick as Subject<MouseEvent>;
    onClick$.next(new MouseEvent('click'));

    expect(markRead).toHaveBeenCalledWith('a');
    expect(navigateByUrl).toHaveBeenCalledWith('/orders/1');
  });

  it('navigates to the current audience notifications route when the grouped toast is clicked', async () => {
    const { service, fetchRecentForToast, info, navigateByUrl } = build();
    fetchRecentForToast.mockResolvedValue([]);
    await service.checkForNewNotifications();

    fetchRecentForToast.mockResolvedValue([
      feedItem({ id: 'a' }),
      feedItem({ id: 'b' }),
      feedItem({ id: 'c' }),
      feedItem({ id: 'd' }),
    ]);
    await service.checkForNewNotifications();

    const onClick$ = info.mock.results[0].value.onClick as Subject<MouseEvent>;
    onClick$.next(new MouseEvent('click'));

    expect(navigateByUrl).toHaveBeenCalledWith('/notifications');
  });

  it('re-baselines a layout the reader switches into instead of toasting its whole backlog', async () => {
    const { service, fetchRecentForToast, contextSignal, create } = build();
    fetchRecentForToast.mockResolvedValue([]);
    await service.checkForNewNotifications();

    // Switch into the seller layout for the first time this session — its existing backlog of
    // rows must not all read as "new arrivals" just because the buyer layout was baselined already.
    contextSignal.set('seller');
    fetchRecentForToast.mockResolvedValue([
      feedItem({ id: 's1', audience: 'seller' }),
      feedItem({ id: 's2', audience: 'seller' }),
    ]);
    await service.checkForNewNotifications();

    expect(create).not.toHaveBeenCalled();
  });

  describe('severityForNotificationKey', () => {
    it('maps document_rejected to error and sale to success', () => {
      expect(severityForNotificationKey('document_rejected')).toBe('error');
      expect(severityForNotificationKey('sale')).toBe('success');
    });

    it('falls back to info for an unrecognised key', () => {
      expect(severityForNotificationKey('something_new')).toBe('info');
    });
  });
});

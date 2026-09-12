import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import {
  NotificationContextService,
  NotificationFeedService,
  type NotificationAudience,
  type NotificationFeedItemResponse,
} from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §1, §4)
 * · notification-master-config v1 §1.3 (AC-5, AC-6, AC-8, AC-10).
 *
 * The dropdown's own content renders through ng-zorro's `nz-dropdown-menu` (CDK overlay),
 * so — same as AC-13's "frontend component spec + ตรวจด้วยตา" split — these specs assert
 * the trigger button's DOM (badge) directly and the component's public
 * methods/`previewItems()` for the dropdown-driving logic, rather than the overlay markup.
 *
 * The reader's layout is set through `NotificationContextService.setContextForTest` instead
 * of a real navigation: `/seller` and `/admin` would need dummy routed components here, and
 * the URL → context mapping has its own spec (`notification-context.service.spec.ts`).
 */
function item(overrides: Partial<NotificationFeedItemResponse> = {}): NotificationFeedItemResponse {
  return {
    id: 'feed-1',
    key: 'new_document_from_followed_seller',
    title: 'ร้าน Siri Studio เพิ่งลงเอกสารใหม่',
    body: 'คณิตศาสตร์ ม.6 เทอม 1',
    linkUrl: '/document/doc-1',
    isRead: false,
    createdAt: '2026-09-08T03:00:00Z',
    audience: 'buyer',
    ...overrides,
  };
}

function buildFixture(audience: NotificationAudience = 'buyer') {
  TestBed.configureTestingModule({
    imports: [NotificationBellComponent],
    providers: [provideRouter([]), { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  const context = TestBed.inject(NotificationContextService);
  context.setContextForTest(audience);
  const fixture = TestBed.createComponent(NotificationBellComponent);
  const feed = TestBed.inject(NotificationFeedService);
  return { fixture, feed, context };
}

afterEach(() => TestBed.resetTestingModule());

describe('NotificationBellComponent', () => {
  it('hides the badge when unreadCount is 0', () => {
    const { fixture, feed } = buildFixture();
    feed.setUnreadCountForTest(0);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    expect(trigger).toBeTruthy();
    expect(trigger.querySelector('span.bg-pink-500')).toBeNull();
  });

  it('shows the badge with the unread count when > 0', () => {
    const { fixture, feed } = buildFixture();
    feed.setUnreadCountForTest(4);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    const badge = trigger.querySelector('span.bg-pink-500');
    expect(badge?.textContent?.trim()).toBe('4');
    expect(trigger.getAttribute('aria-label')).toBe('การแจ้งเตือน 4 รายการที่ยังไม่อ่าน');
  });

  it('previewItems slices the shared items list to the dropdown preview size', () => {
    const { fixture, feed } = buildFixture();
    const items = Array.from({ length: 15 }, (_, i) => item({ id: `feed-${i}` }));
    feed.setItemsForTest(items);
    fixture.detectChanges();

    expect(fixture.componentInstance.previewItems().length).toBe(10);
    expect(fixture.componentInstance.previewItems()[0].id).toBe('feed-0');
  });

  it('clicking a notification row marks it read and navigates to linkUrl immediately', () => {
    const { fixture, feed } = buildFixture();
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/document/doc-1', isRead: false })]);
    feed.setUnreadCountForTest(1);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    // AC-8: `navigateByUrl`, not `navigate([...])` — the latter encodes `?tab=paid` into a path segment.
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const markReadSpy = vi.spyOn(feed, 'markRead');

    fixture.componentInstance.onItemClick(feed.items()[0]);

    expect(markReadSpy).toHaveBeenCalledWith('a');
    expect(navigateSpy).toHaveBeenCalledWith('/document/doc-1');
    // Optimistic update already applied, before any API response.
    expect(feed.items()[0].isRead).toBe(true);
    expect(feed.unreadCount()).toBe(0);
  });

  it('"อ่านทั้งหมด" marks every item read and zeroes the badge optimistically', () => {
    const { fixture, feed } = buildFixture();
    feed.setItemsForTest([
      item({ id: 'a', isRead: false }),
      item({ id: 'b', isRead: false }),
    ]);
    feed.setUnreadCountForTest(2);
    fixture.detectChanges();

    const markAllReadSpy = vi.spyOn(feed, 'markAllRead');

    fixture.componentInstance.onMarkAllRead();
    fixture.detectChanges();

    expect(markAllReadSpy).toHaveBeenCalled();
    expect(feed.items().every((i) => i.isRead)).toBe(true);
    expect(feed.unreadByAudience().buyer).toBe(0);

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    expect(trigger.querySelector('span.bg-pink-500')).toBeNull();
  });

  it('renders topbar variant with text and badge when unreadCount > 0', () => {
    const { fixture, feed } = buildFixture();
    fixture.componentRef.setInput('variant', 'topbar');
    feed.setUnreadCountForTest(3);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    expect(trigger).toBeTruthy();
    expect(trigger.textContent).toContain('การแจ้งเตือน');
    const badge = trigger.querySelector('span.bg-pink-500');
    expect(badge?.textContent?.trim()).toBe('3');
  });

  // ---- notification-master-config v1 ----

  it('AC-5: requests the feed with the audience of the layout the reader is standing in', () => {
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [provideRouter([]), { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
    });
    const feed = TestBed.inject(NotificationFeedService);
    const loadPreviewSpy = vi.spyOn(feed, 'loadPreview').mockImplementation(() => { /* no network in specs */ });
    TestBed.inject(NotificationContextService).setContextForTest('seller');

    const fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();

    expect(loadPreviewSpy).toHaveBeenCalledWith(10, 'seller');
  });

  it('AC-5: reloads the preview when the reader moves to another layout', () => {
    const { fixture, feed, context } = buildFixture('buyer');
    const loadPreviewSpy = vi.spyOn(feed, 'loadPreview').mockImplementation(() => { /* no network in specs */ });
    fixture.detectChanges();
    loadPreviewSpy.mockClear();

    context.setContextForTest('admin');
    fixture.detectChanges();

    expect(loadPreviewSpy).toHaveBeenCalledWith(10, 'admin');
  });

  it('AC-5: badge counts only the current layout, not the cross-layout total', () => {
    const { fixture, feed } = buildFixture('seller');
    feed.setUnreadByAudienceForTest({ buyer: 7, seller: 2, admin: 5 });
    fixture.detectChanges();

    expect(feed.unreadCount()).toBe(14);
    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    expect(trigger.querySelector('span.bg-pink-500')?.textContent?.trim()).toBe('2');
  });

  it('AC-6: a row whose linkUrl points at another layout never leaves the current one', () => {
    const { fixture, feed } = buildFixture('buyer');
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/seller/reviews', audience: 'buyer' })]);
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.onItemClick(feed.items()[0]);

    const target = navigateSpy.mock.calls[0][0] as string;
    expect(target.startsWith('/seller')).toBe(false);
    expect(target.startsWith('/admin')).toBe(false);
    expect(target).toBe('/notifications');
  });

  it('AC-6: the same guard holds in the opposite direction, from the seller layout', () => {
    const { fixture, feed } = buildFixture('seller');
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/document/doc-1', audience: 'seller' })]);
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.onItemClick(feed.items()[0]);

    expect(navigateSpy).toHaveBeenCalledWith('/seller/notifications');
  });

  it('AC-8: a linkUrl carrying a query string survives navigation', () => {
    const { fixture, feed } = buildFixture('buyer');
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/orders?tab=paid' })]);
    fixture.detectChanges();

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.onItemClick(feed.items()[0]);

    expect(navigateSpy).toHaveBeenCalledWith('/orders?tab=paid');
  });

  it('AC-7: "ดูการแจ้งเตือนทั้งหมด" points at the current layout\'s own route', () => {
    const { fixture, context } = buildFixture('buyer');
    fixture.detectChanges();
    expect(fixture.componentInstance.allNotificationsRoute()).toBe('/notifications');

    context.setContextForTest('seller');
    expect(fixture.componentInstance.allNotificationsRoute()).toBe('/seller/notifications');

    context.setContextForTest('admin');
    expect(fixture.componentInstance.allNotificationsRoute()).toBe('/admin/notifications');
  });

  it('AC-10: shows a cross-context link for each other audience that has unread items', () => {
    const { fixture, feed } = buildFixture('buyer');
    feed.setUnreadByAudienceForTest({ buyer: 1, seller: 3, admin: 2 });
    fixture.detectChanges();

    const links = fixture.componentInstance.crossContextLinks();
    expect(links.map((l) => l.label)).toEqual([
      'การแจ้งเตือนของร้านค้า 3 รายการ',
      'การแจ้งเตือนของผู้ดูแลระบบ 2 รายการ',
    ]);
    expect(links.map((l) => l.route)).toEqual(['/seller/notifications', '/admin/notifications']);
  });

  it('AC-10: hides the cross-context link for an audience with nothing unread', () => {
    const { fixture, feed } = buildFixture('seller');
    feed.setUnreadByAudienceForTest({ buyer: 0, seller: 4, admin: 0 });
    fixture.detectChanges();

    expect(fixture.componentInstance.crossContextLinks()).toEqual([]);
  });

  it('AC-4: "อ่านทั้งหมด" clears only the current layout', () => {
    const { fixture, feed } = buildFixture('seller');
    feed.setUnreadByAudienceForTest({ buyer: 5, seller: 3, admin: 0 });
    fixture.detectChanges();

    const markAllReadSpy = vi.spyOn(feed, 'markAllRead');
    fixture.componentInstance.onMarkAllRead();

    expect(markAllReadSpy).toHaveBeenCalledWith('seller');
    expect(feed.unreadByAudience()).toEqual({ buyer: 5, seller: 0, admin: 0 });
    expect(feed.unreadCount()).toBe(5);
  });
});

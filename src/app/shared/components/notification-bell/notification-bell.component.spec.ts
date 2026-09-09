import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NotificationBellComponent } from './notification-bell.component';
import { NotificationFeedService, type NotificationFeedItemResponse } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §1, §4).
 *
 * The dropdown's own content renders through ng-zorro's `nz-dropdown-menu` (CDK overlay),
 * so — same as AC-13's "frontend component spec + ตรวจด้วยตา" split — these specs assert
 * the trigger button's DOM (badge) directly and the component's public
 * methods/`previewItems()` for the dropdown-driving logic, rather than the overlay markup.
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
    ...overrides,
  };
}

function buildFixture() {
  TestBed.configureTestingModule({
    imports: [NotificationBellComponent],
    providers: [provideRouter([]), { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  const fixture = TestBed.createComponent(NotificationBellComponent);
  const feed = TestBed.inject(NotificationFeedService);
  return { fixture, feed };
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
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const markReadSpy = vi.spyOn(feed, 'markRead');

    fixture.componentInstance.onItemClick(feed.items()[0]);

    expect(markReadSpy).toHaveBeenCalledWith('a');
    expect(navigateSpy).toHaveBeenCalledWith(['/document/doc-1']);
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
    expect(feed.unreadCount()).toBe(0);

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
});


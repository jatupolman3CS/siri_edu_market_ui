import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NotificationsPage } from './notifications.page';
import { NotificationFeedService, type NotificationFeedItemResponse } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * follow-store-notifications v1 (docs/contracts/follow-store-notifications.md §1, §4).
 * Covers the frontend test cases: initial load, "โหลดเพิ่มเติม" pagination, empty state.
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

function buildTestBed() {
  TestBed.configureTestingModule({
    imports: [NotificationsPage],
    providers: [provideRouter([]), { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return { feed: TestBed.inject(NotificationFeedService) };
}

afterEach(() => TestBed.resetTestingModule());

describe('NotificationsPage', () => {
  it('loads the first page on init', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed');

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    expect(loadFeedSpy).toHaveBeenCalledWith(1);
  });

  it('shows the exact empty-state copy when there are no notifications', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op: keep default empty state */ });

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีการแจ้งเตือน');
    expect(text).toContain('ลองติดตามร้านที่ชอบเพื่อรับข่าวเอกสารใหม่ก่อนใคร');
  });

  it('renders the loaded list instead of the empty state once items arrive', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op — seed via test helper below */ });
    feed.setItemsForTest([item({ id: 'a', title: 'ร้าน Siri Studio เพิ่งลงเอกสารใหม่' })]);

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ร้าน Siri Studio เพิ่งลงเอกสารใหม่');
    expect(text).not.toContain('ยังไม่มีการแจ้งเตือน');
  });

  it('shows "โหลดเพิ่มเติม" while more pages remain, and it calls loadFeed with the next page', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a' })]);
    feed.setTotalCountForTest(3);

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();
    loadFeedSpy.mockClear();

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('โหลดเพิ่มเติม')) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();

    expect(loadFeedSpy).toHaveBeenCalledWith(2);
  });

  it('hides "โหลดเพิ่มเติม" once every item has been loaded', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a' })]);
    feed.setTotalCountForTest(1);

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โหลดเพิ่มเติม');
  });

  it('clicking a notification row marks it read and navigates to linkUrl immediately', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/document/doc-1', isRead: false })]);
    feed.setUnreadCountForTest(1);

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const markReadSpy = vi.spyOn(feed, 'markRead');

    fixture.componentInstance.onItemClick(feed.items()[0]);

    expect(markReadSpy).toHaveBeenCalledWith('a');
    expect(navigateSpy).toHaveBeenCalledWith(['/document/doc-1']);
    expect(feed.items()[0].isRead).toBe(true);
  });
});

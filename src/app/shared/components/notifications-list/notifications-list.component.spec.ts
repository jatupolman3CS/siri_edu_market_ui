import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NotificationsListComponent } from './notifications-list.component';
import {
  NotificationFeedService,
  type NotificationAudience,
  type NotificationFeedItemResponse,
} from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * follow-store-notifications v1 §4 (initial load, "โหลดเพิ่มเติม" pagination, empty state —
 * these cases moved here with the code when the buyer page became a wrapper)
 * · notification-master-config v1 §1.3 / §4.1 (audience scoping, AC-4, AC-6, AC-8).
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

function buildTestBed() {
  TestBed.configureTestingModule({
    imports: [NotificationsListComponent],
    providers: [provideRouter([]), { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
  });
  return { feed: TestBed.inject(NotificationFeedService) };
}

function createFixture(audience: NotificationAudience = 'buyer') {
  const fixture = TestBed.createComponent(NotificationsListComponent);
  fixture.componentRef.setInput('audience', audience);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('NotificationsListComponent', () => {
  it('loads the first page of its own audience on init', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed');

    createFixture('seller');

    expect(loadFeedSpy).toHaveBeenCalledWith(1, 'seller');
  });

  it('shows the exact empty-state copy when there are no notifications', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op: keep default empty state */ });

    const fixture = createFixture('buyer');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีการแจ้งเตือน');
    expect(text).toContain('ลองติดตามร้านที่ชอบเพื่อรับข่าวเอกสารใหม่ก่อนใคร');
  });

  it('renders the loaded list instead of the empty state once items arrive', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op — seed via test helper below */ });
    feed.setItemsForTest([item({ id: 'a', title: 'ร้าน Siri Studio เพิ่งลงเอกสารใหม่' })]);

    const fixture = createFixture('buyer');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ร้าน Siri Studio เพิ่งลงเอกสารใหม่');
    expect(text).not.toContain('ยังไม่มีการแจ้งเตือน');
  });

  it('shows "โหลดเพิ่มเติม" while more pages remain, and it calls loadFeed with the next page', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a' })]);
    feed.setTotalCountForTest(3);

    const fixture = createFixture('buyer');
    loadFeedSpy.mockClear();

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('โหลดเพิ่มเติม')) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();

    button!.click();

    expect(loadFeedSpy).toHaveBeenCalledWith(2, 'buyer');
  });

  it('hides "โหลดเพิ่มเติม" once every item has been loaded', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a' })]);
    feed.setTotalCountForTest(1);

    const fixture = createFixture('buyer');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('โหลดเพิ่มเติม');
  });

  it('clicking a notification row marks it read and navigates to linkUrl immediately', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/document/doc-1', isRead: false })]);
    feed.setUnreadCountForTest(1);

    const fixture = createFixture('buyer');

    // AC-8: `navigateByUrl`, so `/orders?tab=paid` keeps its query string.
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const markReadSpy = vi.spyOn(feed, 'markRead');

    fixture.componentInstance.onItemClick(feed.items()[0]);

    expect(markReadSpy).toHaveBeenCalledWith('a');
    expect(navigateSpy).toHaveBeenCalledWith('/document/doc-1');
    expect(feed.items()[0].isRead).toBe(true);
  });

  // ---- notification-master-config v1 ----

  it('AC-6: a stale seller linkUrl on a buyer page never leaves the buyer layout', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setItemsForTest([item({ id: 'a', linkUrl: '/seller/reviews' })]);

    const fixture = createFixture('buyer');
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

    fixture.componentInstance.onItemClick(feed.items()[0]);

    const target = navigateSpy.mock.calls[0][0] as string;
    expect(target.startsWith('/seller')).toBe(false);
    expect(target.startsWith('/admin')).toBe(false);
  });

  it('AC-4: "อ่านทั้งหมด" sends this page\'s audience', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });
    feed.setUnreadByAudienceForTest({ buyer: 2, seller: 4, admin: 0 });
    feed.setItemsForTest([item({ id: 'a', audience: 'seller', linkUrl: '/seller/reviews' })]);

    const fixture = createFixture('seller');
    const markAllReadSpy = vi.spyOn(feed, 'markAllRead');

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('อ่านทั้งหมด')) as HTMLButtonElement | undefined;
    expect(button).toBeTruthy();
    button!.click();

    expect(markAllReadSpy).toHaveBeenCalledWith('seller');
    expect(feed.unreadByAudience()).toEqual({ buyer: 2, seller: 0, admin: 0 });
  });

  it('renders the §4.2 heading of its audience', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });

    expect(((createFixture('buyer').nativeElement as HTMLElement).textContent ?? '')).toContain('การแจ้งเตือนของฉัน');
    TestBed.resetTestingModule();

    buildTestBed();
    vi.spyOn(TestBed.inject(NotificationFeedService), 'loadFeed').mockImplementation(() => { /* no-op */ });
    expect(((createFixture('seller').nativeElement as HTMLElement).textContent ?? '')).toContain('การแจ้งเตือนของร้าน');
    TestBed.resetTestingModule();

    buildTestBed();
    vi.spyOn(TestBed.inject(NotificationFeedService), 'loadFeed').mockImplementation(() => { /* no-op */ });
    expect(((createFixture('admin').nativeElement as HTMLElement).textContent ?? '')).toContain('การแจ้งเตือนของผู้ดูแลระบบ');
  });

  it('offers the marketplace CTA only on the buyer empty state', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });

    const fixture = createFixture('admin');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เมื่อมีงานที่ต้องดำเนินการ');
    expect(text).not.toContain('ค้นหาร้านที่ชอบ');
  });
});

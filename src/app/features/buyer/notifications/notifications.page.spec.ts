import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { NotificationsPage } from './notifications.page';
import { NotificationFeedService, type NotificationFeedItemResponse } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * follow-store-notifications v1 §4 · notification-master-config v1 §1.3.
 *
 * `/notifications` is a wrapper since F-06 — the list body and its pagination/click cases now
 * live in `notifications-list.component.spec.ts`. What is asserted here is the wrapper's own
 * job: pick the audience up from the route and hand it to the shared list.
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

function buildTestBed(data: Record<string, unknown> = { audience: 'buyer' }) {
  TestBed.configureTestingModule({
    imports: [NotificationsPage],
    providers: [
      provideRouter([]),
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { data } } },
    ],
  });
  return { feed: TestBed.inject(NotificationFeedService) };
}

afterEach(() => TestBed.resetTestingModule());

describe('NotificationsPage', () => {
  it('loads the first page of the buyer feed on init', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed');

    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    expect(loadFeedSpy).toHaveBeenCalledWith(1, 'buyer');
  });

  it('takes the audience from route data', () => {
    buildTestBed({ audience: 'buyer' });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.audience()).toBe('buyer');
  });

  it('falls back to buyer when route data carries no usable audience', () => {
    buildTestBed({ audience: 'nonsense' });
    const fixture = TestBed.createComponent(NotificationsPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.audience()).toBe('buyer');
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
});

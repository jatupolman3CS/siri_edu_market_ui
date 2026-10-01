import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { NzDropdownDirective } from 'ng-zorro-antd/dropdown';
import { NotificationBellComponent } from './notification-bell.component';
import {
  NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY,
  NotificationContextService,
  NotificationFeedService,
  NotificationSoundService,
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
    providers: [
      provideRouter([]),
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      // The bell now injects the sound service; "no Web Audio" keeps every spec here silent.
      { provide: NOTIFICATION_SOUND_AUDIO_CONTEXT_FACTORY, useValue: () => null },
    ],
  });
  const context = TestBed.inject(NotificationContextService);
  context.setContextForTest(audience);
  const fixture = TestBed.createComponent(NotificationBellComponent);
  const feed = TestBed.inject(NotificationFeedService);
  return { fixture, feed, context };
}

const SOUND_STORAGE_KEY = 'siriedu.notificationSoundEnabled';

/**
 * The runner's Node exposes a `localStorage` global that is `undefined` without a backing file
 * (see `auth.service.spec.ts`), and the sound toggle persists its choice there — so every test
 * gets its own in-memory one.
 */
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
}

beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => {
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});

/**
 * Opens the real dropdown overlay (rendered into the CDK container on `<body>`, not under the
 * fixture) so the header controls can be clicked like a reader would. ng-zorro attaches the panel
 * behind a 150ms `auditTime` whose first timer is armed on the initial change-detection pass —
 * before any fake clock could be installed — so this waits in real time until the panel shows up.
 */
async function openDropdown(fixture: ComponentFixture<NotificationBellComponent>): Promise<void> {
  fixture.componentInstance.menuOpen.set(true);
  for (let attempt = 0; attempt < 50 && !soundToggle(); attempt++) {
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  fixture.detectChanges();
}

function soundToggle(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>('[data-testid="notification-sound-toggle"]');
}

describe('NotificationBellComponent', () => {
  it('hides the badge when unreadCount is 0', () => {
    const { fixture, feed } = buildFixture();
    feed.setUnreadCountForTest(0);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    expect(trigger).toBeTruthy();
    expect(trigger.querySelector('span.bg-primary')).toBeNull();
  });

  it('shows the badge with the unread count when > 0', () => {
    const { fixture, feed } = buildFixture();
    feed.setUnreadCountForTest(4);
    fixture.detectChanges();

    const trigger = (fixture.nativeElement as HTMLElement).querySelector(
      'button[nz-dropdown]',
    ) as HTMLElement;
    const badge = trigger.querySelector('span.bg-primary');
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
    expect(trigger.querySelector('span.bg-primary')).toBeNull();
  });

  it('opening the dropdown treats visible notifications as read for the current layout', () => {
    const { fixture, feed } = buildFixture('seller');
    feed.setPreviewItemsForTest([
      item({ id: 'seller-a', isRead: false, audience: 'seller' }),
      item({ id: 'buyer-a', isRead: false, audience: 'buyer' }),
    ]);
    feed.setUnreadByAudienceForTest({ buyer: 2, seller: 1, admin: 0 });
    fixture.detectChanges();

    const loadPreviewSpy = vi.spyOn(feed, 'loadPreview').mockImplementation(() => { /* no network in specs */ });
    const markAllReadSpy = vi.spyOn(feed, 'markAllRead');

    fixture.componentInstance.onVisibleChange(true);

    expect(loadPreviewSpy).toHaveBeenCalledWith(10, 'seller');
    expect(markAllReadSpy).toHaveBeenCalledWith('seller');
    expect(feed.previewItems().find((i) => i.id === 'seller-a')?.isRead).toBe(true);
    expect(feed.previewItems().find((i) => i.id === 'buyer-a')?.isRead).toBe(false);
    expect(feed.unreadByAudience()).toEqual({ buyer: 2, seller: 0, admin: 0 });
  });

  it('opening the dropdown does not mark-read again when the current layout has no unread items', () => {
    const { fixture, feed } = buildFixture('admin');
    feed.setUnreadByAudienceForTest({ buyer: 2, seller: 1, admin: 0 });
    fixture.detectChanges();

    vi.spyOn(feed, 'loadPreview').mockImplementation(() => { /* no network in specs */ });
    const markAllReadSpy = vi.spyOn(feed, 'markAllRead');

    fixture.componentInstance.onVisibleChange(true);

    expect(markAllReadSpy).not.toHaveBeenCalled();
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
    const badge = trigger.querySelector('span.bg-primary');
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
    expect(trigger.querySelector('span.bg-primary')?.textContent?.trim()).toBe('2');
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

  it('a notification click closes the dropdown (F135)', () => {
    const { fixture, feed } = buildFixture();
    feed.setItemsForTest([item({ id: 'a' })]);
    fixture.detectChanges();
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture.componentInstance.menuOpen.set(true);
    fixture.componentInstance.onItemClick(feed.items()[0]);
    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });

  it('binds the trigger to menuOpen so the View-all / cross-role links can close it (F135)', () => {
    const { fixture } = buildFixture();
    fixture.detectChanges();
    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    const dropdown = fixture.debugElement.query(By.directive(NzDropdownDirective)).injector.get(NzDropdownDirective);
    expect(dropdown.nzVisible).toBe(true);
    fixture.componentInstance.menuOpen.set(false);
    fixture.detectChanges();
    expect(dropdown.nzVisible).toBe(false);
  });

  it('runs no poll timer of its own (kafka-redis-notifications v1 §4 — one timer in the feed service)', () => {
    vi.useFakeTimers();
    try {
      TestBed.configureTestingModule({
        imports: [NotificationBellComponent],
        providers: [provideRouter([]), { provide: ApiFailureReporter, useValue: { report: vi.fn() } }],
      });
      const feed = TestBed.inject(NotificationFeedService);
      const refresh = vi.spyOn(feed, 'refreshUnreadCount').mockImplementation(() => {});
      vi.spyOn(feed, 'loadPreview').mockImplementation(() => {});

      const first = TestBed.createComponent(NotificationBellComponent);
      const second = TestBed.createComponent(NotificationBellComponent);
      first.detectChanges();
      second.detectChanges();
      expect(refresh).toHaveBeenCalledTimes(2); // one bootstrap refresh per mount, no more

      vi.advanceTimersByTime(10 * 60_000);
      expect(refresh).toHaveBeenCalledTimes(2);
      expect(feed.isPolling()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // ---- notification sound toggle ----

  describe('sound toggle in the dropdown header', () => {
    function stubFeed(feed: NotificationFeedService): void {
      vi.spyOn(feed, 'loadPreview').mockImplementation(() => { /* no network in specs */ });
      vi.spyOn(feed, 'refreshUnreadCount').mockImplementation(() => { /* no network in specs */ });
    }

    it('renders an icon button reflecting the current setting (default on)', async () => {
      const { fixture, feed } = buildFixture();
      stubFeed(feed);
      fixture.detectChanges();
      await openDropdown(fixture);

      const button = soundToggle();
      expect(button).toBeTruthy();
      expect(button?.getAttribute('type')).toBe('button');
      expect(button?.getAttribute('aria-pressed')).toBe('true');
      expect(button?.getAttribute('aria-label')).toBe('เสียงแจ้งเตือน: เปิด');
    });

    it('clicking flips the setting, aria-pressed, label and icon — and persists it', async () => {
      const { fixture, feed } = buildFixture();
      stubFeed(feed);
      fixture.detectChanges();
      await openDropdown(fixture);
      const sound = TestBed.inject(NotificationSoundService);
      const onIcon = soundToggle()?.querySelector('svg')?.innerHTML;

      soundToggle()?.click();
      fixture.detectChanges();

      expect(sound.enabled()).toBe(false);
      expect(localStorage.getItem(SOUND_STORAGE_KEY)).toBe('0');
      expect(soundToggle()?.getAttribute('aria-pressed')).toBe('false');
      expect(soundToggle()?.getAttribute('aria-label')).toBe('เสียงแจ้งเตือน: ปิด');
      expect(soundToggle()?.querySelector('svg')?.innerHTML).not.toBe(onIcon);

      soundToggle()?.click();
      fixture.detectChanges();

      expect(sound.enabled()).toBe(true);
      expect(soundToggle()?.getAttribute('aria-pressed')).toBe('true');
    });

    it('plays one sample chime when turning the sound on, none when turning it off', async () => {
      const { fixture, feed } = buildFixture();
      stubFeed(feed);
      const sound = TestBed.inject(NotificationSoundService);
      const preview = vi.spyOn(sound, 'preview');
      fixture.detectChanges();
      await openDropdown(fixture);

      soundToggle()?.click(); // on → off
      fixture.detectChanges();
      expect(preview).not.toHaveBeenCalled();

      soundToggle()?.click(); // off → on
      fixture.detectChanges();
      expect(preview).toHaveBeenCalledTimes(1);
    });

    it('does not close the dropdown and the click never bubbles past the button', async () => {
      const { fixture, feed } = buildFixture();
      stubFeed(feed);
      fixture.detectChanges();
      await openDropdown(fixture);
      const documentClick = vi.fn();
      document.addEventListener('click', documentClick);
      try {
        soundToggle()?.click();
        fixture.detectChanges();
      } finally {
        document.removeEventListener('click', documentClick);
      }

      expect(fixture.componentInstance.menuOpen()).toBe(true);
      expect(documentClick).not.toHaveBeenCalled();
      expect(soundToggle()).toBeTruthy(); // panel still attached
    });

    it('onToggleSound stops propagation and toggles through the service', () => {
      const { fixture } = buildFixture();
      const sound = TestBed.inject(NotificationSoundService);
      const toggle = vi.spyOn(sound, 'toggle');
      const event = new MouseEvent('click', { bubbles: true });
      const stop = vi.spyOn(event, 'stopPropagation');

      fixture.componentInstance.onToggleSound(event);

      expect(stop).toHaveBeenCalledTimes(1);
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('sits next to "อ่านทั้งหมด" without replacing it', async () => {
      const { fixture, feed } = buildFixture();
      stubFeed(feed);
      feed.setUnreadCountForTest(2);
      fixture.detectChanges();
      await openDropdown(fixture);

      const toggle = soundToggle();
      const markAll = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-testid="notification-menu"] button'),
      ).find((b) => b.textContent?.includes('อ่านทั้งหมด'));
      expect(toggle).toBeTruthy();
      expect(markAll).toBeTruthy();
      expect(markAll?.parentElement).toBe(toggle?.parentElement);
    });
  });
});

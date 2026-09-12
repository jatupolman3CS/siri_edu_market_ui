import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { AdminNotificationsPage } from './notifications.page';
import { NotificationFeedService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/** notification-master-config v1 §1.3 / AC-7 — `/admin/notifications` inside the admin layout. */
function buildTestBed(data: Record<string, unknown> = { audience: 'admin' }) {
  TestBed.configureTestingModule({
    imports: [AdminNotificationsPage],
    providers: [
      provideRouter([]),
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { data } } },
    ],
  });
  return { feed: TestBed.inject(NotificationFeedService) };
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminNotificationsPage', () => {
  it('requests the admin feed, not the whole feed', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed');

    const fixture = TestBed.createComponent(AdminNotificationsPage);
    fixture.detectChanges();

    expect(loadFeedSpy).toHaveBeenCalledWith(1, 'admin');
  });

  it('renders the admin heading from §4.2', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });

    const fixture = TestBed.createComponent(AdminNotificationsPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain('การแจ้งเตือนของผู้ดูแลระบบ');
  });

  it('falls back to the admin audience when route data is missing', () => {
    buildTestBed({});
    const fixture = TestBed.createComponent(AdminNotificationsPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.audience()).toBe('admin');
  });
});

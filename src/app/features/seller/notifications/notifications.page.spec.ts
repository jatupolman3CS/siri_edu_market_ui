import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { SellerNotificationsPage } from './notifications.page';
import { NotificationFeedService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/** notification-master-config v1 §1.3 / AC-7 — `/seller/notifications` inside the seller layout. */
function buildTestBed(data: Record<string, unknown> = { audience: 'seller' }) {
  TestBed.configureTestingModule({
    imports: [SellerNotificationsPage],
    providers: [
      provideRouter([]),
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: ActivatedRoute, useValue: { snapshot: { data } } },
    ],
  });
  return { feed: TestBed.inject(NotificationFeedService) };
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerNotificationsPage', () => {
  it('requests the seller feed, not the whole feed', () => {
    const { feed } = buildTestBed();
    const loadFeedSpy = vi.spyOn(feed, 'loadFeed');

    const fixture = TestBed.createComponent(SellerNotificationsPage);
    fixture.detectChanges();

    expect(loadFeedSpy).toHaveBeenCalledWith(1, 'seller');
  });

  it('renders the seller heading from §4.2', () => {
    const { feed } = buildTestBed();
    vi.spyOn(feed, 'loadFeed').mockImplementation(() => { /* no-op */ });

    const fixture = TestBed.createComponent(SellerNotificationsPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent ?? '').toContain('การแจ้งเตือนของร้าน');
  });

  it('falls back to the seller audience when route data is missing', () => {
    buildTestBed({});
    const fixture = TestBed.createComponent(SellerNotificationsPage);
    fixture.detectChanges();

    expect(fixture.componentInstance.audience()).toBe('seller');
  });
});

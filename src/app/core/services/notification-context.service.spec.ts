import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import {
  NotificationContextService,
  notificationsRouteFor,
  resolveNotificationAudience,
  resolveSafeLinkUrl,
  toNotificationAudience,
} from './notification-context.service';

/**
 * notification-master-config v1 §1.3 (frontend table) — "map URL → context ครบ 6 เคส".
 *
 * The service is driven by a fake `Router` (a `url` string plus an events subject) rather
 * than a real navigation: `RouterTestingHarness` would need dummy routed components for
 * `/seller` and `/admin`, and the logic under test is purely "URL string → audience".
 */
type RouterEvent = NavigationEnd;

function buildFixture(initialUrl: string) {
  const events = new Subject<RouterEvent>();
  TestBed.configureTestingModule({
    providers: [{ provide: Router, useValue: { url: initialUrl, events } }],
  });
  return { events, service: TestBed.inject(NotificationContextService) };
}

afterEach(() => TestBed.resetTestingModule());

describe('resolveNotificationAudience', () => {
  it('maps the 6 spec URLs to their layout', () => {
    expect(resolveNotificationAudience('/')).toBe('buyer');
    expect(resolveNotificationAudience('/marketplace')).toBe('buyer');
    expect(resolveNotificationAudience('/orders/1')).toBe('buyer');
    expect(resolveNotificationAudience('/seller')).toBe('seller');
    expect(resolveNotificationAudience('/seller/qna')).toBe('seller');
    expect(resolveNotificationAudience('/admin/payouts')).toBe('admin');
  });

  it('ignores the query string and fragment when classifying', () => {
    expect(resolveNotificationAudience('/orders?tab=paid')).toBe('buyer');
    expect(resolveNotificationAudience('/seller/earnings?year=2026#top')).toBe('seller');
  });

  it('matches on whole path segments, so a buyer path merely starting with the same letters stays buyer', () => {
    expect(resolveNotificationAudience('/sellers-directory')).toBe('buyer');
    expect(resolveNotificationAudience('/administration-guide')).toBe('buyer');
  });
});

describe('toNotificationAudience', () => {
  it('accepts the 3 valid values and rejects anything else', () => {
    expect(toNotificationAudience('buyer')).toBe('buyer');
    expect(toNotificationAudience('seller')).toBe('seller');
    expect(toNotificationAudience('admin')).toBe('admin');
    expect(toNotificationAudience('Buyer')).toBeNull();
    expect(toNotificationAudience(2)).toBeNull();
    expect(toNotificationAudience(undefined)).toBeNull();
  });
});

describe('resolveSafeLinkUrl', () => {
  it('keeps a link that already belongs to the reader layout', () => {
    expect(resolveSafeLinkUrl('/document/doc-1', 'buyer')).toBe('/document/doc-1');
    expect(resolveSafeLinkUrl('/seller/reviews', 'seller')).toBe('/seller/reviews');
    expect(resolveSafeLinkUrl('/admin/approval', 'admin')).toBe('/admin/approval');
  });

  it('preserves a query string instead of dropping it (AC-8 companion)', () => {
    expect(resolveSafeLinkUrl('/orders?tab=paid', 'buyer')).toBe('/orders?tab=paid');
  });

  it('AC-6: rewrites a link that would cross into another layout to that layout\'s own inbox', () => {
    expect(resolveSafeLinkUrl('/seller/reviews', 'buyer')).toBe('/notifications');
    expect(resolveSafeLinkUrl('/admin/payouts', 'buyer')).toBe('/notifications');
    expect(resolveSafeLinkUrl('/document/doc-1', 'seller')).toBe('/seller/notifications');
    expect(resolveSafeLinkUrl('/seller/reviews', 'admin')).toBe('/admin/notifications');
  });

  it('rejects absolute and protocol-relative URLs (§3.2: relative paths only)', () => {
    expect(resolveSafeLinkUrl('https://evil.example/seller', 'seller')).toBe('/seller/notifications');
    expect(resolveSafeLinkUrl('//evil.example/x', 'buyer')).toBe('/notifications');
    expect(resolveSafeLinkUrl('', 'buyer')).toBe('/notifications');
  });
});

describe('notificationsRouteFor', () => {
  it('AC-7: gives each layout its own notification history route', () => {
    expect(notificationsRouteFor('buyer')).toBe('/notifications');
    expect(notificationsRouteFor('seller')).toBe('/seller/notifications');
    expect(notificationsRouteFor('admin')).toBe('/admin/notifications');
  });
});

describe('NotificationContextService', () => {
  it('seeds the context from the router URL at construction', () => {
    const { service } = buildFixture('/seller/qna');
    expect(service.context()).toBe('seller');
    expect(service.notificationsRoute()).toBe('/seller/notifications');
  });

  it('updates the context on every NavigationEnd', () => {
    const { service, events } = buildFixture('/');
    expect(service.context()).toBe('buyer');

    events.next(new NavigationEnd(1, '/admin/payouts', '/admin/payouts'));
    expect(service.context()).toBe('admin');
    expect(service.notificationsRoute()).toBe('/admin/notifications');
    expect(service.heading()).toBe('การแจ้งเตือนของผู้ดูแลระบบ');

    events.next(new NavigationEnd(2, '/marketplace', '/marketplace'));
    expect(service.context()).toBe('buyer');
    expect(service.heading()).toBe('การแจ้งเตือนของฉัน');
  });

  it('follows the redirected URL, not the requested one', () => {
    const { service, events } = buildFixture('/');
    events.next(new NavigationEnd(1, '/seller', '/seller/dashboard'));
    expect(service.context()).toBe('seller');
  });
});

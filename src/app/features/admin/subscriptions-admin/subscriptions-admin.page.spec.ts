import { TestBed } from '@angular/core/testing';
import { AdminSubscriptionsPage } from './subscriptions-admin.page';
import { SubscriptionService } from '../../../core/services';
import type { AdminSubscriptionListItem } from '../../../core/models';
import type { PagedResult } from '../../../core/services/infinite-pager';

/**
 * subscription-membership v3 §1 AC-24 / §3.2 / §4: "/admin/subscriptions" — read-only paginated
 * table from `GET /api/admin/subscriptions`, driven here via a faked `SubscriptionService`.
 */

function buildRow(over: Partial<AdminSubscriptionListItem> = {}): AdminSubscriptionListItem {
  return {
    id: 'sub-1',
    buyerName: 'สมชาย ใจดี',
    buyerEmail: 'somchai@example.test',
    categoryIds: ['cat-1', 'cat-2'],
    status: 'active',
    monthlyPrice: 299,
    currentPeriodStart: '2026-09-01T00:00:00Z',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    createdAt: '2026-08-01T00:00:00Z',
    ...over,
  };
}

function buildSubscriptionFake(page: PagedResult<AdminSubscriptionListItem>) {
  return {
    listAdmin: vi.fn(async () => page),
  };
}

function render(subscriptionFake: ReturnType<typeof buildSubscriptionFake>) {
  TestBed.configureTestingModule({
    imports: [AdminSubscriptionsPage],
    providers: [{ provide: SubscriptionService, useValue: subscriptionFake }],
  });
  const fixture = TestBed.createComponent(AdminSubscriptionsPage);
  fixture.detectChanges();
  return fixture;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminSubscriptionsPage', () => {
  it('loads page 1 with the "all" filter on construction', () => {
    const subscriptionFake = buildSubscriptionFake({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });
    render(subscriptionFake);

    expect(subscriptionFake.listAdmin).toHaveBeenCalledWith('all', 1, 10);
  });

  it('shows the empty state when there are no subscriptions', async () => {
    const subscriptionFake = buildSubscriptionFake({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });
    const fixture = render(subscriptionFake);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ไม่มีรายการสมาชิก');
  });

  it('renders rows with buyer, price, and status label', async () => {
    const subscriptionFake = buildSubscriptionFake({
      items: [buildRow({ buyerName: 'สมหญิง รักเรียน', status: 'past_due' })],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      totalPages: 1,
    });
    const fixture = render(subscriptionFake);
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('สมหญิง รักเรียน');
    expect(text).toContain('฿299');
    expect(text).toContain('ค้างชำระ');
  });

  it('setFilter resets to page 1 and re-fetches with the new status', async () => {
    const subscriptionFake = buildSubscriptionFake({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });
    const fixture = render(subscriptionFake);
    await settle();
    fixture.componentInstance.page.set(3);

    fixture.componentInstance.setFilter('active');
    await settle();

    expect(fixture.componentInstance.page()).toBe(1);
    expect(subscriptionFake.listAdmin).toHaveBeenLastCalledWith('active', 1, 10);
  });

  it('onPageChange re-fetches with the new page number', async () => {
    const subscriptionFake = buildSubscriptionFake({ items: [], page: 1, pageSize: 10, totalCount: 0, totalPages: 1 });
    const fixture = render(subscriptionFake);
    await settle();

    fixture.componentInstance.onPageChange(2);
    await settle();

    expect(subscriptionFake.listAdmin).toHaveBeenLastCalledWith('all', 2, 10);
  });
});

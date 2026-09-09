import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AccountSubscriptionPage } from './account-subscription.page';
import { CatalogService, SubscriptionService } from '../../../core/services';
import { idleActionState, loadingActionState } from '../../../core/services/action-state';
import type { Category, Subscription } from '../../../core/models';

/**
 * subscription-membership v3 §1 AC-24 / §3.4 / §4: "/account/subscription" — package status
 * (categories covered, price/month, renewal/end date), cancel button + confirmation dialog, the
 * empty state pointing to `/subscribe` when `GET /api/me/subscription` returns **404** (v3 — not
 * 204, see §3.4), and the `Incomplete`-status banner (real-money bug fix: a stuck-`Incomplete`
 * subscription must never look like a healthy one with a renewal date).
 */

function buildSubscription(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    status: 'active',
    categoryIds: ['cat-1'],
    monthlyPrice: 299,
    currentPeriodStart: '2026-09-01T00:00:00Z',
    currentPeriodEnd: '2026-10-01T00:00:00Z',
    cancelAtPeriodEnd: false,
    canceledAt: null,
    paymentHints: null,
    ...over,
  };
}

function buildCategory(id: string, name: string): Category {
  return { id, name, slug: id, icon: '📚', color: '#F9A8D4', description: '', documentCount: 0 };
}

function buildCatalogFake(categories: Category[]) {
  return {
    ensureCategories: vi.fn(),
    getCategoryById: (id: string) => categories.find((c) => c.id === id),
  };
}

function buildSubscriptionFake(
  current: Subscription | null,
  state = idleActionState(),
) {
  return {
    current: () => current,
    state: () => state,
    loadCurrent: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    cancelState: () => idleActionState(),
  };
}

function render(subscriptionFake: ReturnType<typeof buildSubscriptionFake>, categories: Category[] = []) {
  TestBed.configureTestingModule({
    imports: [AccountSubscriptionPage],
    providers: [
      provideRouter([]),
      { provide: CatalogService, useValue: buildCatalogFake(categories) },
      { provide: SubscriptionService, useValue: subscriptionFake },
      {
        provide: NzMessageService,
        useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
      },
    ],
  });
  const fixture = TestBed.createComponent(AccountSubscriptionPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AccountSubscriptionPage', () => {
  it('shows a loading placeholder while state() is loading, not the empty state', () => {
    const fixture = render(buildSubscriptionFake(null, loadingActionState()));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('กำลังโหลด');
    expect(text).not.toContain('ยังไม่มีสมาชิกรายเดือน');
  });

  it('shows the empty state pointing to /subscribe when there is no subscription (404 — §3.4 v3)', () => {
    const fixture = render(buildSubscriptionFake(null));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีสมาชิกรายเดือน');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href="/subscribe"]');
    expect(link).toBeTruthy();
  });

  it('renders covered categories, price/month, and the renewal date when active', () => {
    const fixture = render(
      buildSubscriptionFake(buildSubscription({ categoryIds: ['cat-1', 'cat-2'] })),
      [buildCategory('cat-1', 'คณิตศาสตร์'), buildCategory('cat-2', 'วิทยาศาสตร์')],
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('แพ็กเกจของคุณ');
    expect(text).toContain('คณิตศาสตร์');
    expect(text).toContain('วิทยาศาสตร์');
    expect(text).toContain('฿299');
    expect(text).toContain('ต่ออายุอัตโนมัติในวันที่');
  });

  it('shows "จะสิ้นสุดวันที่ {date}" instead of the renewal copy when cancelAtPeriodEnd is true', () => {
    const fixture = render(
      buildSubscriptionFake(buildSubscription({ cancelAtPeriodEnd: true })),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('จะสิ้นสุดวันที่');
    expect(text).not.toContain('ต่ออายุอัตโนมัติในวันที่');
  });

  it('hides the cancel button once cancelAtPeriodEnd is already true', () => {
    const fixture = render(buildSubscriptionFake(buildSubscription({ cancelAtPeriodEnd: true })));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ยกเลิกการสมัครสมาชิก');
  });

  it('confirmCancel() opens a dialog with the exact §4 copy, and confirming calls subscription.cancel()', () => {
    const subscriptionFake = buildSubscriptionFake(
      buildSubscription({ currentPeriodEnd: '2026-10-01T00:00:00Z' }),
    );
    const fixture = render(subscriptionFake);

    const modal = fixture.debugElement.injector.get(NzModalService);
    const confirmSpy = vi
      .spyOn(modal, 'confirm')
      .mockImplementation((...args: Parameters<typeof modal.confirm>) => {
        const options = args[0] as { nzOnOk?: () => unknown } | undefined;
        void options?.nzOnOk?.();
        return {} as ReturnType<typeof modal.confirm>;
      });

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('ยกเลิกการสมัครสมาชิก'));
    expect(button).toBeTruthy();
    button?.dispatchEvent(new Event('click'));

    const options = confirmSpy.mock.calls[0]?.[0] as
      | { nzContent?: string; nzOkText?: string }
      | undefined;
    expect(options?.nzContent).toContain('คุณจะยังใช้งานได้ถึงวันที่');
    expect(options?.nzContent).toContain('หลังจากนั้นจะไม่ต่ออายุอัตโนมัติ');
    expect(subscriptionFake.cancel).toHaveBeenCalled();
  });

  it('shows the "การชำระเงินยังไม่เสร็จสมบูรณ์" banner instead of the renewal copy when status is incomplete', () => {
    const fixture = render(buildSubscriptionFake(buildSubscription({ status: 'incomplete' })));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('การชำระเงินยังไม่เสร็จสมบูรณ์');
    expect(text).toContain('รีเฟรชสถานะ');
    expect(text).not.toContain('ต่ออายุอัตโนมัติในวันที่');
  });

  it('refreshStatus() re-calls loadCurrent() so the buyer can check whether the webhook has caught up', () => {
    const subscriptionFake = buildSubscriptionFake(buildSubscription({ status: 'incomplete' }));
    const fixture = render(subscriptionFake);
    subscriptionFake.loadCurrent.mockClear();

    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('รีเฟรชสถานะ'));
    expect(button).toBeTruthy();
    button?.dispatchEvent(new Event('click'));

    expect(subscriptionFake.loadCurrent).toHaveBeenCalled();
  });
});

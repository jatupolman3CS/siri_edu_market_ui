import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SubscriptionAccessHistoryPage } from './subscription-access-history.page';
import { SubscriptionService } from '../../../core/services';
import type { SubscriptionAccessHistoryItem } from '../../../core/models';

/**
 * subscription-membership v2 §1 AC-24 / §3.6 / §4: "/account/subscription/access-history" —
 * paginated list with "ยังเข้าถึงได้"/"หมดสิทธิ์แล้ว" badge per `stillAccessible`. Round 1:
 * `SubscriptionService.accessHistory()` always resolves to an empty page (stub) — the empty
 * state branch is what round 1 can actually exercise for real; the populated-list branch is
 * driven here via a faked service, matching how round 2 (SDK wired) will populate it.
 */

function buildItem(over: Partial<SubscriptionAccessHistoryItem> = {}): SubscriptionAccessHistoryItem {
  return {
    documentId: 'doc-1',
    title: 'สรุปคณิต ม.6',
    coverUrl: 'https://example.test/cover.jpg',
    sellerName: 'ครูเอ',
    firstAccessedAt: '2026-09-01T00:00:00Z',
    lastAccessedAt: '2026-09-05T00:00:00Z',
    accessCount: 3,
    stillAccessible: true,
    ...over,
  };
}

function buildSubscriptionFake(
  items: SubscriptionAccessHistoryItem[],
  loading = false,
) {
  return {
    accessHistory: () => items,
    accessHistoryLoading: () => loading,
    accessHistoryPage: () => 1,
    accessHistoryPageSize: () => 20,
    accessHistoryTotalCount: () => items.length,
    accessHistoryTotalPages: () => 1,
    loadAccessHistory: vi.fn(async () => {}),
    onAccessHistoryPageChange: vi.fn(async () => {}),
    onAccessHistoryPageSizeChange: vi.fn(async () => {}),
  };
}

function render(subscriptionFake: ReturnType<typeof buildSubscriptionFake>) {
  TestBed.configureTestingModule({
    imports: [SubscriptionAccessHistoryPage],
    providers: [provideRouter([]), { provide: SubscriptionService, useValue: subscriptionFake }],
  });
  const fixture = TestBed.createComponent(SubscriptionAccessHistoryPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('SubscriptionAccessHistoryPage', () => {
  it('calls loadAccessHistory() on construction', () => {
    const subscriptionFake = buildSubscriptionFake([]);
    render(subscriptionFake);

    expect(subscriptionFake.loadAccessHistory).toHaveBeenCalled();
  });

  it('shows a loading placeholder while loading', () => {
    const fixture = render(buildSubscriptionFake([], true));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('กำลังโหลด');
  });

  it('shows the empty state pointing to /subscribe when the history is empty', () => {
    const fixture = render(buildSubscriptionFake([]));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีประวัติการเข้าถึงเอกสาร');
    const link = (fixture.nativeElement as HTMLElement).querySelector('a[href="/subscribe"]');
    expect(link).toBeTruthy();
  });

  it('shows "ยังเข้าถึงได้" for stillAccessible:true and "หมดสิทธิ์แล้ว" for stillAccessible:false', () => {
    const fixture = render(
      buildSubscriptionFake([
        buildItem({ documentId: 'doc-1', title: 'เอกสาร A', stillAccessible: true }),
        buildItem({ documentId: 'doc-2', title: 'เอกสาร B', stillAccessible: false }),
      ]),
    );

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('เอกสาร A');
    expect(text).toContain('เอกสาร B');
    expect(text).toContain('ยังเข้าถึงได้');
    expect(text).toContain('หมดสิทธิ์แล้ว');
  });

  it('forwards pagination events to SubscriptionService', () => {
    const subscriptionFake = buildSubscriptionFake([buildItem()]);
    const fixture = render(subscriptionFake);

    fixture.componentInstance.onPageChange(2);
    fixture.componentInstance.onPageSizeChange(50);

    expect(subscriptionFake.onAccessHistoryPageChange).toHaveBeenCalledWith(2);
    expect(subscriptionFake.onAccessHistoryPageSizeChange).toHaveBeenCalledWith(50);
  });
});

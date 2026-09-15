import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BuyerLibraryPage } from './library.page';
import { AuthService, LibraryService, LoyaltyService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from '../../../core/services/action-state';
import { mapLibraryItem } from '../../../core/api-mappers/mappers';
import type { LibraryItem, LoyaltyEntry, LoyaltySummary } from '../../../core/models';
import type { DocumentDownloadResult } from '../../../core/services/library.service';

/**
 * library-is-reviewed v1 — spec section 4 + AC-9/AC-10:
 *  - switching tab must re-query the API, not `Array.filter()` the loaded page (AC-9)
 *  - the card button/badge/stars reflect `isReviewed`/`myRating` (AC-10)
 *  - the "ยังไม่ได้รีวิว" tab has its own empty-state copy; the "ทั้งหมด" tab keeps the old one
 *
 * `isReviewed`/`myRating` cannot come from the real pipeline yet — `mapLibraryItem` always
 * falls back to `isReviewed: false` until the SDK is regenerated (see mappers.spec.ts) — so the
 * button/badge/stars test drives the component against a fake `LibraryService` that reports an
 * already-reviewed item directly. The tab-switch test drives the real service through a stubbed
 * `fetch`, since that is what actually proves a new request goes out.
 */

const fakeAuth = { isAuthenticated: () => true, accessToken: () => 'test-token' };

/** loyalty-points v1 §4: default fake — idle, no summary loaded (mirrors the stub round). */
function fakeLoyalty(over: {
  summary?: () => LoyaltySummary | null;
  state?: () => ActionState;
  ledger?: () => LoyaltyEntry[];
  ledgerHasMore?: () => boolean;
  ledgerState?: () => ActionState;
} = {}) {
  return {
    summary: over.summary ?? (() => null),
    state: over.state ?? (() => idleActionState()),
    ledger: over.ledger ?? (() => [] as LoyaltyEntry[]),
    ledgerHasMore: over.ledgerHasMore ?? (() => false),
    ledgerState: over.ledgerState ?? (() => idleActionState()),
    refreshSummary: vi.fn(async () => {}),
    loadLedgerFirst: vi.fn(async () => {}),
    loadMoreLedger: vi.fn(async () => {}),
  };
}

function buildItem(documentId: string, over: Partial<LibraryItem> = {}): LibraryItem {
  const base = mapLibraryItem({
    documentId,
    title: `เอกสาร ${documentId}`,
    purchasedAt: '2026-08-01T00:00:00Z',
    orderNumber: `ORD-${documentId}`,
    downloadCount: 3,
  });
  return { ...base, ...over };
}

/** watermark-completion v1 §4.4: every notice this page pushed through NG-ZORRO's message. */
let infoMessages: string[] = [];

function renderWithItems(
  items: LibraryItem[],
  filter: 'all' | 'unreviewed' | 'unread' = 'all',
  loyalty = fakeLoyalty(),
  toggleReadSpy = vi.fn(async () => {}),
  downloadSpy: (documentId: string) => Promise<DocumentDownloadResult | null> = vi.fn(
    async () => null,
  ),
) {
  infoMessages = [];
  const fakeLibrary = {
    state: () => idleActionState(),
    library: () => items,
    libraryHasMore: () => false,
    totalDocuments: () => items.length,
    totalDownloads: () => 0,
    totalSpent: () => 0,
    libraryFilter: () => filter,
    setLibraryFilter: vi.fn(),
    refreshLibrary: vi.fn(async () => {}),
    refreshOrders: vi.fn(async () => {}),
    loadMoreLibrary: vi.fn(async () => {}),
    download: downloadSpy,
    toggleRead: toggleReadSpy,
    reviewState: () => idleActionState(),
    resetReviewState: vi.fn(),
    submitReview: vi.fn(async () => null),
    getDocumentVersions: vi.fn(async () => []),
  };

  TestBed.configureTestingModule({
    imports: [BuyerLibraryPage],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: fakeAuth },
      { provide: LibraryService, useValue: fakeLibrary },
      { provide: LoyaltyService, useValue: loyalty },
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      {
        provide: NzMessageService,
        useValue: {
          info: (m: string) => infoMessages.push(m),
          success: vi.fn(),
          warning: vi.fn(),
          error: vi.fn(),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(BuyerLibraryPage);
  fixture.detectChanges();
  return fixture;
}

describe('BuyerLibraryPage — card states (AC-10)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows "เขียนรีวิว" and no badge for an item that has not been reviewed', () => {
    const fixture = renderWithItems([buildItem('doc-1', { isReviewed: false })]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('เขียนรีวิว');
    expect(text).not.toContain('แก้ไขรีวิว');
    expect(text).not.toContain('รีวิวแล้ว');
  });

  it('AC-10: shows "แก้ไขรีวิว", the "รีวิวแล้ว" badge, and the myRating stars for a reviewed item', () => {
    const fixture = renderWithItems([
      buildItem('doc-1', { isReviewed: true, myReviewId: 'rev-1', myRating: 4 }),
    ]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('แก้ไขรีวิว');
    expect(text).toContain('รีวิวแล้ว');
    expect(text).not.toContain('เขียนรีวิว');

    const filledStars = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.text-yellow-400 span:not(.text-gray-300)',
    );
    expect(filledStars.length).toBe(4);
  });

  it('shows "ทำเครื่องหมายว่าอ่านแล้ว" for an unread item and clicking toggles to read', () => {
    const toggleSpy = vi.fn(async () => {});
    const fixture = renderWithItems([buildItem('doc-1', { isRead: false })], 'all', fakeLoyalty(), toggleSpy);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ทำเครื่องหมายว่าอ่านแล้ว');

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'ทำเครื่องหมายว่าอ่านแล้ว');
    expect(button).toBeDefined();

    button!.click();
    expect(toggleSpy).toHaveBeenCalledWith('doc-1', true);
  });

  it('shows "อ่านแล้ว" badge/button for a read item and clicking toggles to unread', () => {
    const toggleSpy = vi.fn(async () => {});
    const fixture = renderWithItems([buildItem('doc-1', { isRead: true })], 'all', fakeLoyalty(), toggleSpy);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('อ่านแล้ว');

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((b) => b.textContent?.includes('อ่านแล้ว'));
    expect(button).toBeDefined();
    expect(button!.classList.contains('bg-sky-500')).toBe(true);

    button!.click();
    expect(toggleSpy).toHaveBeenCalledWith('doc-1', false);
  });

  it('empty state on the "ยังไม่ได้รีวิว" tab reads exactly per spec §4', () => {
    const fixture = renderWithItems([], 'unreviewed');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('รีวิวครบทุกเอกสารแล้ว ขอบคุณค่ะ');
  });

  it('empty state on the "ยังไม่อ่าน" tab reads exactly per spec §4', () => {
    const fixture = renderWithItems([], 'unread');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('อ่านครบทุกเอกสารแล้ว เก่งมากค่ะ');
  });

  it('empty state on the "ทั้งหมด" tab keeps the original copy, unchanged', () => {
    const fixture = renderWithItems([], 'all');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('คลังของคุณยังว่างอยู่');
    expect(text).not.toContain('รีวิวครบทุกเอกสารแล้ว');
    expect(text).not.toContain('อ่านครบทุกเอกสารแล้ว');
  });
});

/**
 * loyalty-points v1 §4 — the "คะแนนสะสม" stat card + ledger drawer. Copy must match spec §4's
 * table exactly, and the card must never render `0` while data hasn't loaded (AC-9).
 */
describe('BuyerLibraryPage — loyalty stat card (loyalty-points v1 §4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  function renderWithLoyalty(loyalty: ReturnType<typeof fakeLoyalty>) {
    return renderWithItems([], 'all', loyalty);
  }

  it('shows the em dash (never 0) while the summary has not loaded', () => {
    const fixture = renderWithLoyalty(
      fakeLoyalty({ state: () => loadingActionState(), summary: () => null }),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('คะแนนสะสม');
    expect(text).toContain('—');
    expect(text).not.toMatch(/\b0 pt\b/);
  });

  it('AC-8: shows the real balance and "+N ในเดือนนี้" when earnedThisMonth > 0', () => {
    const summary: LoyaltySummary = {
      balance: 1840,
      earnedThisMonth: 120,
      lifetimeEarned: 2000,
      lifetimeSpent: 0,
      asOf: '2026-08-29T00:00:00.000Z',
    };
    const fixture = renderWithLoyalty(fakeLoyalty({ summary: () => summary }));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('1.8k pt');
    expect(text).toContain('+120 ในเดือนนี้');
  });

  it('shows "ยังไม่ได้คะแนนในเดือนนี้" when earnedThisMonth is 0', () => {
    const summary: LoyaltySummary = {
      balance: 500,
      earnedThisMonth: 0,
      lifetimeEarned: 500,
      lifetimeSpent: 0,
      asOf: '2026-08-29T00:00:00.000Z',
    };
    const fixture = renderWithLoyalty(fakeLoyalty({ summary: () => summary }));
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('ยังไม่ได้คะแนนในเดือนนี้');
    expect(text).not.toContain('+0 ในเดือนนี้');
  });

  it('shows the exact error copy when loading the summary failed, not a broken page', () => {
    const fixture = renderWithLoyalty(
      fakeLoyalty({ state: () => errorActionState('โหลดคะแนนสะสมไม่สำเร็จ') }),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('โหลดคะแนนสะสมไม่สำเร็จ');
  });

  it('"ดูประวัติคะแนน" opens the drawer and triggers loadLedgerFirst()', () => {
    const loyalty = fakeLoyalty();
    const fixture = renderWithLoyalty(loyalty);

    const buttons: HTMLButtonElement[] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    const historyButton = buttons.find((b) => b.textContent?.trim() === 'ดูประวัติคะแนน');
    expect(historyButton).toBeDefined();

    historyButton!.click();
    fixture.detectChanges();

    expect(loyalty.loadLedgerFirst).toHaveBeenCalledTimes(1);
    // nz-drawer renders its content through a CDK overlay attached to <body>, not as a
    // descendant of fixture.nativeElement — assert against the document instead.
    const text = document.body.textContent ?? '';
    expect(text).toContain('ประวัติคะแนนสะสม');
    expect(text).toContain('ยังไม่มีรายการคะแนน — ซื้อเอกสารเพื่อเริ่มสะสม');
  });

  it('lists ledger entries with the "order_paid" reason text and a "โหลดเพิ่ม" button when there is more', () => {
    const loyalty = fakeLoyalty({
      ledger: () => [
        {
          id: 'entry-1',
          points: 10,
          kind: 'earn',
          reason: 'order_paid',
          orderNumber: 'ORD-0001',
          occurredAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      ledgerHasMore: () => true,
    });
    const fixture = renderWithLoyalty(loyalty);

    const buttons: HTMLButtonElement[] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    buttons.find((b) => b.textContent?.trim() === 'ดูประวัติคะแนน')!.click();
    fixture.detectChanges();

    // Same as above — the drawer body lives in the CDK overlay container on <body>.
    const text = document.body.textContent ?? '';
    expect(text).toContain('ได้รับจากคำสั่งซื้อ ORD-0001');
    expect(text).toContain('โหลดเพิ่ม');
  });
});

describe('BuyerLibraryPage — tab switch (AC-9)', () => {
  type Route = { status?: number; body: unknown };
  let routes: Map<string, Route>;
  let realFetch: typeof globalThis.fetch;
  let requests: { method: string; path: string }[];

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  function stubRoute(method: string, path: string, body: unknown, status = 200): void {
    routes.set(`${method.toUpperCase()} ${path}`, { body, status });
  }

  function pagedResponse(items: unknown[]) {
    return { items, page: 1, pageSize: 24, totalCount: items.length, totalPages: 1 };
  }

  beforeEach(() => {
    routes = new Map();
    requests = [];
    realFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      const path = url.pathname;
      requests.push({ method: request.method, path });

      const route = routes.get(`${request.method} ${path}`);
      if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
      return jsonResponse(route.body, route.status ?? 200);
    }) as typeof globalThis.fetch;

    stubRoute(
      'GET',
      '/api/library',
      pagedResponse([{ documentId: 'doc-1', title: 'A', purchasedAt: '2026-08-01T00:00:00Z' }]),
    );
    stubRoute('GET', '/api/orders', pagedResponse([]));
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  async function settle(): Promise<void> {
    for (let i = 0; i < 6; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  function renderRealPage() {
    TestBed.configureTestingModule({
      imports: [BuyerLibraryPage],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: fakeAuth },
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      ],
    });

    const fixture = TestBed.createComponent(BuyerLibraryPage);
    fixture.detectChanges();
    return fixture;
  }

  function libraryGetCount(): number {
    return requests.filter((r) => r.method === 'GET' && r.path === '/api/library').length;
  }

  it('AC-9: clicking "ยังไม่ได้รีวิว" issues a new GET /api/library, never a client-side filter', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    expect(libraryGetCount()).toBe(1);

    const buttons: HTMLButtonElement[] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    const unreviewedTab = buttons.find((b) => b.textContent?.trim() === 'ยังไม่ได้รีวิว');
    expect(unreviewedTab).toBeDefined();

    unreviewedTab!.click();
    await settle();
    fixture.detectChanges();

    expect(libraryGetCount()).toBe(2);
  });

  it('AC-11: clicking "ยังไม่อ่าน" issues a new GET /api/library, never a client-side filter', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    expect(libraryGetCount()).toBe(1);

    const buttons: HTMLButtonElement[] = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    const unreadTab = buttons.find((b) => b.textContent?.trim() === 'ยังไม่อ่าน');
    expect(unreadTab).toBeDefined();

    unreadTab!.click();
    await settle();
    fixture.detectChanges();

    expect(libraryGetCount()).toBe(2);
  });

  it('shows the "ทั้งหมด" / "ยังไม่ได้รีวิว" / "ยังไม่อ่าน" tab labels per spec §4', async () => {
    const fixture = renderRealPage();
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ทั้งหมด');
    expect(text).toContain('ยังไม่ได้รีวิว');
    expect(text).toContain('ยังไม่อ่าน');
  });
});

/**
 * watermark-completion v1 §3.1/§4.4 — `POST /api/library/{id}/download` now answers with a Thai
 * `watermarkNotice` naming the buyer's own `WMK-XXXXXXXX` copy code. The page must show it with
 * the message mechanism it already uses, and must stay silent when the backend sent none.
 */
describe('BuyerLibraryPage — watermark notice on download (watermark-completion v1 §4.4)', () => {
  afterEach(() => TestBed.resetTestingModule());

  function downloadButton(fixture: { nativeElement: unknown }): HTMLButtonElement {
    const button = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((b) => b.textContent?.trim() === 'ดาวน์โหลด');
    expect(button).toBeDefined();
    return button as HTMLButtonElement;
  }

  it('shows the backend notice verbatim after a download', async () => {
    const notice = 'ไฟล์นี้ฝังรหัสสำเนา WMK-ABC12345 ไว้สำหรับบัญชีของคุณ กรุณาอย่าเผยแพร่ต่อ';
    const download = vi.fn(async () => ({
      downloadUrl: 'https://cdn.example/doc.pdf',
      watermarkApplied: true,
      watermarkMode: 'raster' as const,
      watermarkToken: 'WMK-ABC12345',
      watermarkNotice: notice,
    }));
    const fixture = renderWithItems(
      [buildItem('doc-1')],
      'all',
      fakeLoyalty(),
      vi.fn(async () => {}),
      download,
    );

    downloadButton(fixture).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(download).toHaveBeenCalledWith('doc-1');
    expect(infoMessages).toContain(notice);
  });

  it('stays silent when the backend sent no notice (§3.1: null = nothing to say)', async () => {
    const download = vi.fn(async () => ({
      downloadUrl: 'https://cdn.example/doc.pdf',
      watermarkApplied: false,
      watermarkMode: 'none' as const,
      watermarkToken: null,
      watermarkNotice: null,
    }));
    const fixture = renderWithItems(
      [buildItem('doc-1')],
      'all',
      fakeLoyalty(),
      vi.fn(async () => {}),
      download,
    );

    downloadButton(fixture).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(infoMessages).toEqual([]);
  });

  it('says nothing when the download itself failed', async () => {
    const download = vi.fn(async () => null);
    const fixture = renderWithItems(
      [buildItem('doc-1')],
      'all',
      fakeLoyalty(),
      vi.fn(async () => {}),
      download,
    );

    downloadButton(fixture).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(infoMessages).toEqual([]);
  });
});

describe('BuyerLibraryPage — document versioning (document-versioning v1 §4/§6)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders "มีเวอร์ชันใหม่" badge and change note when item has new version', () => {
    const item = buildItem('doc-1', {
      hasNewVersion: true,
      currentVersionNumber: 2,
      latestChangeNote: 'แก้ไขสูตรคำนวณและข้อสอบเพิ่มเติม',
    });
    const fixture = renderWithItems([item]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('มีเวอร์ชันใหม่');
    expect(text).toContain('แก้ไขสูตรคำนวณและข้อสอบเพิ่มเติม');
    expect(text).toContain('ดูสิ่งที่อัปเดต');
  });

  it('does not render "มีเวอร์ชันใหม่" badge when item has no new version', () => {
    const item = buildItem('doc-1', {
      hasNewVersion: false,
    });
    const fixture = renderWithItems([item]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).not.toContain('มีเวอร์ชันใหม่');
  });

  it('opens versions modal on clicking "ดูสิ่งที่อัปเดต"', async () => {
    const item = buildItem('doc-1', {
      hasNewVersion: true,
      latestChangeNote: 'แก้ไขสูตร',
    });
    const fixture = renderWithItems([item]);
    const comp = fixture.componentInstance;

    await comp.openVersionsModal(item.document.id, item.document.title);

    expect(comp.versionsModal()).toEqual({
      documentId: item.document.id,
      title: item.document.title,
    });
  });

});



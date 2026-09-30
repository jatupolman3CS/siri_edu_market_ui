import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminUserDetailPage } from './user-detail.page';
import { AdminService, AuthService, ApiFailureReporter } from '../../../core/services';
import type { AdminUserDetail, User } from '../../../core/models';
import { TableViewportDirective } from '../../../shared/directives/table-viewport.directive';

function userDetail(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 'target-user-1',
    displayName: 'สมศรี มีทรัพย์',
    email: 'somsri@example.com',
    avatarUrl: null,
    roles: ['buyer'],
    studioName: null,
    isEmailVerified: true,
    accountStatus: 'active',
    suspendedUntil: null,
    totalPurchaseAmount: 2500,
    totalOrderCount: 5,
    accountStatusReason: null,
    accountStatusMessage: null,
    accountStatusChangedAt: null,
    accountStatusChangedBy: null,
    accountStatusChangedByName: null,
    isSeller: false,
    sellerApplicationStatus: null,
    purchaseStats: {
      totalPurchaseAmount: 2500,
      totalOrderCount: 5,
      refundedAmount: 0,
      refundedOrderCount: 0,
      lastOrderAt: '2026-08-20T10:00:00Z',
    },
    sellerStats: null,
    moderationHistory: [
      {
        id: 'mod-1',
        action: 'suspend',
        reason: 'ละเมิดเงื่อนไข',
        messageToUser: 'ชั่วคราว 3 วัน',
        suspendedUntil: '2026-08-10T00:00:00Z',
        previousStatus: 'active',
        performedByUserId: 'admin-1',
        performedByName: 'แอดมินใจดี',
        createdAt: '2026-08-07T00:00:00Z',
      },
    ],
    joinedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('AdminUserDetailPage', () => {
  let mockAdmin: any;
  let mockAuth: any;
  let mockMessage: any;
  let currentUserSignal: any;

  beforeEach(() => {
    currentUserSignal = signal<User | null>({
      id: 'current-admin-id',
      email: 'admin@example.com',
      name: 'Super Admin',
      role: 'admin',
      roles: ['admin'],
      avatar: '',
      joinedAt: '',
      onboardingCompletedAt: null,
    });

    mockAdmin = {
      getUser: vi.fn(async () => userDetail()),
      suspendUser: vi.fn(async (_id: string, _req: any) =>
        userDetail({ accountStatus: 'suspended', suspendedUntil: '2026-09-20T00:00:00Z' }),
      ),
      banUser: vi.fn(async (_id: string, _req: any) =>
        userDetail({ accountStatus: 'banned' }),
      ),
      reinstateUser: vi.fn(async (_id: string, _req: any) =>
        userDetail({ accountStatus: 'active' }),
      ),
      // buyer-wallet v1 §3.8/§3.9 — read-only wallet section (AC-29).
      getUserWallet: vi.fn(async () => ({
        userId: 'target-user-1',
        balance: 250,
        lifetimeToppedUp: 500,
        lifetimeSpent: 250,
        asOf: '2026-09-15T10:00:00Z',
      })),
      getUserWalletEntries: vi.fn(async () => ({
        items: [
          {
            id: 'entry-1',
            kind: 'topup',
            amount: 500,
            reason: 'wallet_topup',
            orderNumber: undefined,
            occurredAt: '2026-09-10T10:00:00Z',
          },
          {
            id: 'entry-2',
            kind: 'purchase',
            amount: -250,
            reason: 'order_paid_by_wallet',
            orderNumber: 'ORD-1001',
            occurredAt: '2026-09-12T10:00:00Z',
          },
        ],
        page: 1,
        pageSize: 10,
        totalCount: 2,
        totalPages: 1,
      })),
    };

    mockAuth = {
      user: currentUserSignal,
    };

    mockMessage = {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [AdminUserDetailPage],
      providers: [
        provideNoopAnimations(),
        provideRouter([]),
        { provide: AdminService, useValue: mockAdmin },
        { provide: AuthService, useValue: mockAuth },
        { provide: NzMessageService, useValue: mockMessage },
        { provide: ApiFailureReporter, useValue: { report: vi.fn(), formatDetail: vi.fn((e: any) => e?.message || 'error') } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: vi.fn(() => 'target-user-1'),
              },
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('an unknown user id (404) renders the not-found state, reports nothing itself and skips the wallet (F116)', async () => {
    mockAdmin.getUser.mockRejectedValue({ status: 404, title: 'Not Found' });
    const reporter = TestBed.inject(ApiFailureReporter) as unknown as { report: ReturnType<typeof vi.fn> };
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const nf = el.querySelector('[data-testid="not-found"]');
    expect(nf).not.toBeNull();
    expect(nf?.textContent).toContain('ไม่พบผู้ใช้');
    const cta = nf?.querySelector('a[href="/admin/users"]') as HTMLElement;
    expect(cta).not.toBeNull();
    expect(cta.className).toContain('min-h-11');
    expect(reporter.report).not.toHaveBeenCalled();
    expect(mockAdmin.getUserWallet).not.toHaveBeenCalled();
    expect(mockAdmin.getUserWalletEntries).not.toHaveBeenCalled();
  });

  it('any other load failure shows an error with a retry that re-issues the GET', async () => {
    mockAdmin.getUser.mockRejectedValueOnce({ status: 500, title: 'boom' });
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="not-found"]')).toBeNull();
    const retry = el.querySelector('[data-testid="load-retry"]') as HTMLButtonElement;
    expect(retry).not.toBeNull();
    expect(mockAdmin.getUser).toHaveBeenCalledTimes(1);

    retry.click();
    await settle();
    fixture.detectChanges();
    expect(mockAdmin.getUser).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('สมศรี มีทรัพย์');
    expect(el.querySelector('[data-testid="load-error"]')).toBeNull();
  });

  it('lets a long display name wrap inside the card (F112)', async () => {
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    const h2 = (fixture.nativeElement as HTMLElement).querySelector('h2') as HTMLElement;
    expect(h2.className).toContain('[overflow-wrap:anywhere]');
    expect(h2.className).toContain('min-w-0');
  });

  it('renders buyer-only details without seller stats card', async () => {
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('สมศรี มีทรัพย์');
    expect(el.textContent).toContain('สถิติการซื้อ (ผู้ซื้อ)');
    expect(el.textContent).not.toContain('สถิติการขาย');
    expect(el.textContent).toContain('ประวัติการถูกระงับการใช้งาน');
    expect(el.textContent).toContain('ละเมิดเงื่อนไข');
  });

  it('renders seller details with seller stats card', async () => {
    mockAdmin.getUser.mockResolvedValue(
      userDetail({
        roles: ['buyer', 'seller'],
        isSeller: true,
        sellerStats: {
          studioName: 'ร้านสมศรีติวเตอร์',
          isVerified: true,
          rating: 4.8,
          totalDocuments: 15,
          totalSalesCount: 120,
          grossRevenue: 45000,
          lifetimeNetEarnings: 38000,
          pendingBalance: 5000,
        },
      }),
    );

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('สถิติการขาย (ร้าน ร้านสมศรีติวเตอร์)');
    expect(el.textContent).toContain('★ 4.8');
    expect(el.textContent).toContain('จำนวนเอกสารในระบบ');
  });

  it('hides restrict buttons when target user is an admin', async () => {
    mockAdmin.getUser.mockResolvedValue(
      userDetail({
        id: 'other-admin-id',
        roles: ['admin'],
      }),
    );

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ไม่สามารถระงับบัญชีผู้ดูแลระบบได้');
    expect(fixture.componentInstance.canRestrict()).toBe(false);
  });

  it('hides restrict buttons when target user is self', async () => {
    mockAdmin.getUser.mockResolvedValue(
      userDetail({
        id: 'current-admin-id', // matches currentUserSignal id
        roles: ['buyer'],
      }),
    );

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ไม่สามารถระงับบัญชีของตัวเองได้');
    expect(fixture.componentInstance.canRestrict()).toBe(false);
  });

  it('submitting suspend modal calls admin.suspendUser and updates user', async () => {
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openSuspendModal();
    comp.suspendReason.set('สแปมข้อความ');
    comp.suspendUntil.set('2026-09-20T00:00');
    comp.suspendMessage.set('กรุณาติดต่อแอดมิน');

    await comp.submitSuspend();
    await settle();

    expect(mockAdmin.suspendUser).toHaveBeenCalledWith('target-user-1', {
      reason: 'สแปมข้อความ',
      until: expect.any(String),
      messageToUser: 'กรุณาติดต่อแอดมิน',
    });
    expect(mockMessage.success).toHaveBeenCalledWith('ระงับบัญชีเรียบร้อยแล้ว');
    expect(comp.user()?.accountStatus).toBe('suspended');
    expect(comp.suspendModalVisible()).toBe(false);
  });

  it('submitting ban modal calls admin.banUser and updates user', async () => {
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openBanModal();
    comp.banReason.set('ทุจริต');
    comp.banMessage.set('ถูกแบนถาวร');

    await comp.submitBan();
    await settle();

    expect(mockAdmin.banUser).toHaveBeenCalledWith('target-user-1', {
      reason: 'ทุจริต',
      messageToUser: 'ถูกแบนถาวร',
    });
    expect(mockMessage.success).toHaveBeenCalledWith('แบนบัญชีเรียบร้อยแล้ว');
    expect(comp.user()?.accountStatus).toBe('banned');
    expect(comp.banModalVisible()).toBe(false);
  });

  it('submitting reinstate modal calls admin.reinstateUser and updates user', async () => {
    mockAdmin.getUser.mockResolvedValue(
      userDetail({
        accountStatus: 'suspended',
      }),
    );

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.openReinstateModal();
    comp.reinstateReason.set('ตรวจสอบแล้วผ่าน');

    await comp.submitReinstate();
    await settle();

    expect(mockAdmin.reinstateUser).toHaveBeenCalledWith('target-user-1', {
      reason: 'ตรวจสอบแล้วผ่าน',
    });
    expect(mockMessage.success).toHaveBeenCalledWith('ปลดระงับบัญชีเรียบร้อยแล้ว');
    expect(comp.user()?.accountStatus).toBe('active');
    expect(comp.reinstateModalVisible()).toBe(false);
  });

  // responsive-ui v1.3 §4.6 B / G-11: the admin layout reserves nothing for the phone action bar, so the
  // bar's in-flow spacer only protects content that comes BEFORE it — the bar must be the page's last child.
  it('renders the phone sticky action bar as the last child of the page, after moderation history', async () => {
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const page = el.querySelector(':scope > div') as HTMLElement;
    const last = page.lastElementChild as HTMLElement;
    expect(last.tagName.toLowerCase()).toBe('app-sticky-action-bar');
    expect(last.querySelector('[data-testid="user-actions-sticky"]')).not.toBeNull();

    const previous = last.previousElementSibling as HTMLElement;
    expect(previous.textContent).toContain('ประวัติการถูกระงับการใช้งาน');
    expect(page.querySelectorAll(':scope > app-sticky-action-bar').length).toBe(1);
  });

  it('suspended target: the reinstate button uses the real primary button class (inline and in the phone bar)', async () => {
    mockAdmin.getUser.mockResolvedValue(
      userDetail({ accountStatus: 'suspended', suspendedUntil: '2026-09-20T00:00:00Z' }),
    );

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const page = el.querySelector(':scope > div') as HTMLElement;
    expect(page.lastElementChild?.tagName.toLowerCase()).toBe('app-sticky-action-bar');

    const inline = el.querySelector('[data-testid="user-actions-inline"] [data-testid="user-reinstate"]') as HTMLElement;
    const sticky = el.querySelector('[data-testid="user-actions-sticky"] [data-testid="user-reinstate"]') as HTMLElement;
    for (const button of [inline, sticky]) {
      expect(button).not.toBeNull();
      expect(button.textContent?.trim()).toBe('ปลดระงับ');
      // `.btn-primary` is defined nowhere (only `.ant-btn-primary`) and rendered as bare text.
      expect(button.classList.contains('btn-pink')).toBe(true);
      expect(button.classList.contains('min-h-11')).toBe(true);
      expect(button.classList.contains('btn-primary')).toBe(false);
    }
  });

  it('no sticky action bar when the target is an admin (nothing to act on)', async () => {
    mockAdmin.getUser.mockResolvedValue(userDetail({ id: 'other-admin-id', roles: ['admin'] }));

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-sticky-action-bar')).toBeNull();
  });

  // buyer-wallet v1 §4.6 — AC-29: read-only wallet summary + ledger, no edit action anywhere.
  it('renders read-only wallet summary + ledger with no edit action', async () => {
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    expect(mockAdmin.getUserWallet).toHaveBeenCalledWith('target-user-1');
    expect(mockAdmin.getUserWalletEntries).toHaveBeenCalledWith('target-user-1', 1, 10);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('กระเป๋าเงินของผู้ใช้');
    expect(el.textContent).toContain('เติมเงิน');
    expect(el.textContent).toContain('ซื้อเอกสาร');
    expect(el.textContent).toContain('#ORD-1001');
    // DEC-5: admin has no direct wallet-adjustment control anywhere on this page.
    expect(el.textContent).not.toContain('แก้ยอด');
    expect(el.querySelector('[data-wallet-edit]')).toBeNull();
  });

  it('loadMoreWalletEntries() fetches the next page and appends items', async () => {
    mockAdmin.getUserWalletEntries.mockImplementation(
      async (_userId: string, page: number, _pageSize: number) => {
        if (page === 1) {
          return {
            items: [
              {
                id: 'entry-1',
                kind: 'topup',
                amount: 100,
                reason: 'wallet_topup',
                orderNumber: undefined,
                occurredAt: '2026-09-10T10:00:00Z',
              },
            ],
            page: 1,
            pageSize: 1,
            totalCount: 2,
            totalPages: 2,
          };
        }
        return {
          items: [
            {
              id: 'entry-2',
              kind: 'refund',
              amount: 50,
              reason: 'order_refunded_to_wallet',
              orderNumber: 'ORD-2002',
              occurredAt: '2026-09-11T10:00:00Z',
            },
          ],
          page: 2,
          pageSize: 1,
          totalCount: 2,
          totalPages: 2,
        };
      },
    );

    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.walletEntries().length).toBe(1);
    expect(comp.walletEntriesHasMore()).toBe(true);

    await comp.loadMoreWalletEntries();
    await settle();

    expect(mockAdmin.getUserWalletEntries).toHaveBeenLastCalledWith('target-user-1', 2, 10);
    expect(comp.walletEntries().length).toBe(2);
    expect(comp.walletEntriesHasMore()).toBe(false);
  });

  // responsive-ui v1.6 R-27: both tables scroll inside their own named wrapper at >=744. Neither is
  // paginated, so neither has a reset key: "load more" appends ledger rows and keeps the position.
  it('R-27: the wallet ledger and the moderation history each sit in their own named table viewport', async () => {
    mockAdmin.getUserWalletEntries.mockImplementation(async (_userId: string, page: number) => ({
      items: [
        {
          id: `entry-${page}`,
          kind: 'topup',
          amount: 100,
          reason: 'wallet_topup',
          orderNumber: undefined,
          occurredAt: '2026-09-10T10:00:00Z',
        },
      ],
      page,
      pageSize: 1,
      totalCount: 2,
      totalPages: 2,
    }));
    const fixture = TestBed.createComponent(AdminUserDetailPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const wrappers = Array.from(el.querySelectorAll('table.rtable')).map((t) => t.parentElement as HTMLElement);
    expect(wrappers.length).toBe(2);
    wrappers.forEach((w) => expect(w.classList).toContain('rt-viewport'));
    const viewports = fixture.debugElement
      .queryAll(By.directive(TableViewportDirective))
      .map((d) => d.injector.get(TableViewportDirective));
    expect(viewports.map((v) => v.rtLabel())).toEqual(['กระเป๋าเงินของผู้ใช้', 'ประวัติการถูกระงับการใช้งาน']);
    expect(viewports.map((v) => v.rtResetKey())).toEqual([undefined, undefined]);

    const ledger = wrappers[0];
    ledger.scrollTop = 200;
    await fixture.componentInstance.loadMoreWalletEntries();
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
    expect(ledger.querySelectorAll('tbody > tr').length).toBe(2);
    expect(ledger.scrollTop).toBe(200);
  });
});

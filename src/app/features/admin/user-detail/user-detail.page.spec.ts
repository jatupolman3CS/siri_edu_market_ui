import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminUserDetailPage } from './user-detail.page';
import { AdminService, AuthService, ApiFailureReporter } from '../../../core/services';
import type { AdminUserDetail, User } from '../../../core/models';

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
});

import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, Subject } from 'rxjs';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AdminFeedbackPage } from './feedback-admin.page';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { AdminFeedbackDetailResponse, AdminFeedbackListItemResponse } from '../../../core/models';

function fakeAdminService() {
  const items: AdminFeedbackListItemResponse[] = [
    {
      id: 'fb-1',
      type: 'bug',
      submittedAsRole: 'buyer',
      subject: 'อัปโหลดไฟล์ไม่ผ่าน',
      status: 'new',
      submitterUserId: 'user-1',
      submitterName: 'ทดสอบ ผู้ใช้',
      attachmentCount: 0,
      createdAt: '2026-09-12T10:00:00Z',
      statusChangedAt: null,
      handledByUserId: null,
      handledByName: null,
    },
  ];

  const detail: AdminFeedbackDetailResponse = {
    ...items[0],
    details: 'เจอ error 500 ตอนอัปโหลด',
    pageUrl: '/seller/upload',
    userAgent: 'Mozilla/5.0',
    submitterEmail: 'user1@example.test',
    adminNote: 'กำลังตรวจสอบ log',
    replyToUser: null,
    closedAt: null,
    attachments: [],
  };

  return {
    listFeedback: vi.fn(async () => ({
      items,
      totalCount: items.length,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    })),
    getFeedback: vi.fn(async () => detail),
    updateFeedbackStatus: vi.fn(async () => ({
      ...detail,
      status: 'in_progress',
    })),
    deleteFeedback: vi.fn(async () => true),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('AdminFeedbackPage', () => {
  let adminService: ReturnType<typeof fakeAdminService>;
  let modalService: { confirm: any; open: any; create: any };
  let messageService: { success: any; error: any };

  beforeEach(() => {
    adminService = fakeAdminService();
    modalService = {
      confirm: vi.fn(),
      open: vi.fn(),
      create: vi.fn(() => {
        const afterClose$ = new Subject<any>();
        const afterOpen$ = new Subject<any>();
        return {
          afterClose: afterClose$,
          afterOpen: afterOpen$,
          close: vi.fn(),
          destroy: vi.fn(),
          _finishDialogClose: vi.fn(),
        };
      }),
    };
    messageService = { success: vi.fn(), error: vi.fn() };

    TestBed.configureTestingModule({
      imports: [AdminFeedbackPage],
      providers: [
        provideNoopAnimations(),
        { provide: AdminService, useValue: adminService },
        { provide: AuthService, useValue: { accessToken: vi.fn(() => 'test-token') } },
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
        { provide: NzModalService, useValue: modalService },
        { provide: NzMessageService, useValue: messageService },
      ],
    }).overrideComponent(AdminFeedbackPage, {
      set: {
        providers: [
          { provide: NzModalService, useValue: modalService },
        ],
      },
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('calling filter methods calls admin.listFeedback with correct arguments', async () => {
    const fixture = TestBed.createComponent(AdminFeedbackPage);
    fixture.detectChanges();
    await settle();

    // Default call: status=undefined, type=undefined, role=undefined
    expect(adminService.listFeedback).toHaveBeenCalledWith(undefined, undefined, undefined, 1, 20);

    // Change status filter to 'new'
    fixture.componentInstance.setStatusFilter('new');
    await settle();
    expect(adminService.listFeedback).toHaveBeenLastCalledWith('new', undefined, undefined, 1, 20);

    // Change type filter to 'bug'
    fixture.componentInstance.setTypeFilter('bug');
    await settle();
    expect(adminService.listFeedback).toHaveBeenLastCalledWith('new', 'bug', undefined, 1, 20);

    // Change role filter to 'seller'
    fixture.componentInstance.setRoleFilter('seller');
    await settle();
    expect(adminService.listFeedback).toHaveBeenLastCalledWith('new', 'bug', 'seller', 1, 20);
  });

  it('updates status, saves detail, and reloads feedback list', async () => {
    const fixture = TestBed.createComponent(AdminFeedbackPage);
    fixture.detectChanges();
    await settle();

    // Open detail
    const listRes = await adminService.listFeedback.mock.results[0].value;
    await fixture.componentInstance.openDetail(listRes.items![0]);
    await settle();

    expect(adminService.getFeedback).toHaveBeenCalledWith('fb-1');

    // Change status form and save
    fixture.componentInstance.formStatus = 'in_progress';
    fixture.componentInstance.formAdminNote = 'ส่งเรื่องให้ dev แล้ว';
    fixture.componentInstance.formReplyToUser = 'รับเรื่องแล้ว อยู่ระหว่างตรวจสอบ';

    await fixture.componentInstance.saveDetail();
    await settle();

    expect(adminService.updateFeedbackStatus).toHaveBeenCalledWith('fb-1', {
      status: 'in_progress',
      adminNote: 'ส่งเรื่องให้ dev แล้ว',
      replyToUser: 'รับเรื่องแล้ว อยู่ระหว่างตรวจสอบ',
    });
    expect(messageService.success).toHaveBeenCalledWith('บันทึกเรียบร้อย');
  });

  it('deleting opens NzModalService.confirm before deleting', () => {
    const fixture = TestBed.createComponent(AdminFeedbackPage);
    fixture.detectChanges();

    fixture.componentInstance.confirmDelete('fb-1');

    expect(modalService.confirm).toHaveBeenCalled();
    const config = modalService.confirm.mock.calls[0][0];
    expect(config.nzTitle).toBe('ลบเรื่องนี้ถาวร?');
    expect(config.nzOkDanger).toBe(true);
    expect(config.nzOkText).toBe('ลบถาวร');
    expect(config.nzCancelText).toBe('ยกเลิก');
  });
});

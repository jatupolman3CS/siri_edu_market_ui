import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { Router } from '@angular/router';
import { FeedbackModalComponent } from './feedback-modal.component';
import { FeedbackService } from '../../../core/services/feedback.service';
import type { MyFeedbackResponse } from '../../../core/models';

function fakeFeedbackService() {
  return {
    submit: vi.fn(async (): Promise<MyFeedbackResponse> => ({
      id: 'fb-1',
      type: 'bug',
      submittedAsRole: 'buyer',
      subject: 'ปุ่มกดไม่ติด',
      details: 'กดปุ่มแล้วไม่มีอะไรเกิดขึ้น',
      pageUrl: '/marketplace',
      status: 'new',
      attachmentCount: 0,
      hasReply: false,
      replyToUser: null,
      closedAt: null,
      createdAt: '2026-09-12T10:00:00Z',
      statusChangedAt: null,
      attachments: [],
    })),
    uploadAttachment: vi.fn(async () => 'user-1/test.png'),
  };
}

describe('FeedbackModalComponent', () => {
  let messageService: { success: any; warning: any; error: any };
  let feedbackService: ReturnType<typeof fakeFeedbackService>;

  beforeEach(() => {
    messageService = {
      success: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
    };
    feedbackService = fakeFeedbackService();

    TestBed.configureTestingModule({
      imports: [FeedbackModalComponent],
      providers: [
        { provide: NzMessageService, useValue: messageService },
        { provide: FeedbackService, useValue: feedbackService },
        {
          provide: Router,
          useValue: { url: '/test-page' },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('submit button is disabled when subject or details is empty', () => {
    const fixture = TestBed.createComponent(FeedbackModalComponent);
    const comp = fixture.componentInstance;
    comp.show();
    fixture.detectChanges();

    expect(comp.isSubmitDisabled).toBe(true);

    comp.subject = 'แจ้งปัญหา';
    comp.details = '   ';
    expect(comp.isSubmitDisabled).toBe(true);

    comp.details = 'รายละเอียดปัญหาที่พบ';
    expect(comp.isSubmitDisabled).toBe(false);
  });

  it('rejects adding a 4th file with Thai warning message', () => {
    const fixture = TestBed.createComponent(FeedbackModalComponent);
    const comp = fixture.componentInstance;
    comp.show();

    // Already has 3 attachments
    comp.attachments.set([
      { file: new File([''], '1.png', { type: 'image/png' }), previewUrl: 'blob:1' },
      { file: new File([''], '2.png', { type: 'image/png' }), previewUrl: 'blob:2' },
      { file: new File([''], '3.png', { type: 'image/png' }), previewUrl: 'blob:3' },
    ]);

    const input = document.createElement('input');
    input.type = 'file';
    const fourthFile = new File(['data'], '4.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [fourthFile] });

    comp.onFilesSelected({ target: input } as unknown as Event);

    expect(messageService.warning).toHaveBeenCalledWith('แนบภาพได้สูงสุด 3 ไฟล์');
    expect(comp.attachments().length).toBe(3);
  });

  it('rejects files larger than 5 MB with Thai warning message', () => {
    const fixture = TestBed.createComponent(FeedbackModalComponent);
    const comp = fixture.componentInstance;
    comp.show();

    const largeFile = new File(['a'.repeat(100)], 'large.png', { type: 'image/png' });
    Object.defineProperty(largeFile, 'size', { value: 6 * 1024 * 1024 }); // 6 MB

    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [largeFile] });

    comp.onFilesSelected({ target: input } as unknown as Event);

    expect(messageService.warning).toHaveBeenCalledWith('ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB ต่อไฟล์');
    expect(comp.attachments().length).toBe(0);
  });

  it('submits successfully, shows success message, emits submitted, and closes modal', async () => {
    const fixture = TestBed.createComponent(FeedbackModalComponent);
    const comp = fixture.componentInstance;
    comp.show();

    comp.subject = 'พบปัญหาหน้าค้นหา';
    comp.details = 'ค้นหาแล้วผลลัพธ์ไม่ขึ้น';

    let submittedEmitted = false;
    comp.submitted.subscribe(() => {
      submittedEmitted = true;
    });

    await comp.submit();

    expect(feedbackService.submit).toHaveBeenCalledWith({
      type: 'bug',
      submittedAsRole: 'buyer',
      subject: 'พบปัญหาหน้าค้นหา',
      details: 'ค้นหาแล้วผลลัพธ์ไม่ขึ้น',
      pageUrl: '/test-page',
      attachmentKeys: null,
    });
    expect(messageService.success).toHaveBeenCalledWith('ส่งเรียบร้อย ทีมงานจะตรวจสอบและติดตามให้เร็วที่สุด');
    expect(submittedEmitted).toBe(true);
    expect(comp.open()).toBe(false);
  });

  it('handles 429 quota exceeded error with specific Thai message', async () => {
    const fixture = TestBed.createComponent(FeedbackModalComponent);
    const comp = fixture.componentInstance;
    comp.show();

    comp.subject = 'ปัญหา';
    comp.details = 'รายละเอียด';

    feedbackService.submit.mockRejectedValueOnce({
      status: 429,
      error: { message: 'Too Many Requests' },
    });

    await comp.submit();

    expect(messageService.error).toHaveBeenCalledWith(
      'คุณส่งเรื่องมาหลายครั้งแล้ววันนี้ กรุณารอสักครู่แล้วลองใหม่'
    );
    expect(comp.open()).toBe(true);
  });
});

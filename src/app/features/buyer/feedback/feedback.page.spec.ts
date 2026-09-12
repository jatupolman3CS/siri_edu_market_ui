import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BuyerFeedbackPage } from './feedback.page';
import { FeedbackModalComponent } from '../../../shared/components/feedback-modal/feedback-modal.component';
import { FeedbackService } from '../../../core/services/feedback.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { MyFeedbackListItemResponse, MyFeedbackResponse } from '../../../core/models';

function fakeFeedbackService() {
  const items: MyFeedbackListItemResponse[] = [
    {
      id: 'fb-1',
      type: 'bug',
      submittedAsRole: 'buyer',
      subject: 'บั๊กตะกร้าสินค้า',
      status: 'resolved',
      attachmentCount: 1,
      hasReply: true,
      createdAt: '2026-09-12T08:00:00Z',
      statusChangedAt: '2026-09-12T09:00:00Z',
    },
  ];

  const detail: MyFeedbackResponse = {
    ...items[0],
    details: 'กดชำระเงินแล้วขึ้น error',
    pageUrl: '/checkout',
    replyToUser: 'ทีมงานแก้ไขเรียบร้อยแล้วค่ะ',
    closedAt: '2026-09-12T09:00:00Z',
    attachments: [
      {
        id: 'att-1',
        url: '/api/files/download/test.png',
        contentType: 'image/png',
        sizeBytes: 1024,
      },
    ],
  };

  return {
    listMine: vi.fn(async () => ({
      items,
      totalCount: items.length,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })),
    getMine: vi.fn(async () => detail),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe('BuyerFeedbackPage', () => {
  let feedbackService: ReturnType<typeof fakeFeedbackService>;

  beforeEach(() => {
    feedbackService = fakeFeedbackService();
    TestBed.configureTestingModule({
      imports: [BuyerFeedbackPage],
      providers: [
        { provide: FeedbackService, useValue: feedbackService },
        { provide: AuthService, useValue: { accessToken: vi.fn(() => 'test-token') } },
        { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders feedback list with Thai status', async () => {
    const fixture = TestBed.createComponent(BuyerFeedbackPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('บั๊กตะกร้าสินค้า');
    expect(text).toContain('แก้ไขแล้ว');
  });

  it('shows empty state when no feedback is found', async () => {
    feedbackService.listMine.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    });

    const fixture = TestBed.createComponent(BuyerFeedbackPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ยังไม่มีเรื่องที่ส่ง');
    expect(text).toContain('ถ้าเจอปัญหาหรือมีข้อเสนอแนะ กดปุ่ม "ส่งเรื่องใหม่" ได้เลย');
  });

  it('opens modal when clicking "ส่งเรื่องใหม่"', async () => {
    const fixture = TestBed.createComponent(BuyerFeedbackPage);
    fixture.detectChanges();
    await settle();

    const modalDebug = fixture.debugElement.query(By.directive(FeedbackModalComponent));
    expect(modalDebug).toBeTruthy();
    const modal = modalDebug.componentInstance as FeedbackModalComponent;
    const showSpy = vi.spyOn(modal, 'show');

    const button = (fixture.nativeElement as HTMLElement).querySelector('button.btn-primary') as HTMLButtonElement;
    button.click();

    expect(showSpy).toHaveBeenCalledWith('buyer');
  });

  it('displays replyToUser in highlighted box when item is expanded', async () => {
    const fixture = TestBed.createComponent(BuyerFeedbackPage);
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();

    // Click to expand first item
    await fixture.componentInstance.toggleExpand('fb-1');
    await settle();
    fixture.detectChanges();

    expect(feedbackService.getMine).toHaveBeenCalledWith('fb-1');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คำตอบจากทีมงาน');
    expect(text).toContain('ทีมงานแก้ไขเรียบร้อยแล้วค่ะ');
  });
});

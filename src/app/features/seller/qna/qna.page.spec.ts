import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzTooltipDirective } from 'ng-zorro-antd/tooltip';
import { SellerQnaPage } from './qna.page';
import { SellerService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { SellerQnaItem } from '../../../core/models';

/**
 * document-faq-tab v1.1 §1/§4 test list — seller Q&A "ปักหมุดเป็น FAQ" switch:
 *  - AC-12: switch disabled when the question is unanswered, with the exact Thai tooltip
 *  - switch enabled once answered, no tooltip
 *  - success copy: "ปักหมุดเป็น FAQ แล้ว" / "ถอนหมุด FAQ แล้ว"
 *  - failure copy: "อัปเดต FAQ ไม่สำเร็จ" when `SellerService.setQnaFaq`
 *    (wired to `putApiSellerQnaByQuestionIdFaq`, contract §3.1) rejects
 */
function buildQuestion(over: Partial<SellerQnaItem> = {}): SellerQnaItem {
  return {
    id: 'q-1',
    documentId: 'doc-1',
    documentTitle: 'สรุปคณิต ม.6',
    buyerName: 'น้องเอ',
    question: 'มีบทที่ 5 ไหม',
    askedAt: '2026-08-01T00:00:00Z',
    answerText: null,
    answeredAt: null,
    isFaq: false,
    faqSortOrder: 0,
    ...over,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function render(
  items: SellerQnaItem[],
  setQnaFaqImpl?: () => Promise<void>,
  draftQnaAnswerImpl?: (questionId: string) => Promise<string>,
) {
  const messages = { success: vi.fn(), warning: vi.fn(), error: vi.fn() };
  const apiFail = { report: vi.fn() };
  const seller = {
    listQuestions: vi.fn(async () => items),
    answerQuestion: vi.fn(async () => {}),
    setQnaFaq: vi.fn(setQnaFaqImpl ?? (async () => {})),
    draftQnaAnswer: vi.fn(draftQnaAnswerImpl ?? (async () => '')),
  };

  TestBed.configureTestingModule({
    imports: [SellerQnaPage],
    providers: [
      { provide: SellerService, useValue: seller },
      { provide: NzMessageService, useValue: messages },
      { provide: ApiFailureReporter, useValue: apiFail },
    ],
  });

  const fixture = TestBed.createComponent(SellerQnaPage);
  fixture.detectChanges();
  return { fixture, seller, messages, apiFail };
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerQnaPage — FAQ pin/unpin (document-faq-tab v1)', () => {
  it('AC-12: disables the switch and shows the exact tooltip when the question is unanswered', async () => {
    const { fixture } = render([buildQuestion({ answerText: null })]);
    await settle();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.ant-switch') as HTMLButtonElement;
    expect(button).toBeTruthy();
    expect(button.disabled).toBe(true);

    const tooltipDe = fixture.debugElement.query(By.directive(NzTooltipDirective));
    const directive = tooltipDe.injector.get(NzTooltipDirective);
    expect(directive.title).toBe('ต้องตอบคำถามก่อนจึงจะปักหมุดได้');
  });

  it('enables the switch once the question is answered, with no tooltip title', async () => {
    const { fixture } = render([
      buildQuestion({ answerText: 'มีค่ะ', answeredAt: '2026-08-02T00:00:00Z' }),
    ]);
    await settle();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button.ant-switch') as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    const tooltipDe = fixture.debugElement.query(By.directive(NzTooltipDirective));
    const directive = tooltipDe.injector.get(NzTooltipDirective);
    expect(directive.title).toBeFalsy();
  });

  it('shows "ปักหมุดเป็น FAQ แล้ว" on success, sends {isFaq, sortOrder}, and reloads the list', async () => {
    const q = buildQuestion({ answerText: 'มีค่ะ', answeredAt: '2026-08-02T00:00:00Z' });
    const { fixture, seller, messages } = render([q]);
    await settle();

    await fixture.componentInstance.toggleFaq(q, true);

    expect(seller.setQnaFaq).toHaveBeenCalledWith('q-1', true, 0);
    expect(messages.success).toHaveBeenCalledWith('ปักหมุดเป็น FAQ แล้ว');
    // initial reload() from the constructor + the reload() after a successful toggle
    expect(seller.listQuestions).toHaveBeenCalledTimes(2);
  });

  it('shows "ถอนหมุด FAQ แล้ว" when unpinning', async () => {
    const q = buildQuestion({
      answerText: 'มีค่ะ',
      answeredAt: '2026-08-02T00:00:00Z',
      isFaq: true,
    });
    const { fixture, messages } = render([q]);
    await settle();

    await fixture.componentInstance.toggleFaq(q, false);

    expect(messages.success).toHaveBeenCalledWith('ถอนหมุด FAQ แล้ว');
  });

  it('shows "อัปเดต FAQ ไม่สำเร็จ" when setQnaFaq rejects', async () => {
    const q = buildQuestion({ answerText: 'มีค่ะ', answeredAt: '2026-08-02T00:00:00Z' });
    const { fixture, apiFail } = render([q], async () => {
      throw new Error('network error');
    });
    await settle();

    await fixture.componentInstance.toggleFaq(q, true);

    expect(apiFail.report).toHaveBeenCalledWith('อัปเดต FAQ ไม่สำเร็จ', expect.any(Error));
  });

  it('sends the "ลำดับการแสดง" draft value as sortOrder', async () => {
    const q = buildQuestion({ answerText: 'มีค่ะ', answeredAt: '2026-08-02T00:00:00Z' });
    const { fixture, seller } = render([q]);
    await settle();

    fixture.componentInstance.onSortOrderChange(q, 5);
    await fixture.componentInstance.toggleFaq(q, true);

    expect(seller.setQnaFaq).toHaveBeenCalledWith('q-1', true, 5);
  });

  it('never calls setQnaFaq for a still-unanswered question, even if invoked directly', async () => {
    const q = buildQuestion({ answerText: null });
    const { fixture, seller } = render([q]);
    await settle();

    await fixture.componentInstance.toggleFaq(q, true);

    expect(seller.setQnaFaq).not.toHaveBeenCalled();
  });
});

/**
 * ai-qna-draft v1 §1 test list — "AI ช่วยร่างคำตอบ" button (`requestAiDraft`):
 *  - AC-1: fills `answerText` from the draft but never calls `submitAnswer`/`answerQuestion`
 *    automatically — the seller must still press "ตอบคำถาม" themselves
 *  - success/warning toast copy matches the existing UI text
 *  - AI failure reports through `ApiFailureReporter`, does not touch `answerText`
 */
describe('SellerQnaPage — requestAiDraft (ai-qna-draft v1 §1)', () => {
  it('AC-1: fills answerText with the AI draft and does not call answerQuestion automatically', async () => {
    const q = buildQuestion();
    const { fixture, seller, messages } = render([q], undefined, async () => 'สวัสดีครับ นี่คือร่างคำตอบ');
    await settle();

    await fixture.componentInstance.requestAiDraft(q.id);

    expect(seller.draftQnaAnswer).toHaveBeenCalledWith('q-1');
    expect(fixture.componentInstance.answerText()).toBe('สวัสดีครับ นี่คือร่างคำตอบ');
    expect(seller.answerQuestion).not.toHaveBeenCalled();
    expect(messages.success).toHaveBeenCalledWith(
      'AI ช่วยร่างคำตอบเรียบร้อย คุณสามารถแก้ไขเพิ่มเติมได้',
    );
  });

  it('shows a warning and leaves answerText untouched when the AI draft is empty', async () => {
    const q = buildQuestion();
    const { fixture, messages } = render([q], undefined, async () => '');
    await settle();

    await fixture.componentInstance.requestAiDraft(q.id);

    expect(fixture.componentInstance.answerText()).toBe('');
    expect(messages.warning).toHaveBeenCalledWith('ไม่สามารถสร้างร่างคำตอบได้ในขณะนี้');
  });

  it('reports the failure via ApiFailureReporter when draftQnaAnswer rejects', async () => {
    const q = buildQuestion();
    const { fixture, apiFail } = render([q], undefined, async () => {
      throw new Error('AI unavailable');
    });
    await settle();

    await fixture.componentInstance.requestAiDraft(q.id);

    expect(apiFail.report).toHaveBeenCalledWith('ร่างคำตอบด้วย AI', expect.any(Error));
    expect(fixture.componentInstance.draftingAi()).toBe(false);
  });
});

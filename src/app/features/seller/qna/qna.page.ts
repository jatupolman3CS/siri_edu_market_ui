import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { SellerQnaItem } from '../../../core/models';
import { SellerService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * GAP-06: the seller's inbox for questions asked on their listings. The QNA table was
 * rendered on the public listing but had no write path, so nothing could be answered.
 *
 * document-faq-tab v1 §3.1/§4: each answered question can also be pinned as FAQ here
 * (switch + display-order field) — the switch stays disabled until the question is answered.
 */
@Component({
  selector: 'app-seller-qna',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, NzSwitchModule, NzTooltipModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qna.page.html',
})
export class SellerQnaPage {
  private readonly seller = inject(SellerService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly items = signal<SellerQnaItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly unansweredOnly = signal<boolean>(true);

  /** Question currently being answered, and the draft answer. */
  readonly answeringId = signal<string | null>(null);
  readonly answerText = signal<string>('');
  readonly submitting = signal<boolean>(false);

  /** document-faq-tab v1 §3.1: question id whose pin/unpin PUT is in flight (guards double-submit). */
  readonly savingFaqId = signal<string | null>(null);
  /**
   * Local draft for "ลำดับการแสดง" per question id, seeded from the loaded item's
   * `faqSortOrder` — lets the seller type a value before flipping the switch without an
   * extra round trip.
   */
  readonly faqSortDrafts = signal<Record<string, number>>({});

  constructor() {
    void this.reload();
  }

  /** Draft value for the "ลำดับการแสดง" input — falls back to the loaded `faqSortOrder`. */
  sortOrderFor(q: SellerQnaItem): number {
    return this.faqSortDrafts()[q.id] ?? q.faqSortOrder;
  }

  onSortOrderChange(q: SellerQnaItem, value: number): void {
    this.faqSortDrafts.update((drafts) => ({ ...drafts, [q.id]: value }));
  }

  async toggleFaq(q: SellerQnaItem, isFaq: boolean): Promise<void> {
    if (this.savingFaqId()) return;
    if (!q.answerText) return; // guarded by the disabled switch too — defence in depth

    this.savingFaqId.set(q.id);
    try {
      await this.seller.setQnaFaq(q.id, isFaq, this.sortOrderFor(q));
      this.message.success(isFaq ? 'ปักหมุดเป็น FAQ แล้ว' : 'ถอนหมุด FAQ แล้ว');
      await this.reload();
    } catch (e) {
      this.apiFail.report('อัปเดต FAQ ไม่สำเร็จ', e);
    } finally {
      this.savingFaqId.set(null);
    }
  }

  toggleFilter(): void {
    this.unansweredOnly.update((v) => !v);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.items.set(await this.seller.listQuestions(this.unansweredOnly()));
    } catch (e) {
      this.apiFail.report('โหลดคำถามจากผู้ซื้อ', e);
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  startAnswer(question: SellerQnaItem): void {
    this.answeringId.set(question.id);
    this.answerText.set(question.answerText ?? '');
  }

  cancelAnswer(): void {
    this.answeringId.set(null);
    this.answerText.set('');
  }

  async submitAnswer(questionId: string): Promise<void> {
    const answer = this.answerText().trim();
    if (!answer) {
      this.message.warning('กรุณาพิมพ์คำตอบ');
      return;
    }
    if (this.submitting()) return;

    this.submitting.set(true);
    try {
      await this.seller.answerQuestion(questionId, answer);
      this.message.success('ตอบคำถามเรียบร้อย');
      this.cancelAnswer();
      await this.reload();
    } catch (e) {
      this.apiFail.report('ตอบคำถาม', e);
    } finally {
      this.submitting.set(false);
    }
  }
}

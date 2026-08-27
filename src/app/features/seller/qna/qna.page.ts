import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { SellerQnaResponse } from '../../../core/api';
import { SellerService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/**
 * GAP-06: the seller's inbox for questions asked on their listings. The QNA table was
 * rendered on the public listing but had no write path, so nothing could be answered.
 */
@Component({
  selector: 'app-seller-qna',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qna.page.html',
})
export class SellerQnaPage {
  private readonly seller = inject(SellerService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly items = signal<SellerQnaResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly unansweredOnly = signal<boolean>(true);

  /** Question currently being answered, and the draft answer. */
  readonly answeringId = signal<string | null>(null);
  readonly answerText = signal<string>('');
  readonly submitting = signal<boolean>(false);

  constructor() {
    void this.reload();
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

  startAnswer(question: SellerQnaResponse): void {
    this.answeringId.set(question.id ?? null);
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

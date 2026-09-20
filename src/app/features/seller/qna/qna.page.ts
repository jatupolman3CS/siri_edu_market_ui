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
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

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
  imports: [CommonModule, DatePipe, FormsModule, NzSwitchModule, NzTooltipModule, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './qna.page.html',
})
export class SellerQnaPage {
  private readonly seller = inject(SellerService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

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
      this.message.success(isFaq ? this.translation.t('seller.faqPinned') : this.translation.t('seller.faqUnpinned'));
      await this.reload();
    } catch (e) {
      this.apiFail.report(this.translation.t('systemContent.updateFaq'), e);
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
      this.apiFail.report(this.translation.t('systemContent.loadBuyerQuestions'), e);
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

  readonly draftingAi = signal<boolean>(false);

  async requestAiDraft(questionId: string): Promise<void> {
    if (this.draftingAi()) return;
    this.draftingAi.set(true);
    try {
      const draft = await this.seller.draftQnaAnswer(questionId);
      if (draft?.trim()) {
        this.answerText.set(draft.trim());
        this.message.success(this.translation.t('seller.aiDraftSuccess'));
      } else {
        this.message.warning(this.translation.t('seller.aiDraftFailed'));
      }
    } catch (e) {
      this.apiFail.report(this.translation.t('systemContent.draftAiAnswer'), e);
    } finally {
      this.draftingAi.set(false);
    }
  }

  async submitAnswer(questionId: string): Promise<void> {
    const answer = this.answerText().trim();
    if (!answer) {
      this.message.warning(this.translation.t('seller.pleaseEnterAnswer'));
      return;
    }
    if (this.submitting()) return;

    this.submitting.set(true);
    try {
      await this.seller.answerQuestion(questionId, answer);
      this.message.success(this.translation.t('seller.answerSuccess'));
      this.cancelAnswer();
      await this.reload();
    } catch (e) {
      this.apiFail.report(this.translation.t('systemContent.answerQuestion'), e);
    } finally {
      this.submitting.set(false);
    }
  }
}

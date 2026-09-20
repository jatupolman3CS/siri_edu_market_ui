import { ChangeDetectionStrategy, Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FeedbackService } from '../../../core/services/feedback.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';
import type { FeedbackRole, FeedbackType, SubmitFeedbackRequest } from '../../../core/models';

export interface LocalAttachment {
  file: File;
  previewUrl: string;
  key?: string;
  uploading?: boolean;
}

@Component({
  selector: 'app-feedback-modal',
  standalone: true,
  imports: [FormsModule, NzModalModule, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-modal.component.html',
  styleUrls: ['./feedback-modal.component.scss'],
})
export class FeedbackModalComponent {
  private readonly feedbackService = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  readonly translation = inject(TranslationService);

  readonly context = input<FeedbackRole>('buyer');
  readonly open = model<boolean>(false);
  readonly submitted = output<void>();

  readonly sending = signal(false);
  readonly attachments = signal<LocalAttachment[]>([]);

  type: FeedbackType = 'bug';
  subject = '';
  details = '';
  pageUrl: string | null = null;

  readonly types = computed(() => [
    { value: 'bug', label: this.translation.t('shared.feedbackModal.types.bug') },
    { value: 'suggestion', label: this.translation.t('shared.feedbackModal.types.suggestion') },
    { value: 'usability', label: this.translation.t('shared.feedbackModal.types.usability') },
    { value: 'other', label: this.translation.t('shared.feedbackModal.types.other') },
  ]);

  private readonly allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  private readonly maxFileSize = 5_000_000; // 5 MB, decimal

  get isSubmitDisabled(): boolean {
    return !this.subject.trim() || !this.details.trim() || this.sending();
  }

  show(ctx?: FeedbackRole): void {
    this.type = 'bug';
    this.subject = '';
    this.details = '';
    this.pageUrl = this.router.url;
    this.attachments.set([]);
    this.open.set(true);
  }

  cancel(): void {
    if (this.sending()) return;
    this.open.set(false);
  }

  onFilesSelected(event: Event): void {
    const inputEl = event.target as HTMLInputElement;
    if (!inputEl.files || inputEl.files.length === 0) return;

    const current = this.attachments();
    const incoming = Array.from(inputEl.files);

    if (current.length + incoming.length > 3) {
      this.message.warning(this.translation.t('shared.feedbackModal.maxFiles'));
      inputEl.value = '';
      return;
    }

    const next: LocalAttachment[] = [...current];

    for (const file of incoming) {
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
      if (!this.allowedExtensions.includes(ext)) {
        this.message.warning(this.translation.t('shared.feedbackModal.supportedTypes'));
        inputEl.value = '';
        return;
      }

      if (file.size > this.maxFileSize) {
        this.message.warning(this.translation.t('shared.feedbackModal.fileTooLarge'));
        inputEl.value = '';
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      next.push({ file, previewUrl });
    }

    this.attachments.set(next);
    inputEl.value = '';
  }

  removeAttachment(index: number): void {
    const current = this.attachments();
    const removed = current[index];
    if (removed?.previewUrl) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    this.attachments.set(current.filter((_, i) => i !== index));
  }

  async submit(): Promise<void> {
    const trimmedSubject = this.subject.trim();
    const trimmedDetails = this.details.trim();

    if (!trimmedSubject || !trimmedDetails) {
      this.message.warning(this.translation.t('shared.feedbackModal.subjectDetailsRequired'));
      return;
    }

    if (this.sending()) return;
    this.sending.set(true);

    try {
      // 1. Upload any attachments that don't have keys yet
      const currentAttachments = this.attachments();
      const keys: string[] = [];

      for (const att of currentAttachments) {
        if (att.key) {
          keys.push(att.key);
        } else {
          try {
            const res = await this.feedbackService.uploadAttachment(att.file);
            att.key = res.key;
            keys.push(res.key);
          } catch {
            this.message.error(this.translation.t('shared.feedbackModal.failMessage'));
            this.sending.set(false);
            return;
          }
        }
      }

      // 2. Submit feedback
      const request: SubmitFeedbackRequest = {
        type: this.type,
        submittedAsRole: this.context(),
        subject: trimmedSubject,
        details: trimmedDetails,
        pageUrl: this.pageUrl,
        attachmentKeys: keys.length > 0 ? keys : null,
      };

      await this.feedbackService.submit(request);

      this.message.success(this.translation.t('shared.feedbackModal.successMessage'));
      this.open.set(false);
      this.submitted.emit();
    } catch (e: unknown) {
      const status = (e as { status?: number; statusCode?: number } | null)?.status
        ?? (e as { statusCode?: number } | null)?.statusCode;

      if (status === 429) {
        this.message.error(this.translation.t('shared.feedbackModal.rateLimit'));
      } else {
        this.message.error(this.translation.t('shared.feedbackModal.failMessage'));
      }
    } finally {
      this.sending.set(false);
    }
  }
}

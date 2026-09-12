import { ChangeDetectionStrategy, Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { FeedbackService } from '../../../core/services/feedback.service';
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
  imports: [FormsModule, NzModalModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-modal.component.html',
  styleUrls: ['./feedback-modal.component.scss'],
})
export class FeedbackModalComponent {
  private readonly feedbackService = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly context = input<FeedbackRole>('buyer');
  readonly open = model<boolean>(false);
  readonly submitted = output<void>();

  readonly sending = signal(false);
  readonly attachments = signal<LocalAttachment[]>([]);

  type: FeedbackType = 'bug';
  subject = '';
  details = '';
  pageUrl: string | null = null;

  readonly types = [
    { value: 'bug', label: 'แจ้งบั๊ก/ข้อผิดพลาด' },
    { value: 'suggestion', label: 'ข้อเสนอแนะ' },
    { value: 'usability', label: 'ปัญหาการใช้งาน' },
    { value: 'other', label: 'อื่น ๆ' },
  ];

  private readonly allowedExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
  /**
   * F-07 fix: the server rejects anything over 5,000,000 bytes (`system-feedback.md` §“กฎการ
   * ตรวจ attachmentKeys” ข้อ 6). Checking 5 MiB here let 5.00–5.24 MB files sail past the form and
   * fail with a 400 only after the upload had already run.
   */
  private readonly maxFileSize = 5_000_000; // 5 MB, decimal — same number the API enforces

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
      this.message.warning('แนบภาพได้สูงสุด 3 ไฟล์');
      inputEl.value = '';
      return;
    }

    const next: LocalAttachment[] = [...current];

    for (const file of incoming) {
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
      if (!this.allowedExtensions.includes(ext)) {
        this.message.warning('รองรับเฉพาะไฟล์ภาพ PNG, JPG, WEBP หรือ GIF');
        inputEl.value = '';
        return;
      }

      if (file.size > this.maxFileSize) {
        this.message.warning('ไฟล์แนบต้องมีขนาดไม่เกิน 5 MB ต่อไฟล์');
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
      this.message.warning('กรุณากรอกหัวข้อและรายละเอียด');
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
            this.message.error('ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
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

      this.message.success('ส่งเรียบร้อย ทีมงานจะตรวจสอบและติดตามให้เร็วที่สุด');
      this.open.set(false);
      this.submitted.emit();
    } catch (e: unknown) {
      const status = (e as { status?: number; statusCode?: number } | null)?.status
        ?? (e as { statusCode?: number } | null)?.statusCode;

      if (status === 429) {
        this.message.error('คุณส่งเรื่องมาหลายครั้งแล้ววันนี้ กรุณารอสักครู่แล้วลองใหม่');
      } else {
        this.message.error('ส่งไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      this.sending.set(false);
    }
  }
}

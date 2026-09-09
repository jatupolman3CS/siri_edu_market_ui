import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, CatalogService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

/**
 * F-09 (N-05): "report this document".
 *
 * The only endpoint that could create a DOCUMENT_REPORT used to be admin-only, so a marketplace
 * selling other people's files had no way for the person whose work was being resold to say so.
 *
 * The reason is a closed list plus a required description. Free text alone cannot be triaged,
 * and the stored Reason is capped at 500 characters — the same list the server validates
 * against, mirrored here so the choice is presented rather than guessed at.
 */
@Component({
  selector: 'app-report-document',
  standalone: true,
  imports: [FormsModule, NzModalModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-document.component.html',
})
export class ReportDocumentComponent {
  private readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly documentId = input.required<string>();

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly sent = signal(false);

  category = 'copyright';
  details = '';

  /** Mirrors DocumentReportCategories on the server. */
  readonly categories = [
    { value: 'copyright', label: 'ละเมิดลิขสิทธิ์' },
    { value: 'inappropriate', label: 'เนื้อหาไม่เหมาะสม' },
    { value: 'inaccurate', label: 'ข้อมูลผิด' },
    { value: 'other', label: 'อื่น ๆ' },
  ];

  start(): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/document/${this.documentId()}` },
      });
      return;
    }
    this.category = 'copyright';
    this.details = '';
    this.open.set(true);
  }

  cancel(): void {
    this.open.set(false);
  }

  async submit(): Promise<void> {
    const details = this.details.trim();
    if (details.length === 0) {
      this.message.warning('กรุณาอธิบายเพิ่มเติมว่าเอกสารนี้มีปัญหาอย่างไร');
      return;
    }
    if (this.sending()) return;

    this.sending.set(true);
    try {
      await this.catalog.reportDocument(this.documentId(), this.category, details);
      this.open.set(false);
      this.sent.set(true);
      this.message.success('ส่งรายงานเรียบร้อย ทีมงานจะตรวจสอบให้เร็วที่สุด');
    } catch (e) {
      // The server answers 409 when this person already has an open report on this document.
      // That is not a failure the user should read as "try again", so it is named directly.
      const status = (e as { status?: number; statusCode?: number } | null)?.status
        ?? (e as { statusCode?: number } | null)?.statusCode;
      if (status === 409) {
        this.open.set(false);
        this.sent.set(true);
        this.message.info('คุณรายงานเอกสารนี้ไว้แล้ว และทีมงานยังตรวจสอบไม่เสร็จ');
      } else {
        this.message.error('ส่งรายงานไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      this.sending.set(false);
    }
  }
}

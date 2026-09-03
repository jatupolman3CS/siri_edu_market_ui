import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { DocumentService } from '../../../core/services/document.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-pdf-preview-upload',
  standalone: true,
  imports: [FormsModule, IconComponent, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pdf-preview-upload.page.html',
  styleUrl: './pdf-preview-upload.page.scss',
})
export class PdfPreviewUploadPage {
  private readonly documents = inject(DocumentService);
  private readonly message = inject(NzMessageService);

  readonly uploading = signal(false);
  readonly documentId = signal<string>('');
  readonly previewUrls = signal<string[]>([]);
  /** QA fix: shown in the branded dropzone instead of the browser's native "No file chosen". */
  readonly selectedFileName = signal<string>('');

  resolveUrl(url: string): string {
    return resolvePublicUrl(url);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.selectedFileName.set(file.name);
    void this.doUpload(file);
  }

  private async doUpload(file: File): Promise<void> {
    this.uploading.set(true);
    this.previewUrls.set([]);
    this.documentId.set('');
    try {
      const res = await this.documents.uploadPdf(file);
      this.documentId.set(res.documentId ?? '');
      this.previewUrls.set(res.previewImageUrls ?? []);
      this.message.success('อัปโหลด PDF และสร้างพรีวิวแล้ว');
    } catch {
      this.message.error('อัปโหลดไม่สำเร็จ — ตรวจสอบว่าเข้าสู่ระบบในฐานะผู้ขาย/แอดมิน');
    } finally {
      this.uploading.set(false);
    }
  }
}

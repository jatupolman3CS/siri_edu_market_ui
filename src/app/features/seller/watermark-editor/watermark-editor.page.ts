import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { SellerWatermarkTemplateService } from '../../../core/services/seller-watermark-template.service';
import {
  getApiSellerDocumentWatermarkConfig,
  postApiSellerDocumentWatermarkConfig,
  type SellerWatermarkConfigRequest,
} from '../../../core/api/seller-watermark.api';
import { unwrapSdkResult } from '../../../core/services/api-result';
import { IconComponent } from '../../../shared/components/icon/icon.component';

export interface PositionOption {
  value: string;
  label: string;
  gridRow: number;
  gridCol: number;
}

@Component({
  selector: 'app-watermark-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './watermark-editor.page.html',
  styleUrl: './watermark-editor.page.scss',
})
export class WatermarkEditorPage {
  private readonly auth = inject(AuthService);
  private readonly templates = inject(SellerWatermarkTemplateService);
  private readonly message = inject(NzMessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  // Active Tab: 'web-preview' | 'personalized'
  readonly activeTab = signal<'web-preview' | 'personalized'>('web-preview');

  // watermark-editor-document-mode v1 §4: null = template mode (`/seller/watermark`),
  // a document id = document mode (`/seller/documents/:id/watermark`) — read once at init.
  readonly documentId = signal<string | null>(null);
  // Only meaningful in document mode — stays true forever if the GET fails so the form is
  // never rendered against a document that doesn't exist / isn't the caller's (AC-03).
  readonly loading = signal(false);
  readonly documentTitle = signal('');

  readonly saving = signal(false);
  readonly watermarkEnabled = signal(true);
  readonly previewWatermarkFontFamily = signal('Noto Sans Thai');
  readonly previewWatermarkFontOptions = ['Noto Sans Thai', 'Sarabun', 'Kanit', 'Prompt', 'Arial'];

  // Tab 1: Web Preview Watermark Settings
  readonly watermarkText = signal<string>('SIRI EDUMARKET PREVIEW');
  readonly watermarkPosition = signal<string>('center-diagonal');
  readonly watermarkOpacity = signal<number>(25); // percentage 10-90
  readonly watermarkColor = signal<string>('#E11D48');
  readonly watermarkFontSize = signal<number>(42);
  readonly watermarkRotation = signal<number>(-30);

  // Tab 2: Personalized Download Watermark Settings
  readonly downloadWatermarkPosition = signal<string>('footer');
  readonly downloadWatermarkTemplate = signal<string>(
    'เอกสารนี้ได้รับสิทธิ์การใช้งานโดย {email} เมื่อ {date} (รหัสตรวจสอบ: {token}) ห้ามทำซ้ำ ดัดแปลง หรือเผยแพร่ต่อ'
  );

  // Test Simulator
  readonly simBuyerEmail = signal<string>('buyer.somchai@example.com');
  readonly simToken = signal<string>('SEC-9F2B8D');


  // Color presets
  readonly colorPresets = [
    { name: 'Rose Red', hex: '#E11D48' },
    { name: 'Slate Gray', hex: '#64748B' },
    { name: 'Indigo Blue', hex: '#4F46E5' },
    { name: 'Amber Gold', hex: '#D97706' },
    { name: 'Emerald Green', hex: '#059669' },
    { name: 'Dark Slate', hex: '#1E293B' },
  ];

  // 9-Grid positions
  readonly gridPositions: PositionOption[] = [
    { value: 'top-left', label: 'บนซ้าย', gridRow: 1, gridCol: 1 },
    { value: 'top-center', label: 'บนกลาง', gridRow: 1, gridCol: 2 },
    { value: 'top-right', label: 'บนขวา', gridRow: 1, gridCol: 3 },
    { value: 'middle-left', label: 'กลางซ้าย', gridRow: 2, gridCol: 1 },
    { value: 'center', label: 'ตรงกลาง', gridRow: 2, gridCol: 2 },
    { value: 'middle-right', label: 'กลางขวา', gridRow: 2, gridCol: 3 },
    { value: 'bottom-left', label: 'ล่างซ้าย', gridRow: 3, gridCol: 1 },
    { value: 'bottom-center', label: 'ล่างกลาง', gridRow: 3, gridCol: 2 },
    { value: 'bottom-right', label: 'ล่างขวา', gridRow: 3, gridCol: 3 },
  ];

  // Download position options
  readonly downloadPositions = [
    { value: 'footer', label: 'ท้ายหน้ากระดาษ (Footer)', desc: 'ประทับที่ขอบล่างของทุกหน้า แนะนำสำหรับเอกสารทั่วไป' },
    { value: 'header', label: 'หัวกระดาษ (Header)', desc: 'ประทับที่ขอบบนของทุกหน้า' },
    { value: 'diagonal', label: 'พาดเฉียงกลางหน้า (Diagonal)', desc: 'พาดกลางหน้ากระดาษแบบโปร่งใส ป้องกันการแคปภาพหรือถ่ายสำเนา' },
    { value: 'both', label: 'หัวและท้ายกระดาษ (Both)', desc: 'ประทับทั้งขอบบนและล่างเพื่อความปลอดภัยสูงสุด' },
  ];

  // Computed personalized stamped sample text
  readonly simulatedDownloadText = computed(() => {
    const tpl = this.downloadWatermarkTemplate();
    const email = this.simBuyerEmail() || 'buyer@example.com';
    const token = this.simToken() || 'SEC-000000';
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('th-TH')} ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;
    const platform = 'SIRI EDUMARKET';

    return tpl
      .replace(/{email}/gi, email)
      .replace(/{token}/gi, token)
      .replace(/{date}/gi, dateStr)
      .replace(/{platform}/gi, platform);
  });

  setPosition(pos: string): void {
    this.watermarkPosition.set(pos);
    if (pos === 'center-diagonal') {
      this.watermarkRotation.set(-30);
    } else if (pos === 'tile') {
      this.watermarkRotation.set(-25);
    } else {
      this.watermarkRotation.set(0);
    }
  }

  setColor(hex: string): void {
    this.watermarkColor.set(hex);
  }

  insertTag(tag: string): void {
    const current = this.downloadWatermarkTemplate();
    this.downloadWatermarkTemplate.set(`${current} ${tag}`);
  }

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    this.documentId.set(id);
    if (id) {
      this.loading.set(true);
      void this.loadDocumentConfig(id);
    } else {
      this.loadTemplateConfig();
    }
  }

  private loadTemplateConfig(): void {
    const template = this.templates.loadOrDefault(this.auth.user()?.id);
    this.watermarkEnabled.set(template.enabled);
    this.previewWatermarkFontFamily.set(template.previewWatermarkFontFamily);
    this.watermarkText.set(template.previewWatermarkSubtitle || 'SIRI EDUMARKET PREVIEW');
    this.watermarkPosition.set(template.config.previewWatermarkPosition ?? 'center-diagonal');
    this.watermarkOpacity.set(Math.round((template.config.previewWatermarkOpacity ?? 0.25) * 100));
    this.watermarkColor.set(template.config.previewWatermarkColor ?? '#E11D48');
    this.watermarkFontSize.set(template.config.previewWatermarkFontSize ?? 42);
    this.watermarkRotation.set(template.config.previewWatermarkRotation ?? -30);
    this.downloadWatermarkPosition.set(template.config.personalizedWatermarkPosition ?? 'footer');
    this.downloadWatermarkTemplate.set(template.config.personalizedWatermarkTemplate ?? '');
  }

  /**
   * watermark-editor-document-mode v1 §4: GET is called once on init in document mode and
   * mapped into the same signals the template already renders/edits. A failure here (404 or
   * anything else) is a real error per §1 — not a "not configured yet" state to fall back on —
   * so `loading` is deliberately left `true` (never flipped to `false` in the catch branch):
   * the form must never render against a document that doesn't exist / isn't the caller's.
   */
  private async loadDocumentConfig(id: string): Promise<void> {
    try {
      const result = await getApiSellerDocumentWatermarkConfig(id);
      const data = unwrapSdkResult(result);
      this.documentTitle.set(data.title ?? '');
      this.watermarkEnabled.set(data.watermarkEnabled);
      this.watermarkText.set(data.previewWatermarkSubtitle ?? '');
      this.previewWatermarkFontFamily.set(data.previewWatermarkFontFamily ?? 'Noto Sans Thai');
      this.watermarkPosition.set(data.previewWatermarkPosition ?? 'center-diagonal');
      this.watermarkOpacity.set(Math.round((data.previewWatermarkOpacity ?? 0.25) * 100));
      this.watermarkColor.set(data.previewWatermarkColor ?? '#E11D48');
      this.watermarkFontSize.set(data.previewWatermarkFontSize ?? 42);
      this.watermarkRotation.set(data.previewWatermarkRotation ?? -30);
      this.downloadWatermarkPosition.set(data.personalizedWatermarkPosition ?? 'footer');
      this.downloadWatermarkTemplate.set(data.personalizedWatermarkTemplate ?? '');
      this.loading.set(false);
    } catch {
      this.message.error('ไม่พบเอกสารนี้ หรือคุณไม่มีสิทธิ์แก้ไข');
      void this.router.navigate(['/seller/documents']);
    }
  }

  saveConfig(): void {
    const id = this.documentId();
    if (id) {
      void this.saveDocumentConfig(id);
    } else {
      this.saveTemplateConfig();
    }
  }

  private saveTemplateConfig(): void {
    this.saving.set(true);
    const saved = this.templates.save(this.auth.user()?.id, {
      enabled: this.watermarkEnabled(),
      previewWatermarkSubtitle: this.watermarkText().trim(),
      previewWatermarkFontFamily: this.previewWatermarkFontFamily(),
      config: {
        previewWatermarkPosition: this.watermarkPosition(),
        previewWatermarkOpacity: this.watermarkOpacity() / 100,
        previewWatermarkColor: this.watermarkColor(),
        previewWatermarkFontSize: this.watermarkFontSize(),
        previewWatermarkRotation: this.watermarkRotation(),
        personalizedWatermarkPosition: this.downloadWatermarkPosition(),
        personalizedWatermarkTemplate: this.downloadWatermarkTemplate().trim(),
      },
    });
    this.saving.set(false);
    if (saved) {
      this.message.success('บันทึกเทมเพลตลายน้ำเรียบร้อยแล้ว (จะถูกนำไปใช้กับเอกสารใหม่โดยอัตโนมัติ)');
    } else {
      this.message.error('บันทึกเทมเพลตลายน้ำไม่สำเร็จ');
    }
  }

  private async saveDocumentConfig(id: string): Promise<void> {
    this.saving.set(true);
    const body: SellerWatermarkConfigRequest = {
      watermarkEnabled: this.watermarkEnabled(),
      previewWatermarkSubtitle: this.watermarkText().trim(),
      previewWatermarkFontFamily: this.previewWatermarkFontFamily(),
      previewWatermarkPosition: this.watermarkPosition(),
      previewWatermarkOpacity: this.watermarkOpacity() / 100,
      previewWatermarkColor: this.watermarkColor(),
      previewWatermarkFontSize: this.watermarkFontSize(),
      previewWatermarkRotation: this.watermarkRotation(),
      personalizedWatermarkPosition: this.downloadWatermarkPosition(),
      personalizedWatermarkTemplate: this.downloadWatermarkTemplate().trim(),
    };
    try {
      const result = await postApiSellerDocumentWatermarkConfig(id, body);
      unwrapSdkResult(result);
      this.message.success('บันทึกลายน้ำของเอกสารนี้เรียบร้อยแล้ว');
    } catch {
      this.message.error('บันทึกลายน้ำของเอกสารนี้ไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      this.saving.set(false);
    }
  }
}

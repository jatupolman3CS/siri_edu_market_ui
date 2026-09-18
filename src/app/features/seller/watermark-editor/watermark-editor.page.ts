import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { SellerWatermarkTemplateService } from '../../../core/services/seller-watermark-template.service';
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

  // Active Tab: 'web-preview' | 'personalized'
  readonly activeTab = signal<'web-preview' | 'personalized'>('web-preview');

  readonly saving = signal(false);
  readonly watermarkEnabled = signal(true);
  readonly previewWatermarkSubtitle = signal('');
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
    const template = this.templates.loadOrDefault(this.auth.user()?.id);
    this.watermarkEnabled.set(template.enabled);
    this.previewWatermarkSubtitle.set(template.previewWatermarkSubtitle);
    this.previewWatermarkFontFamily.set(template.previewWatermarkFontFamily);
    this.watermarkText.set(template.config.watermarkText ?? 'SIRI EDUMARKET PREVIEW');
    this.watermarkPosition.set(template.config.watermarkPosition ?? 'center-diagonal');
    this.watermarkOpacity.set(Math.round((template.config.watermarkOpacity ?? 0.25) * 100));
    this.watermarkColor.set(template.config.watermarkColor ?? '#E11D48');
    this.watermarkFontSize.set(template.config.watermarkFontSize ?? 42);
    this.watermarkRotation.set(template.config.watermarkRotationDegrees ?? -30);
    this.downloadWatermarkPosition.set(template.config.downloadWatermarkPosition ?? 'footer');
    this.downloadWatermarkTemplate.set(template.config.downloadWatermarkTemplate ?? '');
  }

  saveConfig(): void {
    this.saving.set(true);
    const saved = this.templates.save(this.auth.user()?.id, {
      enabled: this.watermarkEnabled(),
      previewWatermarkSubtitle: this.previewWatermarkSubtitle().trim(),
      previewWatermarkFontFamily: this.previewWatermarkFontFamily(),
      config: {
        watermarkText: this.watermarkText().trim() || 'SIRI EDUMARKET PREVIEW',
        watermarkPosition: this.watermarkPosition(),
        watermarkOpacity: this.watermarkOpacity() / 100,
        watermarkColor: this.watermarkColor(),
        watermarkFontSize: this.watermarkFontSize(),
        watermarkRotationDegrees: this.watermarkRotation(),
        downloadWatermarkPosition: this.downloadWatermarkPosition(),
        downloadWatermarkTemplate: this.downloadWatermarkTemplate().trim(),
      },
    });
    this.saving.set(false);
    if (saved) {
      this.message.success('บันทึกเทมเพลตลายน้ำเรียบร้อยแล้ว (จะถูกนำไปใช้กับเอกสารใหม่โดยอัตโนมัติ)');
    } else {
      this.message.error('บันทึกเทมเพลตลายน้ำไม่สำเร็จ');
    }
  }
}

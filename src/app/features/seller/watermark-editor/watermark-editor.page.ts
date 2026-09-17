import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerService } from '../../../core/services';
import { resolveApiUrl } from '../../../core/api-runtime';
import {
  getApiSellerDocumentWatermarkConfig,
  postApiSellerDocumentWatermarkConfig,
  SellerWatermarkConfigResponse,
} from '../../../core/api/seller-watermark.api';
import { DocumentItem } from '../../../core/models';
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
export class WatermarkEditorPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);

  // Active Tab: 'web-preview' | 'personalized'
  readonly activeTab = signal<'web-preview' | 'personalized'>('web-preview');

  // Preview Mode: 'simulator' | 'server-previews'
  readonly previewMode = signal<'simulator' | 'server-previews'>('simulator');

  // Loading States
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly documentsLoading = signal(false);

  // Document selection
  readonly documentId = signal<string>('');
  readonly documentTitle = signal<string>('');
  readonly sellerDocuments = signal<DocumentItem[]>([]);

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

  // Server-rendered previews
  readonly previewRasterUrls = signal<string[]>([]);
  readonly previewPageCount = signal<number>(0);
  readonly previewTimestamp = signal<number>(Date.now());
  readonly selectedPreviewPageIndex = signal<number>(0);

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

  ngOnInit(): void {
    const idFromParam = this.route.snapshot.paramMap.get('id');
    if (idFromParam) {
      this.documentId.set(idFromParam);
      void this.loadWatermarkConfig(idFromParam);
    } else {
      void this.loadSellerDocuments();
    }
  }

  async loadSellerDocuments(): Promise<void> {
    this.documentsLoading.set(true);
    try {
      const res = await this.seller.listDocumentsPaged({ page: 1, pageSize: 50 });
      const items = res.items ?? [];
      this.sellerDocuments.set(items);
      if (items.length > 0 && !this.documentId()) {
        const first = items[0];
        this.documentId.set(first.id);
        this.documentTitle.set(first.title);
        void this.loadWatermarkConfig(first.id);
      }
    } catch {
      this.message.error('ไม่สามารถโหลดรายการเอกสารได้');
    } finally {
      this.documentsLoading.set(false);
    }
  }

  onDocumentSelectChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const selectedId = target.value;
    if (selectedId && selectedId !== this.documentId()) {
      this.documentId.set(selectedId);
      const found = this.sellerDocuments().find((d) => d.id === selectedId);
      if (found) this.documentTitle.set(found.title);
      void this.loadWatermarkConfig(selectedId);
    }
  }

  async loadWatermarkConfig(docId: string): Promise<void> {
    this.loading.set(true);
    try {
      const res = await getApiSellerDocumentWatermarkConfig(docId);
      if (res.data) {
        const data = res.data;
        this.documentTitle.set(data.title || 'เอกสาร');
        this.watermarkText.set(data.watermarkText || 'SIRI EDUMARKET PREVIEW');
        this.watermarkPosition.set(data.watermarkPosition || 'center-diagonal');
        this.watermarkOpacity.set(Math.round((data.watermarkOpacity ?? 0.25) * 100));
        this.watermarkColor.set(data.watermarkColor || '#E11D48');
        this.watermarkFontSize.set(data.watermarkFontSize || 42);
        this.watermarkRotation.set(data.watermarkRotationDegrees ?? -30);
        this.downloadWatermarkPosition.set(data.downloadWatermarkPosition || 'footer');
        if (data.downloadWatermarkTemplate) {
          this.downloadWatermarkTemplate.set(data.downloadWatermarkTemplate);
        }
        this.previewRasterUrls.set(data.previewRasterUrls || []);
        this.previewPageCount.set(data.previewPageCount || (data.previewRasterUrls?.length ?? 0));
        this.previewTimestamp.set(Date.now());
      }
    } catch {
      this.message.error('โหลดการตั้งค่าลายน้ำไม่สำเร็จ');
    } finally {
      this.loading.set(false);
    }
  }

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

  resolvePreviewImageUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return `${path}?t=${this.previewTimestamp()}`;
    }
    return `${resolveApiUrl(path)}?t=${this.previewTimestamp()}`;
  }

  async saveConfig(): Promise<void> {
    const docId = this.documentId();
    if (!docId) {
      this.message.warning('กรุณาเลือกเอกสาร');
      return;
    }

    this.saving.set(true);
    try {
      const res = await postApiSellerDocumentWatermarkConfig(docId, {
        watermarkText: this.watermarkText().trim() || 'SIRI EDUMARKET PREVIEW',
        watermarkPosition: this.watermarkPosition(),
        watermarkOpacity: (this.watermarkOpacity() || 25) / 100,
        watermarkColor: this.watermarkColor() || '#E11D48',
        watermarkFontSize: this.watermarkFontSize() || 42,
        watermarkRotationDegrees: this.watermarkRotation() || 0,
        downloadWatermarkPosition: this.downloadWatermarkPosition(),
        downloadWatermarkTemplate: this.downloadWatermarkTemplate().trim(),
      });

      if (res.data) {
        this.previewRasterUrls.set(res.data.previewRasterUrls || []);
        this.previewPageCount.set(res.data.previewPageCount || (res.data.previewRasterUrls?.length ?? 0));
        this.previewTimestamp.set(Date.now());
        this.message.success('บันทึกการตั้งค่าลายน้ำและเรนเดอร์ภาพพรีวิว .NET สำเร็จเรียบร้อย');
        if (this.previewRasterUrls().length > 0) {
          this.previewMode.set('server-previews');
        }
      } else {
        this.message.success('บันทึกการตั้งค่าลายน้ำสำเร็จ');
      }
    } catch {
      this.message.error('เกิดข้อผิดพลาดในการบันทึกการตั้งค่าลายน้ำ');
    } finally {
      this.saving.set(false);
    }
  }
}

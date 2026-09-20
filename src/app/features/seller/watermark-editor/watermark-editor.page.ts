import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService } from '../../../core/services';
import { SellerWatermarkTemplateService } from '../../../core/services/seller-watermark-template.service';
import { SellerWatermarkService } from '../../../core/services/seller-watermark.service';
import type { SellerWatermarkConfigRequest } from '../../../core/api';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

export interface PositionOption {
  value: string;
  label: string;
  gridRow: number;
  gridCol: number;
}

@Component({
  selector: 'app-watermark-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IconComponent, ImgFallbackDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './watermark-editor.page.html',
  styleUrl: './watermark-editor.page.scss',
})
export class WatermarkEditorPage {
  private readonly auth = inject(AuthService);
  private readonly templates = inject(SellerWatermarkTemplateService);
  private readonly watermarkService = inject(SellerWatermarkService);
  private readonly message = inject(NzMessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly translation = inject(TranslationService);

  // Active Tab: 'web-preview' | 'personalized'
  readonly activeTab = signal<'web-preview' | 'personalized'>('web-preview');

  // watermark-editor-document-mode v1 §4: null = template mode (`/seller/watermark`),
  // a document id = document mode (`/seller/documents/:id/watermark`) — read once at init.
  readonly documentId = signal<string | null>(null);
  // Only meaningful in document mode — stays true forever if the GET fails so the form is
  // never rendered against a document that doesn't exist / isn't the caller's (AC-03).
  readonly loading = signal(false);
  readonly documentTitle = signal('');

  // watermark-editor real-preview fix: real, server-rendered watermarked JPEG pages for the
  // current document (already generated/watermarked server-side by the existing
  // `GET .../watermark-config` endpoint) — only ever populated in document mode.
  readonly previewImageUrls = signal<string[]>([]);
  readonly hasMainFile = signal(false);
  readonly showPreviewGallery = signal(false);

  /** True only when there is an actual document AND a main file AND at least one generated page. */
  readonly hasRealPreview = computed(
    () => !!this.documentId() && this.hasMainFile() && this.previewImageUrls().length > 0,
  );
  /** Document mode but nothing to show yet (no main file uploaded, or not generated/saved yet). */
  readonly showRealPreviewEmptyNotice = computed(
    () => !!this.documentId() && !this.hasRealPreview(),
  );

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
  readonly downloadWatermarkTemplate = signal<string>(this.translation.t('seller.defaultPersonalizedText'));

  // watermark-completion v5 §3.12.2/§4.9: 5 new style fields making "personalized" a first-class
  // peer of "web-preview" (font/color/opacity/rotation/fontSize) — defaults below mirror the
  // backend's own null-fallback values (§3.12.1) so an untouched config renders identically to
  // what the backend will actually stamp on the downloaded file.
  readonly downloadWatermarkFontFamily = signal<string>('Noto Sans Thai');
  readonly downloadWatermarkColor = signal<string>('#b41e1e'); // backend fallback (§3.12.1)
  readonly downloadWatermarkOpacity = signal<number>(35); // percentage 10-90; backend fallback 0.35
  readonly downloadWatermarkFontSize = signal<number>(16);
  readonly downloadWatermarkRotation = signal<number>(-30); // only visually active on position 'diagonal'

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
  readonly gridPositions = [
    { value: 'top-left', labelKey: 'seller.posTopLeft', gridRow: 1, gridCol: 1 },
    { value: 'top-center', labelKey: 'seller.posTopCenter', gridRow: 1, gridCol: 2 },
    { value: 'top-right', labelKey: 'seller.posTopRight', gridRow: 1, gridCol: 3 },
    { value: 'middle-left', labelKey: 'seller.posMiddleLeft', gridRow: 2, gridCol: 1 },
    { value: 'center', labelKey: 'seller.posCenter', gridRow: 2, gridCol: 2 },
    { value: 'middle-right', labelKey: 'seller.posMiddleRight', gridRow: 2, gridCol: 3 },
    { value: 'bottom-left', labelKey: 'seller.posBottomLeft', gridRow: 3, gridCol: 1 },
    { value: 'bottom-center', labelKey: 'seller.posBottomCenter', gridRow: 3, gridCol: 2 },
    { value: 'bottom-right', labelKey: 'seller.posBottomRight', gridRow: 3, gridCol: 3 },
  ];

  // Download position options
  readonly downloadPositions = [
    { value: 'footer', labelKey: 'seller.posFooter', descKey: 'seller.posFooterDesc' },
    { value: 'header', labelKey: 'seller.posHeader', descKey: 'seller.posHeaderDesc' },
    { value: 'diagonal', labelKey: 'seller.posDiagonal', descKey: 'seller.posDiagonalDesc' },
    { value: 'both', labelKey: 'seller.posBoth', descKey: 'seller.posBothDesc' },
  ];

  // Computed personalized stamped sample text
  readonly simulatedDownloadText = computed(() => {
    const tpl = this.downloadWatermarkTemplate();
    const email = this.simBuyerEmail() || 'buyer@example.com';
    const token = this.simToken() || 'SEC-000000';
    const now = new Date();
    const locale = this.translation.currentLang() === 'th' ? 'th-TH' : 'en-US';
    const dateStr = `${now.toLocaleDateString(locale)} ${now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
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

  setDownloadColor(hex: string): void {
    this.downloadWatermarkColor.set(hex);
  }

  insertTag(tag: string): void {
    const current = this.downloadWatermarkTemplate();
    this.downloadWatermarkTemplate.set(`${current} ${tag}`);
  }

  previewImgSrc(pathOrUrl: string): string {
    return resolvePublicUrl(pathOrUrl);
  }

  openRealPreview(): void {
    if (!this.hasRealPreview()) return;
    this.showPreviewGallery.set(true);
  }

  closePreviewGallery(): void {
    this.showPreviewGallery.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseGallery(): void {
    if (this.showPreviewGallery()) this.closePreviewGallery();
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

    effect((onCleanup) => {
      if (typeof document === 'undefined') return;
      if (!this.showPreviewGallery()) return;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = '';
      });
    });
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
    this.downloadWatermarkFontFamily.set(
      template.config.personalizedWatermarkFontFamily ?? 'Noto Sans Thai',
    );
    this.downloadWatermarkColor.set(template.config.personalizedWatermarkColor ?? '#b41e1e');
    this.downloadWatermarkOpacity.set(
      Math.round((template.config.personalizedWatermarkOpacity ?? 0.35) * 100),
    );
    this.downloadWatermarkFontSize.set(template.config.personalizedWatermarkFontSize ?? 16);
    this.downloadWatermarkRotation.set(template.config.personalizedWatermarkRotation ?? -30);
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
      const data = await this.watermarkService.getConfig(id);
      this.documentTitle.set(data.title ?? '');
      this.watermarkEnabled.set(data.watermarkEnabled ?? true);
      this.watermarkText.set(data.previewWatermarkSubtitle ?? '');
      this.previewWatermarkFontFamily.set(data.previewWatermarkFontFamily ?? 'Noto Sans Thai');
      this.watermarkPosition.set(data.previewWatermarkPosition ?? 'center-diagonal');
      this.watermarkOpacity.set(Math.round((data.previewWatermarkOpacity ?? 0.25) * 100));
      this.watermarkColor.set(data.previewWatermarkColor ?? '#E11D48');
      this.watermarkFontSize.set(data.previewWatermarkFontSize ?? 42);
      this.watermarkRotation.set(data.previewWatermarkRotation ?? -30);
      this.downloadWatermarkPosition.set(data.personalizedWatermarkPosition ?? 'footer');
      this.downloadWatermarkTemplate.set(data.personalizedWatermarkTemplate ?? '');
      this.downloadWatermarkFontFamily.set(data.personalizedWatermarkFontFamily ?? 'Noto Sans Thai');
      this.downloadWatermarkColor.set(data.personalizedWatermarkColor ?? '#b41e1e');
      this.downloadWatermarkOpacity.set(
        Math.round((data.personalizedWatermarkOpacity ?? 0.35) * 100),
      );
      this.downloadWatermarkFontSize.set(data.personalizedWatermarkFontSize ?? 16);
      this.downloadWatermarkRotation.set(data.personalizedWatermarkRotation ?? -30);
      this.hasMainFile.set(data.hasMainFile ?? false);
      this.previewImageUrls.set(
        (data.previewImageUrls ?? []).filter(
          (u): u is string => typeof u === 'string' && u.trim().length > 0,
        ),
      );
      this.loading.set(false);
    } catch {
      this.message.error(this.translation.t('seller.docNotFoundOrNoPermission'));
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
        previewWatermarkSubtitle: this.watermarkText().trim(),
        previewWatermarkPosition: this.watermarkPosition(),
        previewWatermarkOpacity: this.watermarkOpacity() / 100,
        previewWatermarkColor: this.watermarkColor(),
        previewWatermarkFontSize: this.watermarkFontSize(),
        previewWatermarkRotation: this.watermarkRotation(),
        personalizedWatermarkPosition: this.downloadWatermarkPosition(),
        personalizedWatermarkTemplate: this.downloadWatermarkTemplate().trim(),
        personalizedWatermarkFontFamily: this.downloadWatermarkFontFamily(),
        personalizedWatermarkColor: this.downloadWatermarkColor(),
        personalizedWatermarkOpacity: this.downloadWatermarkOpacity() / 100,
        personalizedWatermarkRotation: this.downloadWatermarkRotation(),
        personalizedWatermarkFontSize: this.downloadWatermarkFontSize(),
      },
    });
    this.saving.set(false);
    if (saved) {
      this.message.success(this.translation.t('seller.saveTemplateSuccess'));
    } else {
      this.message.error(this.translation.t('seller.saveTemplateFailed'));
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
      personalizedWatermarkFontFamily: this.downloadWatermarkFontFamily(),
      personalizedWatermarkColor: this.downloadWatermarkColor(),
      personalizedWatermarkOpacity: this.downloadWatermarkOpacity() / 100,
      personalizedWatermarkRotation: this.downloadWatermarkRotation(),
      personalizedWatermarkFontSize: this.downloadWatermarkFontSize(),
    };
    try {
      const saved = await this.watermarkService.saveConfig(id, body);
      // The endpoint regenerates the watermarked JPEG pages server-side on every save — refresh
      // the real-preview gallery from the same response so it never shows a stale image set.
      this.hasMainFile.set(saved.hasMainFile ?? false);
      this.previewImageUrls.set(
        (saved.previewImageUrls ?? []).filter(
          (u): u is string => typeof u === 'string' && u.trim().length > 0,
        ),
      );
      this.message.success(this.translation.t('seller.saveDocWatermarkSuccess'));
    } catch {
      this.message.error(this.translation.t('seller.saveDocWatermarkFailed'));
    } finally {
      this.saving.set(false);
    }
  }
}

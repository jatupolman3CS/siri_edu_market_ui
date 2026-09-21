import { DatePipe, SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import {
  CdkDrag,
  CdkDropList,
  type CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { downloadUrlForStorageKey, resolvePublicUrl, resolveDownloadUrl } from '../../../core/api-runtime';
import { DocumentItem, DocumentPricingHint, SellerDocumentVersionInfo, WatermarkCapability } from '../../../core/models';
import { mapSellerDocument } from '../../../core/api-mappers/mappers';
import { AuthService, CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import { SellerWatermarkTemplateService } from '../../../core/services/seller-watermark-template.service';
import { SellerWatermarkService } from '../../../core/services/seller-watermark.service';
import {
  putApiSellerDocumentsById,
  type UpdateSellerDocumentRequest,
} from '../../../core/api/seller-document-update';
import type {
  DocumentGalleryItemRequest,
  SellerWatermarkConfigRequest,
} from '../../../core/api/types.gen';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { FileNamePipe } from '../../../shared/pipes/file-name.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

const MAX_GALLERY_IMAGES = 10;

const PREVIEW_WATERMARK_FONT_OPTIONS = [
  'Noto Sans Thai',
  'Sarabun',
  'Kanit',
  'Prompt',
  'Arial',
] as const;

// image-upload-optimization v1 §4: previewUrl is what <img> renders (optimizedUrl when the
// backend produced one, publicUrl otherwise) — key/publicUrl stay the untouched original.
// storage-key-persistence v1 §4.2: `key` is now always populated (fresh upload or reconstructed
// from `imageStorageKey`) — it is what the submit payload (`galleryItems[].imageStorageKey`)
// must always send back.
type GalleryItem = { id?: string | null; key: string; publicUrl: string; previewUrl: string };

type MainFileRow = NonNullable<DocumentItem['mainFiles']>[number];

/**
 * document-watermark-scope-options v1 §3.6/§4.3: the options bag handed to
 * `SellerService.setListedMainFile`. `previewWatermarkEnabled`/`watermarkEnabled` are optional on
 * purpose — when the seller does not override them the keys must be **absent from the object
 * entirely** (never `null`), which is what tells the backend to keep inheriting the document's
 * current settings (AC-23).
 */
type SetListedMainFileOptions = {
  isNewVersion: boolean;
  changeNote?: string;
  previewWatermarkEnabled?: boolean;
  watermarkEnabled?: boolean;
};

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

@Component({
  selector: 'app-seller-upload',
  standalone: true,
  imports: [
    FormsModule,
    IconComponent,
    ThbPipe,
    FileNamePipe,
    CdkDropList,
    CdkDrag,
    SlicePipe,
    DatePipe,
    ImgFallbackDirective,
    NzModalModule,
    RouterLink,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upload.page.html',
  styleUrl: './upload.page.scss',
})
export class SellerUploadPage {
  readonly maxGalleryImages = MAX_GALLERY_IMAGES;

  readonly catalog = inject(CatalogService);
  readonly platformStats = inject(PlatformStatsService);
  readonly translation = inject(TranslationService);
  private readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly watermarkTemplates = inject(SellerWatermarkTemplateService);
  private readonly watermarkService = inject(SellerWatermarkService);

  readonly watermarkTemplate = computed(() =>
    this.watermarkTemplates.loadOrDefault(this.auth.user()?.id),
  );

  readonly editId = signal<string>('');
  readonly isEditMode = computed(() => !!this.editId());

  readonly steps = computed(() => [
    { no: 1, label: this.translation.t('seller.uploadStep1') },
    { no: 2, label: this.translation.t('seller.uploadStep2') },
    { no: 3, label: this.translation.t('seller.uploadStep3') },
    { no: 4, label: this.translation.t('seller.uploadStep4') },
  ]);

  readonly formats = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'ZIP'];

  readonly step = signal<number>(1);
  readonly file = signal<File | null>(null);
  readonly upload = signal<{ key: string; publicUrl: string } | null>(null);
  readonly uploading = signal<boolean>(false);

  readonly mainFiles = signal<MainFileRow[]>([]);
  readonly mainFilesLoading = signal(false);
  readonly listedSaving = signal(false);

  // document-versioning v1 §4.1: editDocument + versioning modals state
  readonly editDocument = signal<DocumentItem | null>(null);
  readonly versionModalVisible = signal(false);
  readonly pendingListedFileId = signal<string>('');
  readonly isNewVersionOption = signal(false);
  readonly changeNoteInput = signal('');
  readonly historyModalVisible = signal(false);
  readonly historyVersions = signal<SellerDocumentVersionInfo[]>([]);
  readonly historyLoading = signal(false);

  readonly galleryItems = signal<GalleryItem[]>([]);
  readonly galleryUploading = signal<boolean>(false);
  /**
   * cover-image-mode v1 §1/§4 (AC-01): `'custom'` = seller uploads the cover (today's
   * behavior, always the default) — `'auto'` = system renders a watermarked cover from the
   * document's first page instead.
   */
  readonly coverImageMode = signal<'custom' | 'auto'>('custom');
  readonly watermark = signal<boolean>(true);
  /**
   * watermark-completion v1 §3.4/§4.3: watermark state as the backend resolved it for this
   * listing (policy + file capability + the seller toggle). Only a saved document has it — a
   * brand-new upload has no format-specific answer yet, so the fields stay at their neutral
   * defaults until the create call comes back.
   */
  readonly watermarkCapability = signal<WatermarkCapability>('none');
  readonly watermarkEffective = signal<boolean>(false);
  /** `true` = the platform policy decides; the checkbox must be disabled and stay ticked. */
  readonly watermarkPolicyLocked = signal<boolean>(false);
  /** Thai warning straight from the backend — never composed or re-worded here (§4.3). */
  readonly watermarkWarning = signal<string | null>(null);
  /**
   * document-watermark-scope-options v1 §4.1 — Option A: the watermark stamped on the *public
   * preview* (preview pages, cover, gallery images). Fully independent from `watermark()` above,
   * which is Option B (the buyer's downloaded file): all four on/off combinations are valid.
   * Create mode always starts at `true` (today's behavior — previews are always stamped).
   */
  readonly previewWatermark = signal<boolean>(true);
  /** `true` = the platform policy decides for Option A; switch A is disabled and stays ticked. */
  readonly previewWatermarkPolicyLocked = signal<boolean>(false);
  /**
   * document-watermark-scope-options v1 §4.3: version modal state. The document's watermark
   * settings are inherited automatically by a new version — these three only exist so the seller
   * can *see* what will be inherited and opt into changing it for this upload.
   */
  readonly versionWatermarkOverride = signal<boolean>(false);
  readonly versionPreviewWatermark = signal<boolean>(true);
  readonly versionDownloadWatermark = signal<boolean>(true);
  readonly previewPages = signal<number>(5);
  readonly previewWatermarkSubtitle = signal('');
  readonly previewWatermarkFontFamily = signal('Noto Sans Thai');

  readonly previewWatermarkFontOptions = PREVIEW_WATERMARK_FONT_OPTIONS;
  /** Document page count (seller-entered; PDF parsing not required). */
  readonly pages = signal<number>(0);
  /** Human-readable main file size e.g. "2.1 MB". */
  readonly fileSizeLabel = signal<string>('');

  readonly title = signal<string>('');
  readonly shortDescription = signal<string>('');
  readonly longDescription = signal<string>('');
  /** Many-to-many: a document can live in multiple categories. */
  readonly categoryIds = signal<string[]>([]);
  /** Open/close state for the categories dropdown checklist. */
  readonly categoryDropdownOpen = signal<boolean>(false);
  readonly language = signal<'th' | 'en'>('th');
  readonly tags = signal<string[]>([]);
  readonly newTag = signal<string>('');
  readonly aiAutofillLoading = signal<boolean>(false);

  readonly price = signal<number>(199);
  readonly originalPrice = signal<number>(0);
  /**
   * discount-urgency v1 §4: date-only `yyyy-MM-dd` string from `<input type="date">`, `''` = not
   * set — same pattern as `formStartAt`/`formEndAt` in `announcements-admin.page.ts`.
   */
  readonly discountExpiresAt = signal<string>('');
  /** When true, document is free (price = 0, no platform fee). */
  readonly isFree = signal<boolean>(false);

  /**
   * Validation error when original price is set (>0) but not strictly greater than current price.
   */
  readonly originalPriceError = computed<string | null>(() => {
    if (this.isFree()) return null;
    const p = this.price();
    const op = this.originalPrice();
    if (op > 0 && op <= p) {
      return this.translation.t('seller.invalidOriginalPrice', { price: p });
    }
    return null;
  });

  /**
   * seller-pricing-and-storefront-stats v1 §3.1/§4: competitor price range for step 3
   * ("ตั้งราคา") — `null` while loading, not-yet-fetched, or on a failed request (AC-8/AC-10
   * both render nothing; the template additionally hides the box when `sampleSize < 3`, AC-8).
   */
  readonly pricingHint = signal<DocumentPricingHint | null>(null);
  readonly pricingHintLoading = signal<boolean>(false);

  /** Resolved category objects for the chip rendering in the upload form. */
  readonly selectedCategories = computed(() =>
    this.categoryIds()
      .map((id) => this.catalog.getCategoryById(id))
      .filter((c): c is NonNullable<typeof c> => !!c),
  );

  /** "🎒 การศึกษา, 📊 ธุรกิจ" — used in the review step. */
  readonly categoryLabel = computed(() => {
    const cats = this.selectedCategories();
    if (cats.length === 0) return '—';
    return cats.map((c) => `${c.icon} ${c.name}`).join(', ');
  });

  /** Effective price respecting the free flag. */
  readonly effectivePrice = computed(() => (this.isFree() ? 0 : this.price()));
  /**
   * real-data-stats v1 §4.6: fallback `10` only while `platformStats.stats()` hasn't loaded yet
   * (avoids a flash to a 0% fee) — once it resolves, this computed signal picks up the real
   * value immediately.
   */
  readonly feeRatePercent = computed(() => this.platformStats.stats()?.feeRatePercent ?? 10);
  readonly fee = computed(() =>
    this.isFree() ? 0 : Math.round(this.effectivePrice() * (this.feeRatePercent() / 100)),
  );
  readonly earnings = computed(() => this.effectivePrice() - this.fee());

  constructor() {
    this.catalog.loadCategories();
    this.platformStats.loadStats();

    const tpl = this.watermarkTemplates.loadOrDefault(this.auth.user()?.id);
    this.watermark.set(tpl.enabled);
    this.previewWatermarkSubtitle.set(tpl.previewWatermarkSubtitle);
    this.previewWatermarkFontFamily.set(tpl.previewWatermarkFontFamily);

    this.route.queryParamMap.subscribe((q) => {
      const id = q.get('id') ?? '';
      this.editId.set(id);
      if (!id) return;

      void (async () => {
        let doc: DocumentItem | null = await this.seller.fetchDocumentForEdit(id);
        if (!doc) {
          if (!this.seller.myDocuments().length) {
            await this.seller.refreshDocuments();
          }
          doc = this.seller.myDocuments().find((d) => d.id === id) ?? null;
        }
        if (!doc) {
          this.message.error(this.translation.t('seller.docLoadFailed'));
          return;
        }
        this.applyEditDocument(doc);
      })();
    });
  }

  /**
   * watermark-completion v1 §4.3: mirrors the backend's answer into the form. When the policy
   * locks the choice the checkbox is forced on as well, so what the seller sees matches what the
   * buyer will actually get (the server would override a `false` anyway — AC-08).
   */
  private applyWatermarkPolicy(doc: {
    watermarkCapability?: WatermarkCapability;
    watermarkEffective?: boolean;
    watermarkPolicyLocked?: boolean;
    watermarkWarning?: string | null;
    previewWatermarkPolicyLocked?: boolean;
  }): void {
    this.watermarkCapability.set(doc.watermarkCapability ?? 'none');
    this.watermarkEffective.set(doc.watermarkEffective ?? false);
    this.watermarkPolicyLocked.set(doc.watermarkPolicyLocked ?? false);
    this.watermarkWarning.set((doc.watermarkWarning ?? '').trim() || null);
    if (doc.watermarkPolicyLocked) {
      this.watermark.set(true);
    }
    // document-watermark-scope-options v1 §4.1/AC-22: Option A has its own lock, decided by the
    // platform policy alone (no file capability involved — §3.1). Same shape as Option B above:
    // locked means the server forces `true`, so the form must not pretend otherwise.
    this.previewWatermarkPolicyLocked.set(doc.previewWatermarkPolicyLocked ?? false);
    if (doc.previewWatermarkPolicyLocked) {
      this.previewWatermark.set(true);
    }
  }

  private applyEditDocument(doc: DocumentItem): void {
    this.editDocument.set(doc);
    this.title.set(doc.title);
    this.shortDescription.set(doc.shortDescription);
    this.longDescription.set(doc.description || doc.shortDescription);
    this.categoryIds.set([...(doc.categoryIds ?? [])]);
    this.isFree.set(doc.isFree === true || doc.price === 0);
    this.language.set(doc.language);
    this.price.set(doc.price);
    this.originalPrice.set(doc.originalPrice ?? 0);
    this.discountExpiresAt.set(doc.discountExpiresAt ? doc.discountExpiresAt.slice(0, 10) : '');
    this.watermark.set(doc.watermarkEnabled ?? true);
    // document-watermark-scope-options v1 §4.1/AC-21: edit mode shows what this listing was
    // actually saved with, never a stale create-mode default.
    this.previewWatermark.set(doc.previewWatermarkEnabled ?? true);
    this.applyWatermarkPolicy(doc);
    this.previewPages.set(doc.previewPages ?? 5);
    this.previewWatermarkSubtitle.set((doc.previewWatermarkSubtitle ?? '').trim());
    this.previewWatermarkFontFamily.set(
      doc.previewWatermarkFontFamily?.trim() || PREVIEW_WATERMARK_FONT_OPTIONS[0],
    );
    this.pages.set(doc.pages ?? 0);
    this.fileSizeLabel.set(doc.fileSize ?? '');
    // cover-image-mode v1 §4 (AC-07): restore the mode the document was actually saved with —
    // absent/unrecognized value defaults to 'custom' (today's behavior).
    this.coverImageMode.set(doc.coverImageMode ?? 'custom');
    if (doc.gallerySlots?.length) {
      this.galleryItems.set(
        doc.gallerySlots.map((g) => {
          const publicUrl = resolvePublicUrl(g.imageUrl.replaceAll('%2F', '/'));
          // storage-key-persistence v1 §4.2: key must round-trip from imageStorageKey, not stay
          // '' — resubmitting '' would drop the item's key on an unrelated edit.
          return { id: g.id, key: g.imageStorageKey, publicUrl, previewUrl: publicUrl };
        }),
      );
    } else if (doc.gallery?.length) {
      this.galleryItems.set(
        doc.gallery.map((rawUrl) => {
          const publicUrl = resolvePublicUrl(rawUrl);
          return { key: SellerUploadPage.extractKeyFromDownloadUrl(publicUrl), publicUrl, previewUrl: publicUrl };
        }),
      );
    } else if (doc.cover) {
      const publicUrl = resolvePublicUrl(doc.cover);
      this.galleryItems.set([{
        key: SellerUploadPage.extractKeyFromDownloadUrl(publicUrl),
        publicUrl,
        previewUrl: publicUrl,
      }]);
    }
    this.step.set(1);
    this.mainFiles.set(doc.mainFiles ?? []);
    if (doc.id && !this.mainFiles().length) {
      void this.refreshMainFiles(doc.id);
    }
  }

  private async refreshMainFiles(documentId: string): Promise<void> {
    this.mainFilesLoading.set(true);
    try {
      const rows = await this.seller.fetchDocumentMainFiles(documentId);
      this.mainFiles.set(rows);
    } finally {
      this.mainFilesLoading.set(false);
    }
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const f = input.files[0];
    this.file.set(f);
    this.upload.set(null);
    this.fileSizeLabel.set(SellerUploadPage.formatFileSize(f.size));

    if (f.name.toLowerCase().endsWith('.pdf')) {
      void SellerUploadPage.readPdfPageCount(f).then((count) => {
        if (count && count > 0 && this.pages() === 0) {
          this.pages.set(count);
        }
      });
    }

    void (async () => {
      this.uploading.set(true);
      try {
        const data = await this.seller.uploadFile(f);
        this.upload.set({ key: data.key, publicUrl: data.publicUrl });
        if (this.isEditMode() && this.editId()) {
          const ok = await this.seller.addDocumentMainFile(this.editId(), {
            storageKey: data.key,
            originalFileName: f.name,
          });
          await this.refreshMainFiles(this.editId());
          if (!ok) return;
        }
        this.message.success(this.translation.t('seller.serverUploadSuccess'));
      } catch {
        // SellerService already toasted
      } finally {
        this.uploading.set(false);
      }
    })();
  }

  /** Extracts a bare storage key from a backend download URL. Returns '' if not recognised. */
  private static extractKeyFromDownloadUrl(url: string): string {
    const marker = '/api/files/download/';
    const idx = url.indexOf(marker);
    if (idx < 0) return '';
    const encoded = url.slice(idx + marker.length).split('?')[0];
    return encoded.split('/').map((p) => { try { return decodeURIComponent(p); } catch { return p; } }).join('/');
  }

  private static async readPdfPageCount(file: File): Promise<number | null> {
    try {
      const buf = await file.arrayBuffer();
      const text = new TextDecoder('latin1').decode(new Uint8Array(buf));
      const matches = [...text.matchAll(/\/Count\s+(\d+)/g)];
      if (!matches.length) return null;
      return Math.max(...matches.map((m) => parseInt(m[1], 10)));
    } catch {
      return null;
    }
  }

  selectListedMainFile(fileId: string): void {
    if (!this.isEditMode() || !this.editId()) return;
    if (this.mainFiles().find((m) => m.id === fileId)?.isListedForSale) return;

    const doc = this.editDocument();
    const requiresPrompt = doc?.status === 'approved' && (doc?.salesCount ?? 0) > 0;

    if (requiresPrompt) {
      this.pendingListedFileId.set(fileId);
      this.isNewVersionOption.set(false);
      this.changeNoteInput.set('');
      // document-watermark-scope-options v1 §4.3: the modal always opens showing the settings
      // this new version would inherit, with the override checkbox cleared.
      this.versionWatermarkOverride.set(false);
      this.versionPreviewWatermark.set(this.previewWatermark());
      this.versionDownloadWatermark.set(this.watermark());
      this.versionModalVisible.set(true);
      return;
    }

    void this.executeSetListedMainFile(fileId, { isNewVersion: false });
  }

  cancelVersionModal(): void {
    this.versionModalVisible.set(false);
    this.pendingListedFileId.set('');
    this.changeNoteInput.set('');
  }

  confirmVersionModal(): void {
    const fileId = this.pendingListedFileId();
    if (!fileId) {
      this.versionModalVisible.set(false);
      return;
    }
    const isNewVersion = this.isNewVersionOption();
    const changeNote = isNewVersion ? this.changeNoteInput().trim() : undefined;
    const options: SetListedMainFileOptions = { isNewVersion, changeNote };
    // document-watermark-scope-options v1 §4.3/AC-23: without the override checkbox the two
    // watermark keys never enter the object at all — the document's own settings are inherited
    // server-side. AC-24: with it, only the switches the seller actually moved are sent.
    if (this.versionWatermarkOverride()) {
      if (this.versionPreviewWatermark() !== this.previewWatermark()) {
        options.previewWatermarkEnabled = this.versionPreviewWatermark();
      }
      if (this.versionDownloadWatermark() !== this.watermark()) {
        options.watermarkEnabled = this.versionDownloadWatermark();
      }
    }
    this.versionModalVisible.set(false);
    void this.executeSetListedMainFile(fileId, options);
  }

  async executeSetListedMainFile(
    fileId: string,
    options: SetListedMainFileOptions,
  ): Promise<void> {
    this.listedSaving.set(true);
    try {
      const raw = await this.seller.setListedMainFile(this.editId(), fileId, options);
      if (raw) {
        const mapped = mapSellerDocument(raw);
        this.mainFiles.set(mapped.mainFiles ?? []);

        // document-versioning v1 §3.1/§4.1: toast messages
        const notifiedCount = raw.lastVersionNotifiedBuyerCount;

        if (notifiedCount != null) {
          this.message.success(this.translation.t('seller.newVersionNotified', { count: notifiedCount }));
        }

        if (mapped.status === 'pending') {
          this.message.info(this.translation.t('seller.sellingFileChanged'));
        } else if (notifiedCount == null) {
          this.message.success(this.translation.t('seller.sellingFileSet'));
        }
      }
    } finally {
      this.listedSaving.set(false);
    }
  }

  async openHistoryModal(): Promise<void> {
    const docId = this.editId();
    if (!docId) return;
    this.historyModalVisible.set(true);
    this.historyLoading.set(true);
    try {
      const versions = await this.seller.getDocumentVersions(docId);
      this.historyVersions.set(versions);
    } finally {
      this.historyLoading.set(false);
    }
  }

  closeHistoryModal(): void {
    this.historyModalVisible.set(false);
  }

  downloadMainFile(fileId: string): void {
    const docId = this.editId();
    if (!docId) return;
    const win = window.open('', '_blank');
    void (async () => {
      try {
        const rawUrl = await this.seller.getMainFileDownloadUrl(docId, fileId);
        const url = resolveDownloadUrl(rawUrl, this.auth.accessToken());
        if (url && win) {
          win.location.href = url;
        } else {
          win?.close();
        }
      } catch {
        win?.close();
      }
    })();
  }

  onGalleryFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files?.length ? Array.from(input.files) : [];
    input.value = '';
    if (!files.length) return;

    void (async () => {
      this.galleryUploading.set(true);
      try {
        let added = 0;
        let failed = 0;
        for (const f of files) {
          if (this.galleryItems().length >= MAX_GALLERY_IMAGES) break;
          try {
            const data = await this.seller.uploadFile(f);
            const publicUrl = downloadUrlForStorageKey(data.key);
            const previewUrl = data.optimizedUrl ?? publicUrl;
            this.galleryItems.update((list) => [
              ...list,
              { id: null, key: data.key, publicUrl, previewUrl },
            ]);
            added++;
          } catch (e) {
            failed++;
            // SellerService already toasted, but we still want per-file context.
            const name = f?.name ? ` (${f.name})` : '';
            this.message.error(this.translation.t('seller.uploadImageFailed') + name);
          }
        }
        if (added > 0) {
          this.message.success(this.translation.t('seller.uploadImagesSuccess', { count: added }));
        }
        if (failed > 0 && added > 0) {
          this.message.warning(this.translation.t('seller.uploadImagesPartialFail', { count: failed }));
        }
        if (failed > 0 && added === 0) {
          this.message.error(this.translation.t('seller.uploadImageFailed'));
        }
      } finally {
        this.galleryUploading.set(false);
      }
    })();
  }

  moveGalleryUp(index: number): void {
    if (index <= 0) return;
    this.galleryItems.update((list) => {
      const next = [...list];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  moveGalleryDown(index: number): void {
    this.galleryItems.update((list) => {
      if (index >= list.length - 1) return list;
      const next = [...list];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  removeGalleryItem(index: number): void {
    this.galleryItems.update((list) => list.filter((_, i) => i !== index));
  }

  onGalleryDrop(event: CdkDragDrop<GalleryItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.galleryItems.update((list) => {
      const next = [...list];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  /**
   * storage-key-persistence v1 §4.2: `item.key` is now always populated (fresh upload or
   * reconstructed from `imageStorageKey`) — no more URL fallback needed.
   */
  private galleryKeyForApi(item: GalleryItem): string {
    return item.key;
  }

  /** Clear current file selection + uploaded reference (for the trash button). */
  resetFile(): void {
    this.file.set(null);
    this.upload.set(null);
    this.fileSizeLabel.set('');
  }

  /**
   * cover-image-mode v1 §4: same filename→format guessing logic `submit()` already used
   * inline (extension matched case-insensitively against `formats`, `'pdf'` fallback when
   * unrecognized) — factored out so `coverAutoModeAvailable` can reuse it. Returns `undefined`
   * only when there is no filename to guess from at all.
   */
  private guessFormatFromFileName(name: string | undefined): string | undefined {
    if (!name) return undefined;
    const ext = name.split('.').pop()?.toLowerCase();
    return (this.formats.find((x) => x.toLowerCase() === ext) ?? 'PDF').toLowerCase();
  }

  /**
   * cover-image-mode v1 §4 (AC-02): the "auto cover" option is only offered for a PDF main
   * file. Create mode guesses from the just-selected file; edit mode prefers a newly selected
   * file's guessed format over the already-loaded document's saved format.
   */
  readonly coverAutoModeAvailable = computed(() => {
    const fmt = this.isEditMode()
      ? this.upload()
        ? this.guessFormatFromFileName(this.file()?.name)
        : this.editDocument()?.format
      : this.guessFormatFromFileName(this.file()?.name);
    return fmt === 'pdf';
  });

  private static formatFileSize(bytes: number): string {
    if (!bytes || bytes <= 0) return '';
    const u = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${i === 0 ? n : n.toFixed(1)} ${u[i]}`;
  }

  resetGallery(): void {
    this.galleryItems.set([]);
  }

  readonly step1NextDisabled = computed(() => {
    const g = this.galleryItems();
    // cover-image-mode v1 §4 (AC-06): auto mode never needs an uploaded gallery image.
    if ((this.coverImageMode() !== 'auto' && g.length === 0) || this.galleryUploading()) {
      return true;
    }
    if (this.isEditMode()) {
      return this.mainFiles().length === 0 || this.mainFilesLoading();
    }
    return !this.file() || !this.upload();
  });

  next(): void {
    if (this.step() === 3 && this.originalPriceError()) {
      this.message.error(this.originalPriceError()!);
      return;
    }
    // seller-pricing-and-storefront-stats v1 §4/AC-7: fetch the pricing hint only the moment the
    // seller first reaches step 3 — not on every category checkbox toggle in step 2.
    const enteringStep3 = this.step() !== 3;
    this.step.update((s) => Math.min(4, s + 1));
    if (this.step() === 3 && enteringStep3) {
      void this.loadPricingHint();
    }
  }

  goToStep(targetStep: number): void {
    if (this.step() === 3 && targetStep > 3 && this.originalPriceError()) {
      this.message.error(this.originalPriceError()!);
      return;
    }
    const enteringStep3 = this.step() !== 3 && targetStep === 3;
    this.step.set(targetStep);
    if (enteringStep3) {
      void this.loadPricingHint();
    }
  }

  prev(): void {
    this.step.update((s) => Math.max(1, s - 1));
  }

  /** seller-pricing-and-storefront-stats v1 §4: one-shot fetch triggered from `next()` above. */
  private async loadPricingHint(): Promise<void> {
    const categoryIds = this.categoryIds();
    if (categoryIds.length === 0) {
      this.pricingHint.set(null);
      return;
    }
    this.pricingHintLoading.set(true);
    try {
      const hint = await this.seller.getDocumentPricingHint(
        categoryIds,
        this.editId() || undefined,
      );
      this.pricingHint.set(hint);
    } finally {
      this.pricingHintLoading.set(false);
    }
  }

  addTag(): void {
    const t = this.newTag().trim();
    if (t && !this.tags().includes(t)) {
      this.tags.update((list) => [...list, t]);
    }
    this.newTag.set('');
  }
  removeTag(t: string): void {
    this.tags.update((list) => list.filter((x) => x !== t));
  }

  // ===== AI-01: Listing Autofill =====
  async requestAiAutofill(): Promise<void> {
    this.aiAutofillLoading.set(true);
    try {
      const res = await this.seller.getAutofillSuggestion({
        documentId: this.editId() || undefined,
        storageKey: this.upload()?.key || undefined,
        fileName: this.file()?.name || undefined,
      });

      if (res.isSuccess) {
        if (res.title) this.title.set(res.title);
        if (res.shortDescription) this.shortDescription.set(res.shortDescription);
        if (res.description) this.longDescription.set(res.description);
        if (res.categoryIds?.length) this.categoryIds.set(res.categoryIds);
        if (res.tags?.length) this.tags.set(res.tags);
        this.message.success(this.translation.t('seller.aiPrefillSuccess'));
      } else {
        this.message.warning(res.failureReason || this.translation.t('seller.aiPrefillFailed'));
      }
    } catch {
      this.message.error(this.translation.t('seller.aiPrefillError'));
    } finally {
      this.aiAutofillLoading.set(false);
    }
  }

  toggleCategory(id: string): void {
    this.categoryIds.update((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }

  removeCategory(id: string): void {
    this.categoryIds.update((list) => list.filter((x) => x !== id));
  }

  toggleCategoryDropdown(): void {
    this.categoryDropdownOpen.update((v) => !v);
  }

  closeCategoryDropdown(): void {
    this.categoryDropdownOpen.set(false);
  }

  /** Step 3 (pricing) helper: enable "free" — also clear stored price. */
  setIsFree(value: boolean): void {
    this.isFree.set(value);
    if (value) {
      this.price.set(0);
      this.originalPrice.set(0);
      this.discountExpiresAt.set('');
    }
  }

  aiSuggest(kind: 'short' | 'long'): void {
    if (kind === 'short') {
      this.shortDescription.set(
        this.translation.t('seller.aiFallbackShortDesc'),
      );
    } else {
      this.longDescription.set(
        this.translation.t('seller.aiFallbackFullDesc'),
      );
    }
    this.message.success(this.translation.t('seller.aiWritingSuccess'));
  }

  submit(): void {
    void (async () => {
      const f = this.file();
      const uploaded = this.upload();
      const gallery = this.galleryItems();
      // cover-image-mode v1 §4/AC-05: the "must upload a cover" rule only applies in 'custom'
      // mode — 'auto' generates its own cover from the document, so an empty gallery is fine.
      if (this.coverImageMode() === 'custom' && gallery.length === 0) {
        this.message.error(this.translation.t('seller.requireCoverImage'));
        return;
      }

      // storage-key-persistence v1 §4.2 open question: `galleryImageUrls` is a separate legacy
      // field on UpdateDocumentRequest that backend has NOT repointed at storage keys this round
      // (confirmed still URL-based server-side as of this build — see report to main session) —
      // computed exactly as before (URL, not key) so this field's contract stays unchanged.
      const galleryImageUrls = gallery.map((item) =>
        item.key ? downloadUrlForStorageKey(item.key) : item.publicUrl,
      );
      const galleryItemsPayload: DocumentGalleryItemRequest[] = gallery.map((item) => {
        const imageStorageKey = this.galleryKeyForApi(item);
        const sid = item.id?.trim();
        return sid ? { id: sid, imageStorageKey } : { imageStorageKey };
      });

      const categoryIds = this.categoryIds();
      if (!this.title().trim() || !this.shortDescription().trim() || categoryIds.length === 0) {
        this.message.error(this.translation.t('seller.requireFieldsError'));
        return;
      }

      // "Free" forces price = 0; UI hid the price input but enforce here too.
      const effectivePrice = this.isFree() ? 0 : this.price();

      if (this.originalPriceError()) {
        this.message.error(this.originalPriceError()!);
        return;
      }

      try {
        if (this.isEditMode()) {
          const id = this.editId();
          const coverImageMode = this.coverImageMode();
          const editBody: UpdateSellerDocumentRequest = {
            title: this.title().trim(),
            shortDescription: this.shortDescription().trim(),
            description: this.longDescription().trim() || this.shortDescription().trim(),
            price: effectivePrice,
            categoryIds,
            isFree: this.isFree(),
            language: this.language(),
            watermarkEnabled: this.watermark(),
            // document-watermark-scope-options v1 §3.3 (รอบสอง, post-regen): Option A travels with
            // the same PUT as Option B so both switches land in one round trip.
            previewWatermarkEnabled: this.previewWatermark(),
            previewPages: this.previewPages(),
            previewWatermarkSubtitle: this.previewWatermarkSubtitle().trim(),
            previewWatermarkFontFamily: this.previewWatermarkFontFamily().trim(),
            pages: this.pages(),
            fileSize: this.fileSizeLabel().trim() || undefined,
            originalPrice: this.isFree() ? 0 : this.originalPrice(),
            discountExpiresAt:
              this.isFree() || !this.discountExpiresAt() ? null : this.discountExpiresAt(),
            // cover-image-mode v1 §4/AC-05: always sent.
            coverImageMode,
          };
          // cover-image-mode v1 §4/AC-05: 'auto' omits galleryItems entirely (not `[]`) — the
          // backend must not touch the gallery it manages itself in that mode (spec §3.2.1).
          if (coverImageMode !== 'auto') {
            editBody.galleryItems = galleryItemsPayload;
          }
          if (uploaded && f) {
            editBody.fileStorageKey = uploaded.key;
            editBody.format = this.guessFormatFromFileName(f.name) ?? 'pdf';
            editBody.previewStorageKey = null;
          }
          await this.seller.updateDocument(id, editBody);

          // watermark-config drift fix: position/opacity/color/rotation/personalized-template
          // fields are NOT part of UpdateSellerDocumentRequest above — they only live on the
          // dedicated watermark-config endpoint. Mirror the create-mode call below so editing an
          // existing listing can actually reach them too (previously unreachable in edit mode).
          const tpl = this.watermarkTemplates.loadOrDefault(this.auth.user()?.id);
          if (tpl.config) {
            try {
              // document-watermark-scope-options v1 §3.4 (รอบสอง, post-regen): this endpoint can
              // set Option A too, so the config call carries the same value the PUT above sent —
              // whichever request lands last, the stored flag is the one the seller chose.
              await this.watermarkService.saveConfig(id, {
                ...tpl.config,
                previewWatermarkEnabled: this.previewWatermark(),
              });
            } catch {
              this.message.error(this.translation.t('seller.saveWatermarkConfigFailed'));
            }
          }

          this.message.success(this.translation.t('seller.saveDocSuccess'));
        } else {
          if (!f || !uploaded) {
            this.message.error(this.translation.t('seller.requireDocFileError'));
            return;
          }
          const tpl = this.watermarkTemplates.loadOrDefault(this.auth.user()?.id);
          const coverImageMode = this.coverImageMode();
          // create-document-watermark-properties v1 §4.2: the seller's subtitle lives in two
          // places — the per-upload field (`tpl.previewWatermarkSubtitle`, usually blank) and the
          // saved template (`tpl.config.previewWatermarkSubtitle`). Until now only the follow-up
          // watermark-config call applied this fallback, so the create row got an empty subtitle
          // whenever the per-upload field was untouched. Resolve it once, up front, and use the
          // same value on every call below.
          const previewWatermarkSubtitle =
            tpl.previewWatermarkSubtitle.trim() || tpl.config.previewWatermarkSubtitle;
          const createBody: Parameters<typeof this.seller.createDocument>[0] = {
            title: this.title().trim(),
            shortDescription: this.shortDescription().trim(),
            description: this.longDescription().trim() || this.shortDescription().trim(),
            price: effectivePrice,
            categoryIds,
            isFree: this.isFree(),
            subcategoryId: null,
            format: this.guessFormatFromFileName(f.name) ?? 'pdf',
            tags: this.tags(),
            gradeLevels: [],
            resourceType: 'lesson-summary',
            standards: [],
            watermarkEnabled: this.watermark(),
            // document-watermark-scope-options v1 §3.2 (รอบสอง, post-regen): Option A is set from
            // the very first request — omitting it would silently mean `true`.
            previewWatermarkEnabled: this.previewWatermark(),
            language: this.language(),
            previewWatermarkSubtitle,
            previewWatermarkFontFamily: tpl.previewWatermarkFontFamily.trim(),
            // create-document-watermark-properties v1 §4.2/AC-09 (รอบสอง, post-regen): the seven
            // appearance properties now ride along with the create call itself, so the new row is
            // correct the moment it exists instead of depending on the follow-up calls below.
            // `?? null` keeps "the seller never set this" distinct from a real value (§3.2).
            previewWatermarkPosition: tpl.config.previewWatermarkPosition ?? null,
            previewWatermarkOpacity: tpl.config.previewWatermarkOpacity ?? null,
            previewWatermarkColor: tpl.config.previewWatermarkColor ?? null,
            previewWatermarkRotation: tpl.config.previewWatermarkRotation ?? null,
            previewWatermarkFontSize: tpl.config.previewWatermarkFontSize ?? null,
            personalizedWatermarkPosition: tpl.config.personalizedWatermarkPosition ?? null,
            personalizedWatermarkTemplate: tpl.config.personalizedWatermarkTemplate ?? null,
            originalPrice: this.isFree() ? 0 : this.originalPrice(),
            discountExpiresAt:
              this.isFree() || !this.discountExpiresAt() ? null : this.discountExpiresAt(),
            // cover-image-mode v1 §4/AC-05: always sent.
            coverImageMode,
          };
          const doc = await this.seller.createDocument(createBody);

          // watermark-completion v1 §4.3: the create response is the first moment the backend
          // can judge this file's format against the platform policy. Surface its warning as-is
          // (never re-worded here) so the seller learns about it before leaving the page.
          if (doc) {
            this.applyWatermarkPolicy(mapSellerDocument(doc));
            const warning = this.watermarkWarning();
            if (warning) {
              this.message.warning(warning);
            }
          }

          if (doc?.id) {
            const putBody: UpdateSellerDocumentRequest = {
              fileStorageKey: uploaded.key,
              watermarkEnabled: this.watermark(),
              // document-watermark-scope-options v1 §3.3 (รอบสอง, post-regen): same as edit mode —
              // Option A rides along with the file-attach PUT.
              previewWatermarkEnabled: this.previewWatermark(),
              previewPages: this.previewPages(),
              // create-document-watermark-properties v1 §4.2: reuse the resolved subtitle instead
              // of the raw per-upload field, which is usually blank. Sending the blank one here
              // used to be invisible only because the watermark-config call that followed rewrote
              // it; that call no longer carries the subtitle (§4.1.2), so this PUT is now the last
              // writer and a blank value would be what the buyer ends up seeing.
              previewWatermarkSubtitle,
              previewWatermarkFontFamily: tpl.previewWatermarkFontFamily.trim(),
              previewStorageKey: null,
              pages: this.pages(),
              fileSize: this.fileSizeLabel().trim() || undefined,
              // cover-image-mode v1 §4/AC-05: always sent.
              coverImageMode,
            };
            // cover-image-mode v1 §4/AC-05: 'auto' omits galleryImageUrls entirely (not `[]`).
            if (coverImageMode !== 'auto') {
              putBody.galleryImageUrls = galleryImageUrls;
            }
            await putApiSellerDocumentsById({
              path: { id: doc.id },
              body: putBody,
            });

            // create-document-watermark-properties v1 §4.1.2: every other watermark field now
            // travels with the create call and the PUT above, so this third call is narrowed to
            // the five personalized-appearance fields that live on no other request DTO. Sending
            // the rest again would let this call — the one most likely to fail — overwrite values
            // that are already correct. It only goes out when at least one of the five is set.
            const personalizedAppearance: SellerWatermarkConfigRequest = {
              personalizedWatermarkFontFamily: tpl.config.personalizedWatermarkFontFamily ?? null,
              personalizedWatermarkColor: tpl.config.personalizedWatermarkColor ?? null,
              personalizedWatermarkOpacity: tpl.config.personalizedWatermarkOpacity ?? null,
              personalizedWatermarkRotation: tpl.config.personalizedWatermarkRotation ?? null,
              personalizedWatermarkFontSize: tpl.config.personalizedWatermarkFontSize ?? null,
            };
            const hasPersonalizedAppearance = Object.values(personalizedAppearance).some(
              (value) => value !== null && value !== undefined,
            );
            // AC-10: this call used to swallow every failure, so a seller could lose their
            // watermark setup without a single hint. Mirror the edit-mode branch: toast the error,
            // but keep the submit itself successful (the document exists) and still navigate away.
            if (hasPersonalizedAppearance) {
              try {
                await this.watermarkService.saveConfig(doc.id, personalizedAppearance);
              } catch {
                this.message.error(this.translation.t('seller.saveWatermarkConfigFailed'));
              }
            }
          }

          this.message.success(this.translation.t('seller.docSubmitSuccess'));
        }
        this.router.navigate(['/seller/documents']);
      } catch {
        // SellerService already toasted via apiFail
      }
    })();
  }
}

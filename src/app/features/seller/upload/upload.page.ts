import { SlicePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  CdkDrag,
  CdkDropList,
  type CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { downloadUrlForStorageKey, resolvePublicUrl } from '../../../core/api-runtime';
import { DocumentItem } from '../../../core/models';
import { mapSellerDocument } from '../../../core/api-mappers/mappers';
import { CatalogService, PlatformStatsService, SellerService } from '../../../core/services';
import {
  putApiSellerDocumentsById,
  type UpdateSellerDocumentRequest,
} from '../../../core/api/seller-document-update';
import type { GalleryItemRequestWithKey } from '../../../core/services/api-result';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
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

@Component({
  selector: 'app-seller-upload',
  standalone: true,
  imports: [
    FormsModule,
    IconComponent,
    ThbPipe,
    CdkDropList,
    CdkDrag,
    SlicePipe,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upload.page.html',
  styleUrl: './upload.page.scss',
})
export class SellerUploadPage {
  readonly maxGalleryImages = MAX_GALLERY_IMAGES;

  readonly catalog = inject(CatalogService);
  readonly platformStats = inject(PlatformStatsService);
  private readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly editId = signal<string>('');
  readonly isEditMode = computed(() => !!this.editId());

  readonly steps = [
    { no: 1, label: 'อัปโหลด' },
    { no: 2, label: 'รายละเอียด' },
    { no: 3, label: 'ตั้งราคา' },
    { no: 4, label: 'ตรวจสอบ' },
  ];

  readonly formats = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'ZIP'];

  readonly step = signal<number>(1);
  readonly file = signal<File | null>(null);
  readonly upload = signal<{ key: string; publicUrl: string } | null>(null);
  readonly uploading = signal<boolean>(false);

  readonly mainFiles = signal<MainFileRow[]>([]);
  readonly mainFilesLoading = signal(false);
  readonly listedSaving = signal(false);

  readonly galleryItems = signal<GalleryItem[]>([]);
  readonly galleryUploading = signal<boolean>(false);
  readonly watermark = signal<boolean>(true);
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

  readonly price = signal<number>(199);
  readonly originalPrice = signal<number>(0);
  /** When true, document is free (price = 0, no platform fee). */
  readonly isFree = signal<boolean>(false);

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
          this.message.error('ไม่พบเอกสารหรือโหลดไม่สำเร็จ');
          return;
        }
        this.applyEditDocument(doc);
      })();
    });
  }

  private applyEditDocument(doc: DocumentItem): void {
    this.title.set(doc.title);
    this.shortDescription.set(doc.shortDescription);
    this.longDescription.set(doc.description || doc.shortDescription);
    this.categoryIds.set([...(doc.categoryIds ?? [])]);
    this.isFree.set(doc.isFree === true || doc.price === 0);
    this.language.set(doc.language);
    this.price.set(doc.price);
    this.watermark.set(doc.watermarkEnabled ?? true);
    this.previewPages.set(doc.previewPages ?? 5);
    this.previewWatermarkSubtitle.set((doc.previewWatermarkSubtitle ?? '').trim());
    this.previewWatermarkFontFamily.set(
      doc.previewWatermarkFontFamily?.trim() || PREVIEW_WATERMARK_FONT_OPTIONS[0],
    );
    this.pages.set(doc.pages ?? 0);
    this.fileSizeLabel.set(doc.fileSize ?? '');
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
        doc.gallery.map((publicUrl) => ({ key: '', publicUrl, previewUrl: publicUrl })),
      );
    } else if (doc.cover) {
      this.galleryItems.set([{ key: '', publicUrl: doc.cover, previewUrl: doc.cover }]);
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
          if (!ok) return;
          await this.refreshMainFiles(this.editId());
        }
        this.message.success('อัปโหลดไฟล์ขึ้นเซิร์ฟเวอร์สำเร็จ');
      } catch {
        // SellerService already toasted
      } finally {
        this.uploading.set(false);
      }
    })();
  }

  selectListedMainFile(fileId: string): void {
    void (async () => {
      if (!this.isEditMode() || !this.editId()) return;
      if (this.mainFiles().find((m) => m.id === fileId)?.isListedForSale) return;
      this.listedSaving.set(true);
      try {
        const raw = await this.seller.setListedMainFile(this.editId(), fileId);
        if (raw) {
          const mapped = mapSellerDocument(raw);
          this.mainFiles.set(mapped.mainFiles ?? []);
          if (mapped.status === 'pending') {
            this.message.info('เปลี่ยนไฟล์ที่ขายแล้ว — สถานะกลับเป็นรอตรวจสอบ');
          } else {
            this.message.success('ตั้งไฟล์ที่ขายแล้ว');
          }
        }
      } finally {
        this.listedSaving.set(false);
      }
    })();
  }

  downloadMainFile(fileId: string): void {
    void (async () => {
      const docId = this.editId();
      if (!docId) return;
      const url = await this.seller.getMainFileDownloadUrl(docId, fileId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
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
            this.message.error(`อัปโหลดรูปไม่สำเร็จ${name}`);
          }
        }
        if (added > 0) {
          this.message.success(`อัปโหลดรูปแล้ว ${added} รูป`);
        }
        if (failed > 0 && added > 0) {
          this.message.warning(`มีบางรูปอัปโหลดไม่สำเร็จ ${failed} รูป`);
        }
        if (failed > 0 && added === 0) {
          this.message.error('อัปโหลดรูปไม่สำเร็จ');
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
    if (g.length === 0 || this.galleryUploading()) return true;
    if (this.isEditMode()) {
      return this.mainFiles().length === 0 || this.mainFilesLoading();
    }
    return !this.file() || !this.upload();
  });

  next(): void {
    this.step.update((s) => Math.min(4, s + 1));
  }
  prev(): void {
    this.step.update((s) => Math.max(1, s - 1));
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
    }
  }

  aiSuggest(kind: 'short' | 'long'): void {
    if (kind === 'short') {
      this.shortDescription.set(
        'สรุปเนื้อหาคุณภาพ ใช้ทบทวนได้ทันที พร้อมตัวอย่างแบบฝึกหัด',
      );
    } else {
      this.longDescription.set(
        'เอกสารฉบับนี้รวบรวมเนื้อหาที่จำเป็นและคัดเฉพาะส่วนที่ออกสอบบ่อยที่สุด พร้อมตัวอย่างประกอบและแบบฝึกหัด ช่วยให้ผู้อ่านเข้าใจเนื้อหาในเวลาอันรวดเร็ว เหมาะสำหรับนักเรียนและผู้ที่เตรียมสอบทุกระดับชั้น',
      );
    }
    this.message.success('AI ช่วยเขียนเสร็จแล้ว ลองปรับให้เป็นสไตล์คุณดูครับ');
  }

  submit(): void {
    void (async () => {
      const f = this.file();
      const uploaded = this.upload();
      const gallery = this.galleryItems();
      if (gallery.length === 0) {
        this.message.error('กรุณาอัปโหลดรูปปกอย่างน้อย 1 รูป');
        return;
      }

      // storage-key-persistence v1 §4.2 open question: `galleryImageUrls` is a separate legacy
      // field on UpdateDocumentRequest that backend has NOT repointed at storage keys this round
      // (confirmed still URL-based server-side as of this build — see report to main session) —
      // computed exactly as before (URL, not key) so this field's contract stays unchanged.
      const galleryImageUrls = gallery.map((item) =>
        item.key ? downloadUrlForStorageKey(item.key) : item.publicUrl,
      );
      const galleryItemsPayload: GalleryItemRequestWithKey[] = gallery.map((item) => {
        const imageStorageKey = this.galleryKeyForApi(item);
        const sid = item.id?.trim();
        return sid ? { id: sid, imageStorageKey } : { imageStorageKey };
      });

      const categoryIds = this.categoryIds();
      if (!this.title().trim() || !this.shortDescription().trim() || categoryIds.length === 0) {
        this.message.error('กรุณากรอกชื่อ/คำอธิบายสั้น/หมวดหมู่ให้ครบ');
        return;
      }

      // "Free" forces price = 0; UI hid the price input but enforce here too.
      const effectivePrice = this.isFree() ? 0 : this.price();

      try {
        if (this.isEditMode()) {
          const id = this.editId();
          const editBody: UpdateSellerDocumentRequest = {
            title: this.title().trim(),
            shortDescription: this.shortDescription().trim(),
            description: this.longDescription().trim() || this.shortDescription().trim(),
            price: effectivePrice,
            categoryIds,
            isFree: this.isFree(),
            language: this.language(),
            // TODO(contract): drop this cast once `imageStorageKey` exists on the generated
            // `DocumentGalleryItemRequest` (after backend regen) — see
            // docs/contracts/storage-key-persistence.md
            galleryItems:
              galleryItemsPayload as unknown as UpdateSellerDocumentRequest['galleryItems'],
            watermarkEnabled: this.watermark(),
            previewPages: this.previewPages(),
            previewWatermarkSubtitle: this.previewWatermarkSubtitle().trim(),
            previewWatermarkFontFamily: this.previewWatermarkFontFamily().trim(),
            pages: this.pages(),
            fileSize: this.fileSizeLabel().trim() || undefined,
          };
          if (uploaded && f) {
            editBody.fileStorageKey = uploaded.key;
            editBody.format = (
              this.formats.find(
                (x) => x.toLowerCase() === f.name.split('.').pop()?.toLowerCase(),
              ) ?? 'PDF'
            ).toLowerCase();
            editBody.previewStorageKey = null;
          }
          await this.seller.updateDocument(id, editBody);
          this.message.success('บันทึกการแก้ไขเรียบร้อย');
        } else {
          if (!f || !uploaded) {
            this.message.error('กรุณาเลือกไฟล์เอกสารและรอให้อัปโหลดเสร็จก่อน');
            return;
          }
          // Cast: the OpenAPI type still carries the legacy `categoryId: string` until regen.
          // Backend already accepts `categoryIds: string[]` + `isFree: boolean`.
          const createBody = {
            title: this.title().trim(),
            shortDescription: this.shortDescription().trim(),
            description: this.longDescription().trim() || this.shortDescription().trim(),
            price: effectivePrice,
            categoryIds,
            isFree: this.isFree(),
            subcategoryId: null,
            format: (
              this.formats.find(
                (x) => x.toLowerCase() === f.name.split('.').pop()?.toLowerCase(),
              ) ?? 'PDF'
            ).toLowerCase(),
            tags: this.tags(),
            gradeLevels: [],
            resourceType: 'lesson-summary',
            standards: [],
            watermarkEnabled: this.watermark(),
            language: this.language(),
            previewWatermarkSubtitle: this.previewWatermarkSubtitle().trim(),
            previewWatermarkFontFamily: this.previewWatermarkFontFamily().trim(),
          } as unknown as Parameters<typeof this.seller.createDocument>[0];
          const doc = await this.seller.createDocument(createBody);

          if (doc?.id) {
            await putApiSellerDocumentsById({
              path: { id: doc.id },
              body: {
                galleryImageUrls,
                fileStorageKey: uploaded.key,
                watermarkEnabled: this.watermark(),
                previewPages: this.previewPages(),
                previewWatermarkSubtitle: this.previewWatermarkSubtitle().trim(),
                previewWatermarkFontFamily: this.previewWatermarkFontFamily().trim(),
                previewStorageKey: null,
                pages: this.pages(),
                fileSize: this.fileSizeLabel().trim() || undefined,
              },
            });
          }

          this.message.success('ส่งเข้าพิจารณาเรียบร้อย');
        }
        this.router.navigate(['/seller/documents']);
      } catch {
        // SellerService already toasted via apiFail
      }
    })();
  }
}

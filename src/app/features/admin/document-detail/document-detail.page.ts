import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import {
  CdkDrag,
  CdkDropList,
  type CdkDragDrop,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  getApiAdminDocumentById,
  getApiAdminDocumentReports,
  patchApiAdminDocumentById,
  postApiAdminDocumentReportResolve,
  postApiAdminDocumentReports,
  postApiAdminDocumentReportsResolveAll,
  type AdminDocumentDetail,
  type AdminDocumentReport,
} from '../../../core/api/admin-documents.api';
import type { DocumentGalleryItemRequest } from '../../../core/api/types.gen';
import {
  GRADE_LEVEL_LABELS,
  RESOURCE_TYPE_LABELS,
  type GradeLevel,
  type ResourceType,
} from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { AuthService } from '../../../core/services/auth.service';
import { SellerService } from '../../../core/services/seller.service';
import { unwrapSdkResult } from '../../../core/services/api-result';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { downloadUrlForStorageKey, resolvePublicUrl, resolveDownloadUrl } from '../../../core/api-runtime';
import { downloadFileFromUrl } from '../../../core/file-download';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

const GRADE_PRESET_KEYS = Object.keys(GRADE_LEVEL_LABELS) as GradeLevel[];

const STANDARD_PRESETS = ['O-NET', 'TGAT', 'TPAT', 'GAT', 'PAT', 'IPST', 'A-Level', 'IELTS', 'TOEFL'];

const MAX_GALLERY_IMAGES = 10;
// image-upload-optimization v1 §4: previewUrl is what <img> renders (optimizedUrl when the
// backend produced one, publicUrl otherwise) — key/publicUrl stay the untouched original.
// storage-key-persistence v1 §4.2: `key` is now always populated (fresh upload or reconstructed
// from `imageStorageKey`) — it is what the save payload (`galleryItems[].imageStorageKey`) must
// always send back.
type GalleryItem = { id?: string | null; key: string; publicUrl: string; previewUrl: string };

@Component({
  selector: 'app-admin-document-detail',
  standalone: true,
  imports: [
    TranslatePipe,
    FormsModule,
    RouterLink,
    NzCheckboxModule,
    NzModalModule,
    NzSwitchModule,
    EmptyStateComponent,
    IconComponent,
    DatePipe,
    CdkDropList,
    CdkDrag,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-detail.page.html',
  styleUrl: './document-detail.page.scss',
})
export class AdminDocumentDetailPage {
  readonly translation = inject(TranslationService);
  /** For template: resolve cover and other stored URLs against API base / R2 rules. */
  readonly resolvePublicUrl = resolvePublicUrl;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  readonly admin = inject(AdminService);
  private readonly seller = inject(SellerService);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly doc = signal<AdminDocumentDetail | null>(null);
  readonly reports = signal<AdminDocumentReport[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly newReportReason = signal('');

  readonly tags = signal<string[]>([]);
  readonly newTag = signal('');

  readonly selectedGradeLevels = signal<string[]>([]);
  readonly extraGradeLevels = signal('');

  readonly selectedStandards = signal<string[]>([]);
  readonly extraStandards = signal('');

  readonly coverUploading = signal(false);
  readonly mainFileUploading = signal(false);
  readonly previewUploading = signal(false);

  // document-preview-access-fixes v1 §4.3 — admin review viewer state. The PDF never becomes a
  // URL the browser can navigate to on its own: the admin route is `[Authorize(Roles="Admin")]`
  // and must not be reachable through a `?token=` query (a JWT in the address bar leaks into
  // history/logs for a file that is not public yet), so the bytes arrive through the SDK and are
  // handed to the iframe as an object URL.
  readonly reviewViewerOpen = signal(false);
  readonly reviewViewerLoading = signal(false);
  readonly reviewViewerUrl = signal<SafeResourceUrl | null>(null);
  readonly reviewViewerFailed = signal(false);
  /** "ดูแบบที่ผู้ซื้อเห็น" — sends `?watermark=true` so the admin can check the buyer-facing render. */
  readonly reviewAsBuyer = signal(false);
  private readonly _reviewBlobUrl = signal<string | null>(null);

  readonly maxGalleryImages = MAX_GALLERY_IMAGES;
  readonly galleryItems = signal<GalleryItem[]>([]);
  readonly galleryUploading = signal(false);

  readonly docStatuses = [
    { value: 'draft', label: this.translation.t('admin.statusDraft') },
    { value: 'pending', label: this.translation.t('admin.statusPending') },
    { value: 'approved', label: this.translation.t('admin.statusApproved') },
    { value: 'rejected', label: this.translation.t('admin.statusRejected') },
  ];

  readonly formatOptions = [
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'Word (DOCX)' },
    { value: 'pptx', label: 'PowerPoint' },
    { value: 'xlsx', label: 'Excel' },
    { value: 'zip', label: 'ZIP' },
  ];

  readonly gradePresets = GRADE_PRESET_KEYS.map((k) => ({
    value: k,
    label: GRADE_LEVEL_LABELS[k],
  }));

  readonly resourceTypeOptions = (
    Object.entries(RESOURCE_TYPE_LABELS) as [ResourceType, string][]
  ).map(([value, label]) => ({ value, label }));

  readonly standardPresets = STANDARD_PRESETS;

  private documentId = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this.revokeReviewBlob());
    void this.admin.refreshAdminCategories();
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      void this.router.navigate(['/admin/documents']);
      return;
    }
    this.documentId = id;
    void this.load();
  }

  private parseGradesFromDoc(levels: string[] | undefined): void {
    const fromDoc = levels ?? [];
    const presetSet = new Set<string>(GRADE_PRESET_KEYS);
    const selected = fromDoc.filter((g) => presetSet.has(g));
    const extra = fromDoc.filter((g) => !presetSet.has(g));
    this.selectedGradeLevels.set(selected);
    this.extraGradeLevels.set(extra.join(', '));
  }

  private parseStandardsFromDoc(stds: string[] | undefined): void {
    const fromDoc = stds ?? [];
    const presetSet = new Set(STANDARD_PRESETS);
    const selected = fromDoc.filter((s) => presetSet.has(s));
    const extra = fromDoc.filter((s) => !presetSet.has(s));
    this.selectedStandards.set(selected);
    this.extraStandards.set(extra.join(', '));
  }

  private mergedGradeLevels(): string[] {
    const extra = this.extraGradeLevels()
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    return [...new Set([...this.selectedGradeLevels(), ...extra])];
  }

  private mergedStandards(): string[] {
    const extra = this.extraStandards()
      .split(/[,;\n]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    return [...new Set([...this.selectedStandards(), ...extra])];
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [dRes, rRes] = await Promise.all([
        getApiAdminDocumentById({ path: { id: this.documentId } }),
        getApiAdminDocumentReports({ path: { id: this.documentId } }),
      ]);
      const d = unwrapSdkResult(dRes);
      this.doc.set(d);
      this.tags.set([...(d.tags ?? [])]);
      const apiItems = (d.galleryItems ?? []).filter(
        (it) => (it.id ?? '').trim() !== '' && (it.imageUrl ?? '').trim() !== '',
      );
      if (apiItems.length) {
        this.galleryItems.set(
          apiItems.map((it) => {
            const publicUrl = resolvePublicUrl((it.imageUrl ?? '').replaceAll('%2F', '/'));
            // storage-key-persistence v2 §4.2: key must round-trip from imageStorageKey, not
            // stay '' — resubmitting '' would drop the item's key on an unrelated edit.
            const key = it.imageStorageKey ?? '';
            return { id: it.id, key, publicUrl, previewUrl: publicUrl };
          }),
        );
      } else {
        const urls = (d.galleryUrls ?? []).filter(Boolean);
        if (urls.length) {
          this.galleryItems.set(
            urls.map((u) => {
              const publicUrl = resolvePublicUrl(u);
              return { key: '', publicUrl, previewUrl: publicUrl };
            }),
          );
        } else {
          this.galleryItems.set([]);
        }
      }
      this.parseGradesFromDoc(d.gradeLevels);
      this.parseStandardsFromDoc(d.standards);
      this.reports.set(unwrapSdkResult(rRes) ?? []);
    } catch (e) {
      this.apiFail.report('Load document details', e);
      this.doc.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  toggleGrade(value: string, checked: boolean): void {
    const cur = this.selectedGradeLevels();
    if (checked) {
      if (!cur.includes(value)) this.selectedGradeLevels.set([...cur, value]);
    } else {
      this.selectedGradeLevels.set(cur.filter((x) => x !== value));
    }
  }

  gradeChecked(value: string): boolean {
    return this.selectedGradeLevels().includes(value);
  }

  toggleStandard(value: string, checked: boolean): void {
    const cur = this.selectedStandards();
    if (checked) {
      if (!cur.includes(value)) this.selectedStandards.set([...cur, value]);
    } else {
      this.selectedStandards.set(cur.filter((x) => x !== value));
    }
  }

  standardChecked(value: string): boolean {
    return this.selectedStandards().includes(value);
  }

  addTag(): void {
    const t = this.newTag().trim();
    if (t && !this.tags().includes(t)) this.tags.update((list) => [...list, t]);
    this.newTag.set('');
  }

  removeTag(t: string): void {
    this.tags.update((list) => list.filter((x) => x !== t));
  }

  async save(): Promise<void> {
    const cur = this.doc();
    if (!cur) return;
    this.saving.set(true);
    try {
      // storage-key-persistence v2 §4.2: `x.key` is now always populated (fresh upload or
      // reconstructed from `imageStorageKey` in load()) — send it directly, no more URL fallback.
      const galleryItemsBody: DocumentGalleryItemRequest[] = this.galleryItems()
        .map((x) => {
          const imageStorageKey = x.key.trim();
          const id = x.id?.trim();
          return id ? { id, imageStorageKey } : { imageStorageKey };
        })
        .filter((x) => x.imageStorageKey.length > 0)
        .slice(0, MAX_GALLERY_IMAGES);
      const result = await patchApiAdminDocumentById({
        path: { id: this.documentId },
        body: {
          title: cur.title,
          shortDescription: cur.shortDescription,
          description: cur.description,
          price: cur.price,
          categoryIds: cur.categoryIds,
          subcategoryId: cur.subcategoryId || null,
          resourceType: cur.resourceType,
          format: cur.format,
          status: cur.status,
          tags: this.tags(),
          gradeLevels: this.mergedGradeLevels(),
          standards: this.mergedStandards(),
          isFeatured: cur.isFeatured,
          isFree: cur.isFree,
          watermarkEnabled: cur.watermarkEnabled,
          previewPages: cur.previewPages,
          pages: cur.pages,
          fileSize: cur.fileSize,
          language: cur.language,
          galleryItems: galleryItemsBody.length ? galleryItemsBody : null,
          fileStorageKey: cur.fileStorageKey,
          previewStorageKey: cur.previewStorageKey,
        },
      });
      const updated = unwrapSdkResult(result);
      this.doc.set(updated);
      this.parseGradesFromDoc(updated.gradeLevels);
      this.parseStandardsFromDoc(updated.standards);
      this.tags.set([...(updated.tags ?? [])]);
      const updItems = (updated.galleryItems ?? []).filter(
        (it) => (it.id ?? '').trim() !== '' && (it.imageUrl ?? '').trim() !== '',
      );
      if (updItems.length) {
        this.galleryItems.set(
          updItems.map((it) => {
            const publicUrl = resolvePublicUrl((it.imageUrl ?? '').replaceAll('%2F', '/'));
            // storage-key-persistence v2 §4.2: key must round-trip from imageStorageKey.
            const key = it.imageStorageKey ?? '';
            return { id: it.id, key, publicUrl, previewUrl: publicUrl };
          }),
        );
      } else {
        const urls = (updated.galleryUrls ?? []).filter(Boolean);
        if (urls.length) {
          this.galleryItems.set(
            urls.map((u) => {
              const publicUrl = resolvePublicUrl(u);
              return { key: '', publicUrl, previewUrl: publicUrl };
            }),
          );
        }
      }
      this.message.success(this.translation.t('admin.savedSuccess'));
      await this.loadReportsOnly();
    } catch (e) {
      this.apiFail.report('Save document', e);
    } finally {
      this.saving.set(false);
    }
  }

  private async loadReportsOnly(): Promise<void> {
    try {
      const rRes = await getApiAdminDocumentReports({ path: { id: this.documentId } });
      this.reports.set(unwrapSdkResult(rRes) ?? []);
    } catch {
      /* ignore */
    }
  }

  async addReport(): Promise<void> {
    const reason = this.newReportReason().trim();
    if (!reason) {
      this.message.warning(this.translation.t('admin.pleaseSpecifyReason'));
      return;
    }
    try {
      const result = await postApiAdminDocumentReports({
        path: { id: this.documentId },
        body: { reason },
      });
      unwrapSdkResult(result);
      this.newReportReason.set('');
      this.message.success(this.translation.t('admin.reportAddedSuccess'));
      await this.load();
    } catch (e) {
      this.apiFail.report('Add report', e);
    }
  }

  async resolveReport(reportId: string): Promise<void> {
    if (!reportId.trim()) return;
    try {
      const result = await postApiAdminDocumentReportResolve({
        path: { id: this.documentId, reportId },
      });
      if (result.error) throw result.error;
      await this.load();
    } catch (e) {
      this.apiFail.report('Resolve report', e);
    }
  }

  async resolveAllReports(): Promise<void> {
    try {
      const result = await postApiAdminDocumentReportsResolveAll({
        path: { id: this.documentId },
      });
      const n = unwrapSdkResult(result);
      this.message.success(this.translation.t('admin.reportsResolvedCount', { count: n }));
      await this.load();
    } catch (e) {
      this.apiFail.report('Resolve all reports', e);
    }
  }

  patchDoc(partial: Partial<AdminDocumentDetail>): void {
    const cur = this.doc();
    if (!cur) return;
    this.doc.set({ ...cur, ...partial });
  }

  parseIntSafe(v: string | number, fallback: number): number {
    const s = typeof v === 'number' ? String(Math.trunc(v)) : v;
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  }

  async onCoverFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) {
      this.message.warning(this.translation.t('admin.chooseImageForCover'));
      return;
    }
    this.coverUploading.set(true);
    try {
      const data = await this.seller.uploadFile(file);
      const publicUrl = downloadUrlForStorageKey(data.key);
      const previewUrl = data.optimizedUrl ?? publicUrl;
      this.galleryItems.update((list) => [
        { id: null, key: data.key, publicUrl, previewUrl },
        ...list.slice(0, MAX_GALLERY_IMAGES - 1),
      ]);
      this.message.success(this.translation.t('admin.coverUploadedNotice'));
    } finally {
      this.coverUploading.set(false);
    }
  }

  async onGalleryFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = input.files?.length ? Array.from(input.files) : [];
    input.value = '';
    if (!files.length) return;

    this.galleryUploading.set(true);
    try {
      let added = 0;
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
        } catch {
          /* SellerService already toasted */
        }
      }
      if (added) this.message.success(this.translation.t('admin.imagesUploadedCountNotice', { count: added }));
    } finally {
      this.galleryUploading.set(false);
    }
  }

  removeGalleryItem(index: number): void {
    this.galleryItems.update((list) => list.filter((_, i) => i !== index));
  }

  resetGallery(): void {
    this.galleryItems.set([]);
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
   * The main document file link is a protected document file — it 404s on a direct `<a href>`
   * link because the browser navigation carries no JWT. `hasMainFile` stays synchronous (the
   * template still gates the link on "is there a key at all"); the actual download URL is
   * fetched on click through `AdminService.getFileDownloadUrl`, which calls the authenticated
   * presigned-URL endpoint before opening the tab.
   */
  hasMainFile(): boolean {
    return !!this.doc()?.fileStorageKey?.trim();
  }

  /**
   * No pre-opened blank tab: a blocked popup used to make this button do nothing at all, and
   * `catch { win?.close(); }` hid every other failure too. The bytes are fetched here and saved
   * through a hidden anchor, and a failure is reported.
   */
  async downloadMainFile(): Promise<void> {
    const key = this.doc()?.fileStorageKey?.trim();
    if (!key) return;
    let rawUrl: string | null = null;
    try {
      rawUrl = await this.admin.getFileDownloadUrl(key);
    } catch {
      rawUrl = null;
    }
    const targetUrl = rawUrl || downloadUrlForStorageKey(key);
    const url = resolveDownloadUrl(targetUrl, this.auth.accessToken());
    if (!url || !(await downloadFileFromUrl(url))) {
      this.message.error(this.translation.t('admin.fileDownloadFailed'));
    }
  }

  /**
   * document-preview-access-fixes v1 §4.3 — open the review viewer.
   *
   * Mirrors the buyer preview modal (`features/buyer/document-detail`): fetch the PDF as a Blob
   * through the service, turn it into an object URL, hand it to the iframe as a trusted resource
   * URL. The failure branch is not cosmetic — a document whose stored file is gone answers
   * `404 { error: 'file_missing' }`, and the admin must be told that instead of staring at a
   * blank frame, with the original-file download offered as the way out.
   */
  async openReviewViewer(): Promise<void> {
    if (!this.documentId || this.reviewViewerLoading()) return;
    this.revokeReviewBlob();
    this.reviewViewerUrl.set(null);
    this.reviewViewerFailed.set(false);
    this.reviewViewerOpen.set(true);
    this.reviewViewerLoading.set(true);
    try {
      const blob = await this.admin.getDocumentReviewPdf(this.documentId, this.reviewAsBuyer());
      const blobUrl = URL.createObjectURL(blob);
      this._reviewBlobUrl.set(blobUrl);
      this.reviewViewerUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(blobUrl));
    } catch {
      this.reviewViewerFailed.set(true);
      this.message.error(this.translation.t('admin.reviewViewerFailed'));
    } finally {
      this.reviewViewerLoading.set(false);
    }
  }

  closeReviewViewer(): void {
    this.reviewViewerOpen.set(false);
    this.revokeReviewBlob();
    this.reviewViewerUrl.set(null);
  }

  /** Switching the buyer/original mode re-fetches, so the old blob must go first. */
  setReviewAsBuyer(value: boolean): void {
    if (this.reviewAsBuyer() === value) return;
    this.reviewAsBuyer.set(value);
    const wasOpen = this.reviewViewerOpen();
    this.revokeReviewBlob();
    this.reviewViewerUrl.set(null);
    if (wasOpen) void this.openReviewViewer();
  }

  /**
   * Fallback offered whenever the viewer fails: the raw file straight from storage. Unlike the
   * admin preview route this one is the public `/api/files/download/{key}` endpoint, which takes
   * its auth from the `token` query `resolveDownloadUrl` appends.
   */
  reviewOriginalFileUrl(): string {
    const key = this.doc()?.fileStorageKey?.trim();
    if (!key) return '';
    return resolveDownloadUrl(downloadUrlForStorageKey(key), this.auth.accessToken());
  }

  private revokeReviewBlob(): void {
    const blobUrl = this._reviewBlobUrl();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    this._reviewBlobUrl.set(null);
  }

  async onMainFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.mainFileUploading.set(true);
    try {
      const data = await this.seller.uploadFile(file);
      this.patchDoc({
        fileStorageKey: data.key,
        fileSize: AdminDocumentDetailPage.formatFileSize(file.size),
      });
      this.message.success(this.translation.t('admin.mainFileUploadedNotice'));
    } finally {
      this.mainFileUploading.set(false);
    }
  }

  async onPreviewFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.previewUploading.set(true);
    try {
      const data = await this.seller.uploadFile(file);
      this.patchDoc({ previewStorageKey: data.key });
      this.message.success(this.translation.t('admin.previewFileUploadedNotice'));
    } finally {
      this.previewUploading.set(false);
    }
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
}

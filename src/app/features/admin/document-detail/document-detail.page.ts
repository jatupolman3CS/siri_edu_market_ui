import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
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
import {
  GRADE_LEVEL_LABELS,
  RESOURCE_TYPE_LABELS,
  type GradeLevel,
  type ResourceType,
} from '../../../core/models';
import { AdminService } from '../../../core/services/admin.service';
import { SellerService } from '../../../core/services/seller.service';
import { unwrapSdkResult } from '../../../core/services/api-result';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { downloadUrlForStorageKey, resolvePublicUrl } from '../../../core/api-runtime';

const GRADE_PRESET_KEYS = Object.keys(GRADE_LEVEL_LABELS) as GradeLevel[];

const STANDARD_PRESETS = ['O-NET', 'TGAT', 'TPAT', 'GAT', 'PAT', 'สสวท.', 'A-Level', 'IELTS', 'TOEFL'];

const MAX_GALLERY_IMAGES = 10;
type GalleryItem = { id?: string | null; key: string; publicUrl: string };

@Component({
  selector: 'app-admin-document-detail',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, CdkDropList, CdkDrag],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-detail.page.html',
  styleUrl: './document-detail.page.scss',
})
export class AdminDocumentDetailPage {
  /** For template: resolve cover and other stored URLs against API base / R2 rules. */
  readonly resolvePublicUrl = resolvePublicUrl;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  readonly admin = inject(AdminService);
  private readonly seller = inject(SellerService);

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

  readonly maxGalleryImages = MAX_GALLERY_IMAGES;
  readonly galleryItems = signal<GalleryItem[]>([]);
  readonly galleryUploading = signal(false);

  readonly docStatuses = [
    { value: 'draft', label: 'ฉบับร่าง' },
    { value: 'pending', label: 'รออนุมัติ' },
    { value: 'approved', label: 'อนุมัติแล้ว' },
    { value: 'rejected', label: 'ปฏิเสธ' },
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
          apiItems.map((it) => ({
            id: it.id,
            key: '',
            publicUrl: resolvePublicUrl((it.imageUrl ?? '').replaceAll('%2F', '/')),
          })),
        );
      } else {
        const urls = (d.galleryUrls ?? []).filter(Boolean);
        if (urls.length) {
          this.galleryItems.set(urls.map((u) => ({ key: '', publicUrl: resolvePublicUrl(u) })));
        } else {
          this.galleryItems.set([]);
        }
      }
      this.parseGradesFromDoc(d.gradeLevels);
      this.parseStandardsFromDoc(d.standards);
      this.reports.set(unwrapSdkResult(rRes) ?? []);
    } catch (e) {
      this.apiFail.report('โหลดรายละเอียดเอกสาร', e);
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
      const galleryItemsBody = this.galleryItems()
        .map((x) => {
          const imageUrl = (x.key ? downloadUrlForStorageKey(x.key) : x.publicUrl).trim();
          const id = x.id?.trim();
          return id ? { id, imageUrl } : { imageUrl };
        })
        .filter((x) => x.imageUrl.length > 0)
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
          updItems.map((it) => ({
            id: it.id,
            key: '',
            publicUrl: resolvePublicUrl((it.imageUrl ?? '').replaceAll('%2F', '/')),
          })),
        );
      } else {
        const urls = (updated.galleryUrls ?? []).filter(Boolean);
        if (urls.length) {
          this.galleryItems.set(urls.map((u) => ({ key: '', publicUrl: resolvePublicUrl(u) })));
        }
      }
      this.message.success('บันทึกแล้ว');
      await this.loadReportsOnly();
    } catch (e) {
      this.apiFail.report('บันทึกเอกสาร', e);
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
      this.message.warning('กรุณาระบุเหตุผล');
      return;
    }
    try {
      const result = await postApiAdminDocumentReports({
        path: { id: this.documentId },
        body: { reason },
      });
      unwrapSdkResult(result);
      this.newReportReason.set('');
      this.message.success('เพิ่มรายงานแล้ว');
      await this.load();
    } catch (e) {
      this.apiFail.report('เพิ่มรายงาน', e);
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
      this.apiFail.report('ปิดรายงาน', e);
    }
  }

  async resolveAllReports(): Promise<void> {
    try {
      const result = await postApiAdminDocumentReportsResolveAll({
        path: { id: this.documentId },
      });
      const n = unwrapSdkResult(result);
      this.message.success(`ปิดรายงานแล้ว ${n} รายการ`);
      await this.load();
    } catch (e) {
      this.apiFail.report('ปิดรายงานทั้งหมด', e);
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
      this.message.warning('เลือกไฟล์รูปภาพสำหรับปก');
      return;
    }
    this.coverUploading.set(true);
    try {
      const data = await this.seller.uploadFile(file);
      const publicUrl = downloadUrlForStorageKey(data.key);
      this.galleryItems.update((list) => [{ id: null, key: data.key, publicUrl }, ...list.slice(0, MAX_GALLERY_IMAGES - 1)]);
      this.message.success('อัปโหลดรูปปกแล้ว — กดบันทึกเพื่อยืนยัน');
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
          this.galleryItems.update((list) => [...list, { id: null, key: data.key, publicUrl }]);
          added++;
        } catch {
          /* SellerService already toasted */
        }
      }
      if (added) this.message.success(`อัปโหลดรูปแล้ว ${added} รูป — กดบันทึกเพื่อยืนยัน`);
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
      this.message.success('อัปโหลดไฟล์หลักแล้ว — กดบันทึกเพื่อยืนยัน');
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
      this.message.success('อัปโหลดไฟล์ตัวอย่างแล้ว — กดบันทึกเพื่อยืนยัน');
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

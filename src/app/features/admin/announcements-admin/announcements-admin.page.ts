import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { AdminService, type AnnouncementRequest } from '../../../core/services/admin.service';
import { SellerService } from '../../../core/services/seller.service';
import { downloadUrlForStorageKey } from '../../../core/api-runtime';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from '../../../core/services/action-state';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import type { AnnouncementAdmin } from '../../../core/models';

/** announcement-popup v2 §3.1: images per announcement, enforced client-side before hitting the API (AC-26). */
const MIN_IMAGES = 1;
const MAX_IMAGES = 10;

/** One row in the create/edit form's image list — `key` is a client-only stable `@for` track id. */
interface AnnouncementImageFormRow {
  key: string;
  /** Existing `ANNOUNCEMENT_IMAGE.Id` when editing; `null` means "uploaded in this session, not saved yet". */
  id: string | null;
  imageUrl: string;
  linkUrl: string;
  altText: string;
}

export type AnnouncementStatus = 'active' | 'scheduled' | 'expired' | 'disabled';

/** announcement-popup v1 §4 — derived client-side only from 3 raw fields, using the browser clock. */
export function announcementStatus(a: AnnouncementAdmin, now = new Date()): AnnouncementStatus {
  if (!a.isEnabled) return 'disabled';
  if (a.startAt && new Date(a.startAt) > now) return 'scheduled';
  if (a.endAt && new Date(a.endAt) < now) return 'expired';
  return 'active';
}

const STATUS_LABELS: Record<AnnouncementStatus, string> = {
  disabled: 'ปิดใช้งาน',
  scheduled: 'รอเริ่ม',
  expired: 'หมดอายุ',
  active: 'กำลังแสดง',
};

/**
 * announcement-popup v1 §4 (`docs/contracts/announcement-popup.md`) — admin CRUD page for
 * `ANNOUNCEMENT`/`ANNOUNCEMENT_IMAGE`. `AdminService`'s 5 announcement methods are wired to the
 * real generated SDK (round 2, after `generate:api` regenerated against the live backend) —
 * every save/delete below hits the real `api/admin/announcements*` endpoints.
 *
 * Structure mirrors `AdminCategoriesPage`'s subcategory form (list + `nz-modal` create/edit +
 * `NzModalService` confirm-before-delete).
 */
@Component({
  selector: 'app-announcements-admin',
  standalone: true,
  imports: [FormsModule, NzModalModule, NzSwitchModule, IconComponent, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcements-admin.page.html',
  styleUrl: './announcements-admin.page.scss',
})
export class AnnouncementsAdminPage {
  private readonly admin = inject(AdminService);
  private readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly items = signal<AnnouncementAdmin[]>([]);
  readonly state = signal<ActionState>(idleActionState());
  readonly loading = computed(() => this.state().status === 'loading');

  readonly formOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly saving = signal(false);
  readonly formTitle = signal('');
  readonly formIsEnabled = signal(true);
  /** `yyyy-MM-dd` from `<input type="date">`, or `''` for "not set". */
  readonly formStartAt = signal('');
  readonly formEndAt = signal('');
  readonly formSortOrder = signal(0);
  readonly formImages = signal<AnnouncementImageFormRow[]>([]);
  readonly formImageUploading = signal(false);

  readonly formImageCount = computed(() => this.formImages().length);
  readonly formImageCountValid = computed(() => {
    const n = this.formImageCount();
    return n >= MIN_IMAGES && n <= MAX_IMAGES;
  });
  /** AC-26: shown live, and blocks the modal's OK button — before any API call happens. */
  readonly formImageCountError = computed(() => {
    if (this.formImageCountValid()) return '';
    return `ต้องมีรูปอย่างน้อย ${MIN_IMAGES} รูป และไม่เกิน ${MAX_IMAGES} รูปต่อประกาศ (ตอนนี้มี ${this.formImageCount()} รูป)`;
  });

  constructor() {
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.state.set(loadingActionState());
    try {
      this.items.set(await this.admin.listAnnouncements());
      this.state.set(idleActionState());
    } catch {
      this.items.set([]);
      this.state.set(errorActionState('โหลดรายการประกาศไม่สำเร็จ'));
    }
  }

  status(a: AnnouncementAdmin): AnnouncementStatus {
    return announcementStatus(a);
  }

  statusLabel(a: AnnouncementAdmin): string {
    return STATUS_LABELS[announcementStatus(a)];
  }

  openCreate(): void {
    this.editingId.set(null);
    this.formTitle.set('');
    this.formIsEnabled.set(true);
    this.formStartAt.set('');
    this.formEndAt.set('');
    this.formSortOrder.set(0);
    this.formImages.set([]);
    this.formOpen.set(true);
  }

  openEdit(a: AnnouncementAdmin): void {
    this.editingId.set(a.id);
    this.formTitle.set(a.title);
    this.formIsEnabled.set(a.isEnabled);
    this.formStartAt.set(a.startAt ? a.startAt.slice(0, 10) : '');
    this.formEndAt.set(a.endAt ? a.endAt.slice(0, 10) : '');
    this.formSortOrder.set(a.sortOrder);
    this.formImages.set(
      [...a.images]
        .sort((x, y) => x.sortOrder - y.sortOrder)
        .map((img) => ({
          key: img.id,
          id: img.id,
          imageUrl: img.imageUrl,
          linkUrl: img.linkUrl ?? '',
          altText: img.altText ?? '',
        })),
    );
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  /**
   * §4: "เพิ่มรูป" is the only image-related action button — it both picks file(s) and uploads
   * them (reusing `SellerService.uploadFile`, the one upload endpoint used across the whole admin
   * area), appending a completed row per file. `imageUrl` is `optimizedUrl ?? downloadUrlForStorageKey(key)`
   * stored verbatim (§1.2) — never `publicUrl` directly.
   */
  async onAddImageFiles(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = input.files?.length ? Array.from(input.files) : [];
    input.value = '';
    if (!files.length) return;

    this.formImageUploading.set(true);
    try {
      for (const file of files) {
        if (this.formImages().length >= MAX_IMAGES) break;
        try {
          const data = await this.seller.uploadFile(file);
          const imageUrl = data.optimizedUrl ?? downloadUrlForStorageKey(data.key);
          this.formImages.update((rows) => [
            ...rows,
            { key: crypto.randomUUID(), id: null, imageUrl, linkUrl: '', altText: '' },
          ]);
        } catch {
          /* SellerService already reported this via ApiFailureReporter */
        }
      }
    } finally {
      this.formImageUploading.set(false);
    }
  }

  updateImageRow(key: string, patch: Partial<Pick<AnnouncementImageFormRow, 'linkUrl' | 'altText'>>): void {
    this.formImages.update((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  removeImageRow(key: string): void {
    this.formImages.update((rows) => rows.filter((r) => r.key !== key));
  }

  async save(): Promise<void> {
    const title = this.formTitle().trim();
    if (!title) {
      this.message.warning('กรุณากรอกหัวข้อ');
      return;
    }
    if (!this.formImageCountValid()) {
      this.message.warning(this.formImageCountError());
      return;
    }

    const request: AnnouncementRequest = {
      title,
      isEnabled: this.formIsEnabled(),
      startAt: this.formStartAt() || null,
      endAt: this.formEndAt() || null,
      sortOrder: this.formSortOrder(),
      images: this.formImages().map((row, index) => ({
        id: row.id,
        imageUrl: row.imageUrl,
        linkUrl: row.linkUrl.trim() || null,
        altText: row.altText.trim() || null,
        sortOrder: index,
      })),
    };

    this.saving.set(true);
    try {
      const editingId = this.editingId();
      if (editingId) {
        await this.admin.updateAnnouncement(editingId, request);
        this.message.success('บันทึกประกาศเรียบร้อย');
      } else {
        await this.admin.createAnnouncement(request);
        this.message.success('เพิ่มประกาศเรียบร้อย');
      }
      this.closeForm();
      await this.refresh();
    } catch {
      this.message.error('ดำเนินการกับประกาศไม่สำเร็จ');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(a: AnnouncementAdmin): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันลบประกาศ',
      nzContent: `ยืนยันลบประกาศ "${a.title}" หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`,
      nzOkText: 'ลบ',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.remove(a.id),
    });
  }

  private async remove(id: string): Promise<void> {
    try {
      await this.admin.deleteAnnouncement(id);
      this.message.success('ลบประกาศเรียบร้อย');
      await this.refresh();
    } catch {
      this.message.error('ดำเนินการกับประกาศไม่สำเร็จ');
    }
  }
}

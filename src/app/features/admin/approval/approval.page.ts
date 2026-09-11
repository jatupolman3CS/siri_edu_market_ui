import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import type { AdminDocumentDetail } from '../../../core/api/admin-documents.api';
import { resolvePublicUrl, resolveDownloadUrl } from '../../../core/api-runtime';
import { AdminService, AuthService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { FileNamePipe } from '../../../shared/pipes/file-name.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-admin-approval',
  standalone: true,
  imports: [
    IconComponent,
    EmptyStateComponent,
    TimeAgoPipe,
    ThbPipe,
    FileNamePipe,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './approval.page.html',
  styleUrl: './approval.page.scss',
})
export class AdminApprovalPage {
  readonly admin = inject(AdminService);
  private readonly message = inject(NzMessageService);
  private readonly auth = inject(AuthService);

  private suppressAutoSearch = false;
  private readonly autoSearchDebounceMs = 400;

  readonly selectedId = signal<string>('');
  readonly isPreviewLocked = signal<boolean>(false);
  readonly lockedId = signal<string>('');
  readonly titleQuery = signal<string>('');
  readonly sellerNameQuery = signal<string>('');
  readonly postedFrom = signal<string>(''); // yyyy-mm-dd
  readonly postedTo = signal<string>(''); // yyyy-mm-dd

  readonly previewDetail = signal<AdminDocumentDetail | null>(null);
  readonly previewDetailLoading = signal(false);

  readonly pending = computed(() => this.admin.pendingDocuments());

  readonly selected = computed(() => {
    const list = this.pending();
    if (!list.length) return null;
    const preferredId = this.isPreviewLocked() ? this.lockedId() : this.selectedId();
    const id = preferredId || list[0].id;
    return list.find((d) => d.id === id) ?? list[0];
  });

  readonly heroCoverUrl = computed(() => {
    const pd = this.previewDetail();
    const c = pd?.coverUrl?.trim();
    if (c) return resolvePublicUrl(c.replaceAll('%2F', '/'));
    return this.selected()?.cover ?? '';
  });

  /** Returns a fresh unchecked list — used for initialization and reset. */
  private freshChecks(): { label: string; checked: boolean }[] {
    return [
      { label: 'เอกสารตรงกับคำอธิบาย', checked: false },
      { label: 'ไม่ละเมิดลิขสิทธิ์', checked: false },
      { label: 'มีลายน้ำในไฟล์ตัวอย่าง', checked: false },
      { label: 'ภาพหน้าปกเหมาะสม', checked: false },
      { label: 'ราคาเหมาะสมกับเนื้อหา', checked: false },
    ];
  }

  /** Admin manually ticks each item before approving. */
  readonly manualChecks = signal<{ label: string; checked: boolean }[]>(this.freshChecks());

  /** True only when every checklist item is ticked. */
  readonly allChecked = computed(() => this.manualChecks().every((c) => c.checked));

  toggleCheck(index: number): void {
    this.manualChecks.update((items) =>
      items.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item)),
    );
  }

  constructor() {
    effect((onCleanup) => {
      const id = this.selected()?.id;
      if (!id) {
        this.previewDetail.set(null);
        this.previewDetailLoading.set(false);
        return;
      }
      let cancelled = false;
      this.previewDetailLoading.set(true);
      void (async () => {
        try {
          const row = await this.admin.fetchAdminDocumentDetail(id);
          if (cancelled) return;
          this.previewDetail.set(row);
        } finally {
          if (!cancelled) this.previewDetailLoading.set(false);
        }
      })();
      onCleanup(() => {
        cancelled = true;
      });
    });

    let initialized = false;
    effect((onCleanup) => {
      const title = this.titleQuery().trim() || undefined;
      const sellerName = this.sellerNameQuery().trim() || undefined;
      const postedFrom = this.postedFrom() || undefined;
      const postedTo = this.postedTo() || undefined;

      if (this.suppressAutoSearch) return;

      // First run: load immediately so entering page shows data.
      if (!initialized) {
        initialized = true;
        void this.admin.refreshPendingDocuments({ title, sellerName, postedFrom, postedTo });
        return;
      }

      const timer = setTimeout(() => {
        void this.admin.refreshPendingDocuments({ title, sellerName, postedFrom, postedTo });
      }, this.autoSearchDebounceMs);

      onCleanup(() => clearTimeout(timer));
    });

    // Reset the manual checklist whenever the admin selects a different document.
    effect(() => {
      const id = this.selected()?.id;
      if (id) {
        untracked(() => {
          this.manualChecks.set(this.freshChecks());
        });
      }
    });
  }

  select(id: string): void {
    if (this.isPreviewLocked()) return;
    this.selectedId.set(id);
  }

  toggleLock(): void {
    const next = !this.isPreviewLocked();
    this.isPreviewLocked.set(next);
    if (next) {
      const cur = this.selected();
      this.lockedId.set(cur?.id ?? '');
    } else {
      this.lockedId.set('');
    }
  }

  async runSearch(): Promise<void> {
    await this.admin.refreshPendingDocuments({
      title: this.titleQuery().trim() || undefined,
      sellerName: this.sellerNameQuery().trim() || undefined,
      postedFrom: this.postedFrom() || undefined,
      postedTo: this.postedTo() || undefined,
    });
  }

  async resetSearch(): Promise<void> {
    this.suppressAutoSearch = true;
    try {
      this.titleQuery.set('');
      this.sellerNameQuery.set('');
      this.postedFrom.set('');
      this.postedTo.set('');
      await this.admin.refreshPendingDocuments();
    } finally {
      this.suppressAutoSearch = false;
    }
  }

  readonly resolvePublicUrl = resolvePublicUrl;

  galleryImageSrc(imageUrl: string | null | undefined): string {
    const raw = (imageUrl ?? '').trim();
    if (!raw) return '';
    return resolvePublicUrl(raw.replaceAll('%2F', '/'));
  }

  /**
   * F-xx: "ไฟล์ขาย"/"ไฟล์หลัก" are protected document files — they 404 on a direct `<a href>`
   * link because the browser navigation carries no JWT. `hasSaleFile`/`hasMainFile` stay
   * synchronous (template still gates the button/link on "is there a key at all"); the actual
   * download URL is fetched on click through `AdminService.getFileDownloadUrl`, which calls the
   * authenticated presigned-URL endpoint before opening the tab.
   */
  hasSaleFile(): boolean {
    return !!this.previewDetail()?.fileStorageKey?.trim();
  }

  hasMainFile(storageKey: string | null | undefined): boolean {
    return !!storageKey?.trim();
  }

  async openSaleFile(): Promise<void> {
    const key = this.previewDetail()?.fileStorageKey?.trim();
    if (!key) return;
    const rawUrl = await this.admin.getFileDownloadUrl(key, true);
    const targetUrl = rawUrl || `/api/files/download/${encodeURIComponent(key)}?inline=true`;
    const url = resolveDownloadUrl(targetUrl, this.auth.accessToken(), null, true);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async downloadSaleFile(): Promise<void> {
    const key = this.previewDetail()?.fileStorageKey?.trim();
    if (!key) return;
    const rawUrl = await this.admin.getFileDownloadUrl(key, false);
    const targetUrl = rawUrl || `/api/files/download/${encodeURIComponent(key)}`;
    const url = resolveDownloadUrl(targetUrl, this.auth.accessToken(), null, false);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async openMainFile(storageKey: string | null | undefined): Promise<void> {
    const key = storageKey?.trim();
    if (!key) return;
    const rawUrl = await this.admin.getFileDownloadUrl(key, true);
    const targetUrl = rawUrl || `/api/files/download/${encodeURIComponent(key)}?inline=true`;
    const url = resolveDownloadUrl(targetUrl, this.auth.accessToken(), null, true);
    if (url) window.open(url, '_blank', 'noopener');
  }

  async downloadMainFile(storageKey: string | null | undefined): Promise<void> {
    const key = storageKey?.trim();
    if (!key) return;
    const rawUrl = await this.admin.getFileDownloadUrl(key, false);
    const targetUrl = rawUrl || `/api/files/download/${encodeURIComponent(key)}`;
    const url = resolveDownloadUrl(targetUrl, this.auth.accessToken(), null, false);
    if (url) window.open(url, '_blank', 'noopener');
  }

  readonly prescreening = signal<boolean>(false);

  async runPrescreen(id: string): Promise<void> {
    if (this.prescreening()) return;
    this.prescreening.set(true);
    try {
      await this.admin.prescreenDocument(id);
      this.message.success('ประเมินความเสี่ยงด้วย AI เรียบร้อย');
    } catch {
      this.message.error('ประเมินความเสี่ยงด้วย AI ไม่สำเร็จ');
    } finally {
      this.prescreening.set(false);
    }
  }

  async approve(id: string, title: string): Promise<void> {
    try {
      await this.admin.approveDocument(id);
      this.message.success(`อนุมัติ "${title}" เรียบร้อย`);
      this.previewDetail.set(null);
      this.selectedId.set('');
      if (this.lockedId() === id) this.lockedId.set('');
    } catch {
      /* ApiFailureReporter ใน AdminService แจ้งแล้ว */
    }
  }

  async reject(id: string, title: string): Promise<void> {
    const reason =
      prompt('เหตุผลในการปฏิเสธ', 'ไม่ผ่านเกณฑ์คุณภาพ')?.trim() ||
      'ไม่ผ่านเกณฑ์คุณภาพ';
    try {
      await this.admin.rejectDocument(id, reason);
      this.message.warning(`ปฏิเสธ "${title}" แล้ว`);
      this.previewDetail.set(null);
      this.selectedId.set('');
      if (this.lockedId() === id) this.lockedId.set('');
    } catch {
      /* ApiFailureReporter ใน AdminService แจ้งแล้ว */
    }
  }
}

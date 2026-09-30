import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import type { AdminDocumentDetail } from '../../../core/api/admin-documents.api';
import { resolvePublicUrl, resolveDownloadUrl, downloadUrlForStorageKey } from '../../../core/api-runtime';
import { downloadFileFromUrl, openFileFromUrl } from '../../../core/file-download';
import { AdminService, AuthService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { FileNamePipe } from '../../../shared/pipes/file-name.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { StickyActionBarComponent } from '../../../shared/components/sticky-action-bar/sticky-action-bar.component';
import { AdminFilterPanelComponent } from '../shared/admin-filter-panel/admin-filter-panel.component';

@Component({
  selector: 'app-admin-approval',
  standalone: true,
  imports: [
    FormsModule,
    NzModalModule,
    IconComponent,
    EmptyStateComponent,
    TimeAgoPipe,
    ThbPipe,
    FileNamePipe,
    ImgFallbackDirective,
    TranslatePipe,
    StickyActionBarComponent,
    AdminFilterPanelComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './approval.page.html',
  styleUrl: './approval.page.scss',
})
export class AdminApprovalPage {
  readonly admin = inject(AdminService);
  private readonly message = inject(NzMessageService);
  private readonly auth = inject(AuthService);
  private readonly translation = inject(TranslationService);
  private readonly injector = inject(Injector);

  /** Page offset of the list when a row opened the <1024 detail view (R-25 / F138). */
  private listScrollY = 0;

  private suppressAutoSearch = false;
  private readonly autoSearchDebounceMs = 400;

  readonly selectedId = signal<string>('');
  readonly isPreviewLocked = signal<boolean>(false);
  readonly lockedId = signal<string>('');
  readonly titleQuery = signal<string>('');
  readonly sellerNameQuery = signal<string>('');
  readonly postedFrom = signal<string>(''); // yyyy-mm-dd
  readonly postedTo = signal<string>(''); // yyyy-mm-dd

  /**
   * responsive-ui §U4-3: below 1024px the list and the preview are two separate views — this is
   * true while the preview view is showing. Pure presentation state; >=1024 shows both columns.
   */
  readonly detailOpen = signal(false);

  /** Non-default filters inside the phone filter sheet (title search stays outside). */
  readonly activeFilterCount = computed(
    () => [this.sellerNameQuery().trim(), this.postedFrom(), this.postedTo()].filter((v) => !!v).length,
  );

  readonly previewDetail = signal<AdminDocumentDetail | null>(null);
  readonly previewDetailLoading = signal(false);
  readonly selectedPreviewImage = signal(0);

  readonly pending = computed(() => this.admin.pendingDocuments());

  /**
   * Header count (F87): the server total of the current queue query, not the loaded rows (the pager
   * holds 50 per page). Falls back to the loaded rows until the first page answers.
   */
  readonly pendingTotal = computed(() => this.admin.pendingTotal() ?? this.pending().length);

  /**
   * responsive-ui v1.4 R-17 (G-27, F88): four distinct list states. "ไม่มีเอกสารรออนุมัติ" is only
   * for a queue that really answered empty — never while the search is pending (the queue total is
   * still unknown), and never after it failed (that shows a message and a retry instead).
   */
  readonly listState = computed<'loading' | 'error' | 'empty' | 'data'>(() => {
    if (this.pending().length > 0) return 'data';
    const status = this.admin.pendingState().status;
    if (status === 'error') return 'error';
    if (status === 'loading' || this.admin.pendingTotal() === null) return 'loading';
    return 'empty';
  });

  /** Error-state retry: re-issues the same pending search with the current filters. */
  retryList(): void {
    void this.runSearch();
  }

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

  readonly marketplacePreviewImages = computed(() => {
    const pd = this.previewDetail();
    const images =
      pd?.galleryItems?.map((g) => this.galleryImageSrc(g.imageUrl)).filter(Boolean)
      ?? pd?.galleryUrls?.map((url) => resolvePublicUrl(url.replaceAll('%2F', '/'))).filter(Boolean)
      ?? [];
    const cover = this.heroCoverUrl();
    return images.length > 0 ? images : cover ? [cover] : [];
  });

  readonly selectedPreviewImageUrl = computed(() => {
    const images = this.marketplacePreviewImages();
    return images[this.selectedPreviewImage()] ?? images[0] ?? '';
  });

  /** Returns a fresh unchecked list — used for initialization and reset. */
  private freshChecks(): { label: string; checked: boolean }[] {
    return [
      { label: this.translation.t('admin.checklistDocMatch'), checked: false },
      { label: this.translation.t('admin.checklistNoCopyright'), checked: false },
      { label: this.translation.t('admin.checklistWatermark'), checked: false },
      { label: this.translation.t('admin.checklistCoverOk'), checked: false },
      { label: this.translation.t('admin.checklistPriceOk'), checked: false },
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
          this.selectedPreviewImage.set(0);
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

      // First run: load immediately so entering page shows data. `untracked`: the pager reads its
      // own state/total signals synchronously before its first await, and tracking them here made
      // the queue's own loading → done/error flip re-run this effect — a second (debounced) search
      // on every page load, and a second error toast when it failed (R-17 / G-27).
      if (!initialized) {
        initialized = true;
        untracked(() => void this.admin.refreshPendingDocuments({ title, sellerName, postedFrom, postedTo }));
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

  /** List row tap: select it and (below 1024px) switch to the preview view. */
  openDetail(id: string): void {
    if (this.isPreviewLocked()) return;
    this.select(id);
    // Only the <1024 two-view layout swaps the list out; remember where the list was so the back
    // button can return there (F138). At >=1024 both columns stay and the page does not move.
    const twoView = !this.detailOpen() && typeof window !== 'undefined' && window.innerWidth < 1024;
    if (twoView) this.listScrollY = window.scrollY;
    this.detailOpen.set(true);
    if (twoView) this.scrollPageTo(0);
  }

  /** Preview view back button (below 1024px): back to the list, at the offset it was left at. */
  closeDetail(): void {
    this.detailOpen.set(false);
    const y = this.listScrollY;
    this.listScrollY = 0;
    // The list is display:none while the detail shows, so the page is too short to hold the old
    // offset until the list has rendered again.
    afterNextRender(() => this.scrollPageTo(y), { injector: this.injector });
  }

  private scrollPageTo(top: number): void {
    if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return;
    try {
      window.scrollTo({ top, behavior: 'instant' });
    } catch {
      /* jsdom */
    }
  }

  /** Filter sheet "ล้างทั้งหมด" — filters are live, so the list refreshes on its own. */
  clearFilters(): void {
    this.sellerNameQuery.set('');
    this.postedFrom.set('');
    this.postedTo.set('');
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
   * authenticated presigned-URL endpoint before the file itself is fetched.
   */
  hasSaleFile(): boolean {
    return !!this.previewDetail()?.fileStorageKey?.trim();
  }

  hasMainFile(storageKey: string | null | undefined): boolean {
    return !!storageKey?.trim();
  }

  /**
   * Opening and downloading both used to pre-open a blank tab and navigate it after the
   * presigned-URL call, with `catch { win?.close(); }` swallowing every failure. When the
   * browser blocked that tab — `window.open` returns `null` — the admin got no file, no tab and
   * no message whatsoever. Both paths now fetch the bytes first: the download saves them, the
   * open hands them to a tab as an object URL and falls back to saving when the popup is
   * blocked, so the admin always ends up with the file and always hears about a failure.
   */
  async openSaleFile(): Promise<void> {
    const key = this.previewDetail()?.fileStorageKey?.trim();
    if (!key) return;
    await this.openFile(key);
  }

  async downloadSaleFile(): Promise<void> {
    const key = this.previewDetail()?.fileStorageKey?.trim();
    if (!key) return;
    await this.downloadFile(key);
  }

  async openMainFile(storageKey: string | null | undefined): Promise<void> {
    const key = storageKey?.trim();
    if (!key) return;
    await this.openFile(key);
  }

  async downloadMainFile(storageKey: string | null | undefined): Promise<void> {
    const key = storageKey?.trim();
    if (!key) return;
    await this.downloadFile(key);
  }

  /** Resolves the authenticated URL for a storage key; `''` when even that failed. */
  private async resolveFileUrl(key: string, inline: boolean): Promise<string> {
    let rawUrl: string | null = null;
    try {
      rawUrl = await this.admin.getFileDownloadUrl(key, inline);
    } catch {
      rawUrl = null;
    }
    const targetUrl = rawUrl || downloadUrlForStorageKey(key);
    return resolveDownloadUrl(targetUrl, this.auth.accessToken(), null, inline);
  }

  private async downloadFile(key: string): Promise<void> {
    const url = await this.resolveFileUrl(key, false);
    if (!url || !(await downloadFileFromUrl(url))) {
      this.message.error(this.translation.t('admin.fileDownloadFailed'));
    }
  }

  private async openFile(key: string): Promise<void> {
    const url = await this.resolveFileUrl(key, true);
    const outcome = url ? await openFileFromUrl(url) : 'failed';
    if (outcome === 'failed') {
      this.message.error(this.translation.t('admin.fileDownloadFailed'));
    } else if (outcome === 'downloaded') {
      this.message.info(this.translation.t('admin.filePopupBlockedDownloaded'));
    }
  }

  readonly prescreening = signal<boolean>(false);

  async runPrescreen(id: string): Promise<void> {
    if (this.prescreening()) return;
    this.prescreening.set(true);
    try {
      await this.admin.prescreenDocument(id);
      this.message.success(this.translation.t('admin.prescreenSuccess'));
    } catch {
      this.message.error(this.translation.t('admin.prescreenFailed'));
    } finally {
      this.prescreening.set(false);
    }
  }

  async approve(id: string, title: string): Promise<void> {
    try {
      await this.admin.approveDocument(id);
      this.message.success(this.translation.t('admin.approveDocSuccess', { title }));
      this.detailOpen.set(false);
      this.previewDetail.set(null);
      this.selectedId.set('');
      if (this.lockedId() === id) this.lockedId.set('');
    } catch {
      /* ApiFailureReporter ใน AdminService แจ้งแล้ว */
    }
  }

  readonly rejectModalVisible = signal(false);
  readonly rejectTarget = signal<{ id: string; title: string } | null>(null);
  readonly rejectReason = signal('');
  readonly rejectSubmitting = signal(false);

  openRejectModal(id: string, title: string): void {
    this.rejectTarget.set({ id, title });
    this.rejectReason.set(this.translation.t('admin.defaultRejectReason'));
    this.rejectModalVisible.set(true);
  }

  closeRejectModal(): void {
    this.rejectModalVisible.set(false);
    this.rejectTarget.set(null);
  }

  async confirmReject(): Promise<void> {
    const target = this.rejectTarget();
    if (!target) return;
    const reason = this.rejectReason().trim() || this.translation.t('admin.defaultRejectReason');
    this.rejectSubmitting.set(true);
    try {
      await this.admin.rejectDocument(target.id, reason);
      this.message.warning(this.translation.t('admin.rejectDocSuccess', { title: target.title }));
      this.detailOpen.set(false);
      this.previewDetail.set(null);
      this.selectedId.set('');
      if (this.lockedId() === target.id) this.lockedId.set('');
      this.closeRejectModal();
    } catch {
      /* ApiFailureReporter ใน AdminService แจ้งแล้ว */
    } finally {
      this.rejectSubmitting.set(false);
    }
  }

  reject(id: string, title: string): void {
    this.openRejectModal(id, title);
  }
}

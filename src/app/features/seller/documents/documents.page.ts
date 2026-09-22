import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { resolveDownloadUrl } from '../../../core/api-runtime';
import { downloadFileFromUrl } from '../../../core/file-download';
import { placeholderCoverUrl } from '../../../core/brand-assets';
import { DocumentItem } from '../../../core/models';
import { AuthService, SellerService } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

@Component({
  selector: 'app-seller-documents',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    EmptyStateComponent,
    IconComponent,
    PaginationComponent,
    NzModalModule,
    ThbPipe,
    CompactPipe,
    TimeAgoPipe,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.scss',
})
export class SellerDocumentsPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly translation = inject(TranslationService);

  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly items = signal<DocumentItem[]>([]);
  readonly loading = signal(false);

  readonly searchInput = signal<string>('');
  readonly search = signal<string>('');
  readonly status = signal<'all' | 'approved' | 'pending' | 'rejected' | 'draft'>(
    'all',
  );
  readonly coverFallback = placeholderCoverUrl();

  /**
   * document-preview-access-fixes v1 §4.2 (D3) — id of the row whose original file is being
   * prepared, so only that row's download button shows the busy state.
   */
  readonly downloadingId = signal<string | null>(null);

  readonly statuses = computed(() => [
    { value: 'all' as const, label: this.translation.t('seller.statusAll') },
    { value: 'draft' as const, label: this.translation.t('seller.statusDraftLabel') },
    { value: 'approved' as const, label: this.translation.t('seller.statusApprovedLabel') },
    { value: 'pending' as const, label: this.translation.t('seller.statusPendingLabel') },
    { value: 'rejected' as const, label: this.translation.t('seller.statusRejectedLabel') },
  ]);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await this.seller.listDocumentsPaged({
        status: this.status(),
        search: this.search(),
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } finally {
      this.loading.set(false);
    }
  }

  onStatusChange(newStatus: 'all' | 'approved' | 'pending' | 'rejected' | 'draft'): void {
    this.status.set(newStatus);
    this.page.set(1);
    void this.reload();
  }

  applySearch(): void {
    const q = this.searchInput().trim();
    this.search.set(q);
    this.page.set(1);
    void this.reload();
  }

  clearSearch(): void {
    this.searchInput.set('');
    this.search.set('');
    this.page.set(1);
    void this.reload();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.reload();
  }

  statusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return this.translation.t('seller.statusApproved');
      case 'pending':
        return this.translation.t('seller.statusPending');
      case 'rejected':
        return this.translation.t('seller.statusRejected');
      case 'draft':
        return this.translation.t('seller.statusDraft');
      default:
        return status || '—';
    }
  }

  statusPillClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return 'pill-green';
      case 'pending':
        return 'pill-amber';
      case 'rejected':
        return 'pill-rose';
      case 'draft':
        return 'pill-soft';
      default:
        return 'pill-soft';
    }
  }

  view(doc: DocumentItem): void {
    const st = (doc.status || '').toLowerCase();
    if (st === 'approved') {
      this.router.navigate(['/document', doc.id]);
      return;
    }
    this.router.navigate(['/seller/upload'], { queryParams: { id: doc.id } });
  }

  onCoverError(ev: Event): void {
    const el = ev.target as HTMLImageElement | null;
    if (el) el.src = this.coverFallback;
  }

  edit(id: string): void {
    this.router.navigate(['/seller/upload'], { queryParams: { id } });
  }

  /**
   * document-preview-access-fixes v1 §4.2 (D3) — download the seller's own original file.
   *
   * No popup is involved anymore: the blank-tab-then-navigate pattern silently did nothing
   * whenever the browser blocked the tab (`window.open` returns `null`), which is exactly what
   * a seller hit in practice. `downloadFileFromUrl` fetches the bytes and saves them through a
   * hidden anchor instead.
   *
   * That single fetch is also the probe this method used to run separately: the presigned URL
   * resolves even when the storage object is gone (old seed rows whose key is prefixed `it/`),
   * in which case the real GET answers `404 application/problem+json` — the helper returns
   * `false` and the seller is told about it, instead of being dropped on a page of raw JSON.
   * The file is no longer fetched twice.
   */
  async download(doc: DocumentItem): Promise<void> {
    this.downloadingId.set(doc.id);
    try {
      const res = await this.seller.getDocumentDownloadUrl(doc.id);
      if (!res || 'error' in res) {
        if (res && res.error === 'no_file') {
          this.message.warning(this.translation.t('seller.downloadNoFile'));
        } else {
          this.message.error(this.translation.t('seller.downloadFailed'));
        }
        return;
      }

      const url = resolveDownloadUrl(res.url, this.auth.accessToken());
      const saved = await downloadFileFromUrl(url, doc.title);
      if (!saved) {
        this.message.error(this.translation.t('seller.downloadMissingObject'));
      }
    } finally {
      this.downloadingId.set(null);
    }
  }

  confirmRemove(id: string, title: string): void {
    this.modal.confirm({
      nzTitle: this.translation.t('seller.confirmDeleteTitle'),
      nzContent: this.translation.t('seller.confirmDeleteContent', { title }),
      nzOkText: this.translation.t('common.delete'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel'),
      nzOnOk: async () => {
        await this.seller.remove(id);
        this.message.success(this.translation.t('seller.deleteSuccess', { title }));
      },
    });
  }
}

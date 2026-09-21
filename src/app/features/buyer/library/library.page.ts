import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import type { BuyerDocumentVersionInfo } from '../../../core/models';
import {
  AuthService,
  LibraryFilter,
  LibraryService,
  LoyaltyService,
  SubmitReviewRequest,
} from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

@Component({
  selector: 'app-buyer-library',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    NzDrawerModule,
    NzModalModule,
    NzTooltipModule,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    StatCardComponent,
    ImgFallbackDirective,
    ThbPipe,
    TimeAgoPipe,
    CompactPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './library.page.html',
  styleUrl: './library.page.scss',
})
export class BuyerLibraryPage {
  readonly library = inject(LibraryService);
  readonly loyalty = inject(LoyaltyService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  /**
   * Client-side search box next to the filter tabs — filters the already-loaded page of
   * `library.library()` by title, no API call. Server-side tab filtering (`setLibraryFilter`)
   * is unrelated and still re-queries the API as before.
   */
  readonly searchQuery = signal('');
  readonly expandedDocumentIds = signal<ReadonlySet<string>>(new Set());

  readonly filteredLibrary = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.library.library();
    return this.library.library().filter((item) => item.document.title.toLowerCase().includes(q));
  });

  isExpanded(documentId: string): boolean {
    return this.expandedDocumentIds().has(documentId);
  }

  toggleExpanded(documentId: string): void {
    this.expandedDocumentIds.update((current) => {
      const next = new Set(current);
      if (next.has(documentId)) next.delete(documentId);
      else next.add(documentId);
      return next;
    });
  }

  /**
   * watermark-completion v1 §4.4: the download itself is unchanged — this wrapper only surfaces
   * the backend's `watermarkNotice` (which carries the buyer's own `WMK-XXXXXXXX` code) through
   * the same NG-ZORRO message service the rest of the app uses. Shown a little longer than the
   * default because the code in it is worth reading.
   */
  async download(documentId: string): Promise<void> {
    const win = window.open('', '_blank');
    try {
      const result = await this.library.download(documentId);
      const url = result?.downloadUrl;
      if (url && win) {
        win.location.href = url;
      } else {
        win?.close();
      }
      const notice = result?.watermarkNotice;
      if (notice) {
        this.message.info(notice, { nzDuration: 8000 });
      }
    } catch {
      win?.close();
    }
  }

  /**
   * library-is-reviewed v1: AC-9 — switching tabs re-queries the API through
   * `LibraryService.setLibraryFilter`, it never filters `library.library()` in place.
   */
  readonly tabs: { value: LibraryFilter; labelKey: string }[] = [
    { value: 'all', labelKey: 'library.tabAll' },
    { value: 'unreviewed', labelKey: 'library.tabUnreviewed' },
    { value: 'unread', labelKey: 'library.tabUnread' },
  ];

  readonly reviewModal = signal<{ documentId: string; title: string } | null>(null);
  readonly reviewForm = signal<SubmitReviewRequest>({ rating: 5, comment: '' });

  /** loyalty-points v1 §4: "ดูประวัติคะแนน" opens this drawer, listing `loyalty.ledger()`. */
  readonly ledgerDrawerOpen = signal(false);

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/library' } });
      return;
    }
    void Promise.all([
      this.library.refreshLibrary(),
      this.library.refreshOrders(),
      this.loyalty.refreshSummary(),
    ]);
  }

  openLedgerDrawer(): void {
    this.ledgerDrawerOpen.set(true);
    void this.loyalty.loadLedgerFirst();
  }

  closeLedgerDrawer(): void {
    this.ledgerDrawerOpen.set(false);
  }

  /**
   * `myRating` prefills the stars when editing an existing review — decision 2 in
   * docs/contracts/library-is-reviewed.md is what `myRating` exists for. Comment text is not
   * prefilled (out of scope, see spec section 5): the buyer retypes it.
   */
  openReviewModal(documentId: string, title: string, myRating?: number): void {
    this.reviewModal.set({ documentId, title });
    this.reviewForm.set({ rating: myRating ?? 5, comment: '' });
    this.library.resetReviewState();
  }

  closeReviewModal(): void {
    this.reviewModal.set(null);
  }

  setRating(rating: number): void {
    this.reviewForm.update(f => ({ ...f, rating }));
  }

  async submitReview(): Promise<void> {
    const modal = this.reviewModal();
    if (!modal) return;

    const result = await this.library.submitReview(modal.documentId, this.reviewForm());
    if (result) {
      setTimeout(() => this.closeReviewModal(), 1500);
    }
  }

  // document-versioning v1 §4.2: version history modal for library items
  readonly versionsModal = signal<{ documentId: string; title: string } | null>(null);
  readonly versionsList = signal<BuyerDocumentVersionInfo[]>([]);
  readonly versionsLoading = signal(false);

  async openVersionsModal(documentId: string, title: string): Promise<void> {
    this.versionsModal.set({ documentId, title });
    this.versionsLoading.set(true);
    try {
      const list = await this.library.getDocumentVersions(documentId);
      this.versionsList.set(list);
    } finally {
      this.versionsLoading.set(false);
    }
  }

  closeVersionsModal(): void {
    this.versionsModal.set(null);
  }

  navigateToDetail(documentId: string): void {
    if (!documentId) return;
    this.router.navigate(['/document', documentId]);
  }

  hasRealCover(coverUrl?: string | null): boolean {
    if (!coverUrl) return false;
    const lower = coverUrl.toLowerCase();
    return !lower.includes('placeholder-cover') && !lower.includes('default-logo');
  }
}

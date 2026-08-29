import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzDrawerModule } from 'ng-zorro-antd/drawer';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
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

@Component({
  selector: 'app-buyer-library',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    NzDrawerModule,
    NzTooltipModule,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    StatCardComponent,
    ThbPipe,
    TimeAgoPipe,
    CompactPipe,
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

  /**
   * library-is-reviewed v1: AC-9 — switching tabs re-queries the API through
   * `LibraryService.setLibraryFilter`, it never filters `library.library()` in place.
   */
  readonly tabs: { value: LibraryFilter; label: string }[] = [
    { value: 'all', label: 'ทั้งหมด' },
    { value: 'unreviewed', label: 'ยังไม่ได้รีวิว' },
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
}

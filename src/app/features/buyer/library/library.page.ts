import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, LibraryService, SubmitReviewRequest } from '../../../core/services';
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
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly tab = signal<'all' | 'recent'>('all');
  readonly tabs = [
    { value: 'all' as const, label: 'ทั้งหมด' },
    { value: 'recent' as const, label: 'เพิ่งดาวน์โหลด' },
  ];

  readonly reviewModal = signal<{ documentId: string; title: string } | null>(null);
  readonly reviewForm = signal<SubmitReviewRequest>({ rating: 5, comment: '' });

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/library' } });
      return;
    }
    void Promise.all([this.library.refreshLibrary(), this.library.refreshOrders()]);
  }

  openReviewModal(documentId: string, title: string): void {
    this.reviewModal.set({ documentId, title });
    this.reviewForm.set({ rating: 5, comment: '' });
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

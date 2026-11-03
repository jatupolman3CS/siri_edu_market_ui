import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { resolveAvatarUrl, resolveCoverUrl } from '../../../core/brand-assets';
import { SellerService, type SellerReviewStats } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { SmartDecimalPipe } from '../../../shared/pipes/smart-decimal.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

type ReviewRow = {
  id: string;
  documentId?: string;
  docTitle: string;
  documentCoverUrl?: string | null;
  documentSlug?: string | null;
  buyerName: string;
  buyerAvatar: string;
  rating: number;
  comment: string;
  createdAt: string;
  sellerReplyText?: string | null;
  sellerRepliedAt?: string | null;
};

@Component({
  selector: 'app-seller-reviews',
  standalone: true,
  imports: [
    RouterLink,
    EmptyStateComponent,
    IconComponent,
    RatingStarsComponent,
    PaginationComponent,
    TimeAgoPipe,
    SmartDecimalPipe,
    ImgFallbackDirective,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reviews.page.html',
  styleUrl: './reviews.page.scss',
})
export class SellerReviewsPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

  readonly items = signal<ReviewRow[]>([]);
  /** security-review-followups v1 §4.2 (FIX-07): aggregates over ALL reviews from the backend. */
  readonly serverStats = signal<SellerReviewStats | null>(null);
  readonly loading = signal<boolean>(false);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  readonly replyingReviewId = signal<string | null>(null);
  readonly replyDraft = signal<string>('');
  readonly replySubmitting = signal<boolean>(false);

  /**
   * Stats cards — backend aggregate over ALL of the seller's reviews (FIX-07, AC-07-9), so paging
   * or changing page size never moves the numbers. Stats unavailable → `0%` / `—` (AC-07-10).
   */
  readonly reviewStats = computed(() => {
    const s = this.serverStats();
    if (!s) {
      return { positivePct: 0, replyPct: 0, avgHours: null as number | null };
    }
    return { positivePct: s.positivePercent, replyPct: s.replyPercent, avgHours: s.averageReplyHours };
  });

  constructor() {
    void this.seller.refreshDashboard();
    void this.load();
    void this.loadStats();
  }

  async loadStats(): Promise<void> {
    this.serverStats.set(await this.seller.loadReviewStats());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const paged = await this.seller.loadReviewsPaged(this.page(), this.pageSize());
      const list: ReviewRow[] = paged.items.map((r) => ({
        id: r.id,
        documentId: r.documentId,
        docTitle: r.documentTitle,
        documentCoverUrl: resolveCoverUrl(r.documentCoverUrl),
        documentSlug: r.documentSlug,
        buyerName: r.buyerName,
        buyerAvatar: resolveAvatarUrl(r.buyerAvatarUrl),
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        sellerReplyText: r.sellerReplyText,
        sellerRepliedAt: r.sellerRepliedAt,
      }));
      this.items.set(list);
      this.totalCount.set(paged.totalCount);
    } finally {
      this.loading.set(false);
    }
  }

  startReply(r: ReviewRow): void {
    this.replyingReviewId.set(r.id);
    this.replyDraft.set(r.sellerReplyText ?? '');
  }

  cancelReply(): void {
    this.replyingReviewId.set(null);
    this.replyDraft.set('');
  }

  async submitReply(reviewId: string): Promise<void> {
    const text = this.replyDraft().trim();
    if (!text) {
      this.message.warning(this.translation.t('seller.pleaseEnterReply'));
      return;
    }
    this.replySubmitting.set(true);
    try {
      const updated = await this.seller.replyToReview(reviewId, text);
      if (updated) {
        this.items.update((list) =>
          list.map((row) =>
            row.id === reviewId
              ? { ...row, sellerReplyText: updated.sellerReplyText, sellerRepliedAt: updated.sellerRepliedAt }
              : row
          )
        );
        void this.loadStats();
        this.message.success(this.translation.t('seller.replySuccess'));
        this.replyingReviewId.set(null);
        this.replyDraft.set('');
      }
    } catch {
      this.message.error(this.translation.t('seller.replyFailed'));
    } finally {
      this.replySubmitting.set(false);
    }
  }

  onPageChange(p: number): void {
    if (p === this.page()) return;
    this.page.set(p);
    void this.load();
  }

  onPageSizeChange(s: number): void {
    if (s === this.pageSize()) return;
    this.pageSize.set(s);
    this.page.set(1);
    void this.load();
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { resolveAvatarUrl, resolveCoverUrl } from '../../../core/brand-assets';
import { SellerService } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

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
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reviews.page.html',
  styleUrl: './reviews.page.scss',
})
export class SellerReviewsPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);

  readonly items = signal<ReviewRow[]>([]);
  readonly statsRows = signal<ReviewRow[] | null>(null);
  readonly loading = signal<boolean>(false);
  readonly page = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  readonly replyingReviewId = signal<string | null>(null);
  readonly replyDraft = signal<string>('');
  readonly replySubmitting = signal<boolean>(false);

  /** Aggregates from all reviews (up to 100), avoiding pagination-based statistical fluctuations. */
  readonly reviewStats = computed(() => {
    const rows = this.statsRows() ?? this.items();
    const n = rows.length;
    if (!n) {
      return { positivePct: 0, replyPct: 0, avgHours: null as number | null };
    }
    const pos = rows.filter((r) => (r.rating ?? 0) >= 4).length;
    const replied = rows.filter((r) => (r.sellerReplyText ?? '').trim().length > 0).length;
    const hoursDiffs: number[] = [];
    for (const r of rows) {
      if (!r.sellerRepliedAt || !r.createdAt) continue;
      const end = new Date(r.sellerRepliedAt).getTime();
      const start = new Date(r.createdAt).getTime();
      if (!Number.isFinite(end) || !Number.isFinite(start)) continue;
      const h = (end - start) / 3_600_000;
      if (h >= 0) hoursDiffs.push(h);
    }
    const avgHours =
      hoursDiffs.length > 0
        ? hoursDiffs.reduce((s, x) => s + x, 0) / hoursDiffs.length
        : null;
    return {
      positivePct: Math.round((pos / n) * 100),
      replyPct: Math.round((replied / n) * 100),
      avgHours,
    };
  });

  constructor() {
    void this.seller.refreshDashboard();
    void this.load();
    void this.loadAllStats();
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
      if (paged.totalCount <= this.pageSize()) {
        this.statsRows.set(list);
      }
    } finally {
      this.loading.set(false);
    }
  }

  async loadAllStats(): Promise<void> {
    try {
      const all = await this.seller.loadReviews(1, 100);
      const list: ReviewRow[] = all.map((r) => ({
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
      this.statsRows.set(list);
    } catch {
      // Best-effort; falls back to current page items
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
      this.message.warning('กรุณาระบุข้อความตอบกลับ');
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
        this.statsRows.update((list) =>
          list
            ? list.map((row) =>
                row.id === reviewId
                  ? { ...row, sellerReplyText: updated.sellerReplyText, sellerRepliedAt: updated.sellerRepliedAt }
                  : row
              )
            : null
        );
        this.message.success('ตอบกลับรีวิวสำเร็จ');
        this.replyingReviewId.set(null);
        this.replyDraft.set('');
      }
    } catch {
      this.message.error('ไม่สามารถตอบกลับรีวิวได้ กรุณาลองใหม่อีกครั้ง');
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

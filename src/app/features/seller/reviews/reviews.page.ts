import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { resolveAvatarUrl } from '../../../core/brand-assets';
import { SellerService } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

type ReviewRow = {
  id: string;
  docTitle: string;
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
  imports: [RouterLink, EmptyStateComponent, RatingStarsComponent, TimeAgoPipe, ImgFallbackDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reviews.page.html',
  styleUrl: './reviews.page.scss',
})
export class SellerReviewsPage {
  readonly seller = inject(SellerService);

  readonly items = signal<ReviewRow[]>([]);

  /** Aggregates from loaded review rows (not mock). */
  readonly reviewStats = computed(() => {
    const rows = this.items();
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
  }

  private async load(): Promise<void> {
    const rows = await this.seller.loadReviews(1, 100);
    const list: ReviewRow[] = rows.map((r) => ({
      id: r.id,
      docTitle: r.documentTitle,
      buyerName: r.buyerName,
      buyerAvatar: resolveAvatarUrl(r.buyerAvatarUrl),
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      sellerReplyText: r.sellerReplyText,
      sellerRepliedAt: r.sellerRepliedAt,
    }));
    this.items.set(list);
  }
}

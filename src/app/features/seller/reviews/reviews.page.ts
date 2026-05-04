import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SellerService } from '../../../core/services';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-seller-reviews',
  standalone: true,
  imports: [RatingStarsComponent, TimeAgoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reviews.page.html',
  styleUrl: './reviews.page.scss',
})
export class SellerReviewsPage {
  readonly seller = inject(SellerService);

  readonly reviews = computed(() => {
    const all: any[] = [];
    this.seller.myDocuments().forEach((d) =>
      d.reviews.forEach((r) => all.push({ ...r, docTitle: d.title })),
    );
    return all
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 12);
  });
}

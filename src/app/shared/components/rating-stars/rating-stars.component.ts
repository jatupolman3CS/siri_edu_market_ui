import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-rating-stars',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rating-stars.component.html',
  styleUrl: './rating-stars.component.scss',
})
export class RatingStarsComponent {
  readonly value = input.required<number>();
  readonly count = input<number | null>(null);
  readonly size = input<number>(14);
  readonly showValue = input<boolean>(true);

  readonly fives = [0, 1, 2, 3, 4];
  readonly uid = Math.random().toString(36).slice(2, 7);

  fill(i: number): number {
    const v = this.value();
    if (v >= i + 1) return 100;
    if (v <= i) return 0;
    return Math.round((v - i) * 100);
  }
}

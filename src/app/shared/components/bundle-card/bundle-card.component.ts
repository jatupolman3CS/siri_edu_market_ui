import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Bundle } from '../../../core/models';
import { ThbPipe } from '../../pipes/thb.pipe';
import { CompactPipe } from '../../pipes/compact.pipe';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-bundle-card',
  standalone: true,
  imports: [RouterLink, ThbPipe, CompactPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundle-card.component.html',
  styleUrl: './bundle-card.component.scss',
})
export class BundleCardComponent {
  readonly bundle = input.required<Bundle>();

  savings(): number {
    return this.bundle().originalPrice - this.bundle().price;
  }
  savingsPercent(): number {
    if (this.bundle().originalPrice === 0) return 0;
    return Math.round(
      ((this.bundle().originalPrice - this.bundle().price) /
        this.bundle().originalPrice) *
        100,
    );
  }
}

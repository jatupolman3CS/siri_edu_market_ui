import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Bundle } from '../../../core/models';
import { CartService, calcBundleSaveAmount, calcBundleSavePercent } from '../../../core/services';
import { ThbPipe } from '../../pipes/thb.pipe';
import { CompactPipe } from '../../pipes/compact.pipe';
import { IconComponent } from '../icon/icon.component';
import { ImgFallbackDirective } from '../../directives/img-fallback.directive';
import { TranslatePipe } from '../../../core/i18n';

@Component({
  selector: 'app-bundle-card',
  standalone: true,
  imports: [RouterLink, ThbPipe, CompactPipe, IconComponent, ImgFallbackDirective, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundle-card.component.html',
  styleUrl: './bundle-card.component.scss',
})
export class BundleCardComponent {
  private readonly cart = inject(CartService);
  readonly bundle = input.required<Bundle>();
  readonly addingToCart = signal(false);

  /**
   * Q-07 item 3: delegates to the same clamped helpers `document-bundle-cross-sell` already uses
   * (`calcBundleSaveAmount`/`calcBundleSavePercent`, both `Math.max(0, …)`-guarded) instead of
   * the raw `originalPrice - price` this used to compute by hand. That let an inconsistent row
   * (`price > originalPrice`) render a negative "− ฿-350" savings line instead of hiding it.
   */
  savings(): number {
    return calcBundleSaveAmount(this.bundle().price, this.bundle().originalPrice);
  }
  savingsPercent(): number {
    return calcBundleSavePercent(this.bundle().price, this.bundle().originalPrice);
  }

  async addToCart(event: Event): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (this.addingToCart()) return;

    this.addingToCart.set(true);
    try {
      await this.cart.addBundle(this.bundle().id);
    } finally {
      this.addingToCart.set(false);
    }
  }
}

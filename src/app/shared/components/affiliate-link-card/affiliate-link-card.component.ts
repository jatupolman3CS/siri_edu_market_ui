import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AffiliateService, ReferralService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

/**
 * referral-program v2 §4.1:
 * Displays user's affiliate link, commission rate %, clicks, conversions, and earned commission.
 * Harmonized with referral program (Item 9) to generate unified referral & affiliate link.
 */
@Component({
  selector: 'app-affiliate-link-card',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './affiliate-link-card.component.html',
  styleUrl: './affiliate-link-card.component.scss',
})
export class AffiliateLinkCardComponent {
  readonly affiliate = inject(AffiliateService);
  readonly referral = inject(ReferralService, { optional: true });
  private readonly message = inject(NzMessageService, { optional: true });
  readonly translation = inject(TranslationService);

  readonly copied = signal(false);

  constructor() {
    void this.affiliate.refreshSummary();
    void this.referral?.refreshSummary();
  }

  async copyShareUrl(): Promise<void> {
    const summary = this.affiliate.summary();
    const refSummary = this.referral?.summary();
    let url =
      summary?.shareUrl ||
      (summary?.code && typeof window !== 'undefined'
        ? `${window.location.origin}/marketplace?aff=${summary.code}`
        : '');
    if (summary?.code && refSummary?.code && typeof window !== 'undefined') {
      url = `${window.location.origin}/marketplace?ref=${refSummary.code}&aff=${summary.code}`;
    }
    if (!url) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      this.copied.set(true);
      this.message?.success(this.translation.t('shared.affiliate.copied'));
      setTimeout(() => this.copied.set(false), 3000);
    } catch {
      // Ignore clipboard write failures
    }
  }
}

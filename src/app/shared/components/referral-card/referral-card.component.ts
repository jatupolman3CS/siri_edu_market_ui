import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AffiliateService, ReferralService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-referral-card',
  standalone: true,
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './referral-card.component.html',
  styleUrl: './referral-card.component.scss',
})
export class ReferralCardComponent {
  readonly referral = inject(ReferralService);
  readonly affiliate = inject(AffiliateService, { optional: true });
  private readonly message = inject(NzMessageService, { optional: true });
  readonly translation = inject(TranslationService);

  readonly copied = signal(false);

  readonly referralDiscount = computed(() => this.referral.summary()?.referralDiscountAmount ?? 20);
  readonly commissionRate = computed(() => this.affiliate?.summary()?.commissionRatePercent ?? 5);

  constructor() {
    void this.referral.refreshSummary();
    void this.affiliate?.refreshSummary();
  }

  async copyShareUrl(): Promise<void> {
    const summary = this.referral.summary();
    const affSummary = this.affiliate?.summary();
    let url = summary?.shareUrl || (summary?.code && typeof window !== 'undefined' ? `${window.location.origin}/marketplace?ref=${summary.code}` : '');
    if (summary?.code && affSummary?.code && typeof window !== 'undefined') {
      url = `${window.location.origin}/marketplace?ref=${summary.code}&aff=${affSummary.code}`;
    }
    if (!url) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      this.copied.set(true);
      this.message?.success(this.translation.t('shared.referral.copiedLink'));
      setTimeout(() => this.copied.set(false), 3000);
    } catch {
      // Ignore clipboard write failures
    }
  }
}

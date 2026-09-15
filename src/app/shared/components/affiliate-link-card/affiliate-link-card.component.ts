import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AffiliateService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

/**
 * referral-program v2 §4.1:
 * Displays user's affiliate link, commission rate %, clicks, conversions, and earned commission.
 */
@Component({
  selector: 'app-affiliate-link-card',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './affiliate-link-card.component.html',
  styleUrl: './affiliate-link-card.component.scss',
})
export class AffiliateLinkCardComponent {
  readonly affiliate = inject(AffiliateService);
  private readonly message = inject(NzMessageService, { optional: true });

  readonly copied = signal(false);

  constructor() {
    void this.affiliate.refreshSummary();
  }

  async copyShareUrl(): Promise<void> {
    const summary = this.affiliate.summary();
    const url =
      summary?.shareUrl ||
      (summary?.code && typeof window !== 'undefined'
        ? `${window.location.origin}/marketplace?aff=${summary.code}`
        : '');
    if (!url) return;

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      this.copied.set(true);
      this.message?.success('คัดลอกลิงก์แล้ว');
      setTimeout(() => this.copied.set(false), 3000);
    } catch {
      // Ignore clipboard write failures
    }
  }
}

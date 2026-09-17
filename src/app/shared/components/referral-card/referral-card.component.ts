import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AffiliateService, ReferralService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-referral-card',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './referral-card.component.html',
  styleUrl: './referral-card.component.scss',
})
export class ReferralCardComponent {
  readonly referral = inject(ReferralService);
  readonly affiliate = inject(AffiliateService, { optional: true });
  private readonly message = inject(NzMessageService, { optional: true });

  readonly copied = signal(false);

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
      this.message?.success('คัดลอกลิงก์แล้ว');
      setTimeout(() => this.copied.set(false), 3000);
    } catch {
      // Ignore clipboard write failures
    }
  }
}

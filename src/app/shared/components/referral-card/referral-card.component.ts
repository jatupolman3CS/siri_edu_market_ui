import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ReferralService } from '../../../core/services';
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
  private readonly message = inject(NzMessageService, { optional: true });

  readonly copied = signal(false);

  constructor() {
    void this.referral.refreshSummary();
  }

  async copyShareUrl(): Promise<void> {
    const summary = this.referral.summary();
    const url = summary?.shareUrl || (summary?.code ? `${window.location.origin}/marketplace?ref=${summary.code}` : '');
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

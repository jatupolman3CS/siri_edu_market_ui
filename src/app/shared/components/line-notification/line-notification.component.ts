import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { LineNotificationService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

/**
 * line-notification-channel v1 (docs/contracts/line-notification-channel.md §3, §5) — "เชื่อมต่อ
 * LINE" section on `/seller/settings`, own component + own service (`LineNotificationService`),
 * same pattern as `payout-account-form.component.ts`. **Not** shared with `/account` —
 * `notification-settings.component.ts` stays email-only, untouched (§5).
 *
 * States rendered (§5):
 *  - `status() === null` → "กำลังโหลด…" (initial fetch hasn't resolved yet), same convention as
 *    `PayoutAccountFormComponent`.
 *  - `state().status === 'error'` → inline failure banner (`loadError()`), same split as
 *    `PayoutAccountFormComponent.loadError()`.
 *  - `status()!.isAvailable === false` → "ฟีเจอร์นี้ยังไม่เปิดใช้งาน" notice, no buttons (§1 item 8).
 *  - `status()!.status === 'NotConnected'` → "เชื่อมต่อ LINE" button only, no toggles.
 *  - `status()!.status === 'Connected'` → `lineDisplayName` + "ยกเลิกการเชื่อมต่อ" (confirm dialog
 *    before the real `DELETE`) + 5 per-category toggles (icon mapping reused verbatim from
 *    `notification-settings.component.html`, §5).
 *  - `status()!.status === 'Disconnected'` → warning banner + "เชื่อมต่อใหม่" button (calls the
 *    same `connect()` as NotConnected — no separate endpoint, §5), no toggles.
 *
 * notification-master-config v1 §3.6 / AC-20: a key the master config locks (`isLocked`) renders
 * disabled with its Thai `lockReason`, and never travels in the `PUT` — identical treatment to
 * `notification-settings.component.ts`, which owns the email half of the same catalog. Without it
 * a seller would see a live LINE switch for an event an admin already switched off platform-wide,
 * flip it, and get nothing.
 */
@Component({
  selector: 'app-line-notification',
  standalone: true,
  imports: [FormsModule, NzModalModule, NzSwitchModule, NzTooltipModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './line-notification.component.html',
  styleUrl: './line-notification.component.scss',
})
export class LineNotificationComponent {
  readonly lineNotification = inject(LineNotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly status = this.lineNotification.status;
  readonly settings = this.lineNotification.settings;

  /** True while connect()/disconnect() is in flight — guards the relevant buttons against double-clicks. */
  readonly busy = signal(false);

  readonly loadError = computed(() => {
    const s = this.lineNotification.state();
    return s.status === 'error' ? s.message : null;
  });

  constructor() {
    this.lineNotification.loadStatus();
    this.lineNotification.loadSettings();

    // §5: read `?line=connected|cancelled|error` on mount, toast accordingly, then clear it so a
    // refresh doesn't re-show the same toast.
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const line = params.get('line');
      if (!line) return;

      if (line === 'connected') {
        this.message.success('เชื่อมต่อ LINE สำเร็จ');
        this.lineNotification.loadStatus();
      } else if (line === 'cancelled') {
        this.message.info('ยกเลิกการเชื่อมต่อ LINE');
      } else if (line === 'error') {
        this.message.error('เชื่อมต่อ LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      }

      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
    });
  }

  /**
   * "เชื่อมต่อ LINE" / "เชื่อมต่อใหม่" — both call `POST connect` then full-page navigate (§5).
   * A `503` (LINE not configured on this server, §3.1) carries its own backend message
   * (`result.error`) shown verbatim instead of the generic failure toast.
   */
  async connect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = await this.lineNotification.connect();
      if (!result.ok) {
        this.message.error(result.error ?? 'เชื่อมต่อ LINE ไม่สำเร็จ');
        return;
      }
      this.lineNotification.redirectToLine(result.authorizeUrl);
    } finally {
      this.busy.set(false);
    }
  }

  confirmDisconnect(): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันยกเลิกการเชื่อมต่อ LINE',
      nzContent: 'คุณจะไม่ได้รับการแจ้งเตือนผ่าน LINE จนกว่าจะเชื่อมต่อใหม่',
      nzOkText: 'ยกเลิกการเชื่อมต่อ',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.disconnect(),
    });
  }

  private async disconnect(): Promise<void> {
    this.busy.set(true);
    try {
      const ok = await this.lineNotification.disconnect();
      if (ok) {
        this.message.success('ยกเลิกการเชื่อมต่อ LINE แล้ว');
        this.lineNotification.loadStatus();
      } else {
        this.message.error('ยกเลิกการเชื่อมต่อ LINE ไม่สำเร็จ');
      }
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * §5: the endpoint replaces the whole set, so every key has to go up on every toggle — mirrors
   * `notification-settings.component.ts.toggle()` exactly, its locked-key rule included: §3.6 says
   * the API drops a locked key silently, so sending one would make the request claim something
   * the seller never asked for (and cannot ask for).
   */
  toggle(key: string | undefined, enabled: boolean): void {
    if (!key) return;

    const settings = this.settings();
    const target = settings.find((setting) => setting.key === key);
    // §3.6: a locked key is not the seller's to change.
    if (!target || target.isLocked) return;

    const map: Record<string, boolean> = {};
    for (const setting of settings) {
      const k = setting.key;
      if (!k || setting.isLocked) continue;
      map[k] = k === key ? enabled : setting.isEnabled;
    }

    void this.lineNotification.updateSettings({ settings: map }).then((ok) => {
      // On failure: no toast here — same convention as `notification-settings.component.ts`,
      // which only toasts success and leaves the failure path silent at the component layer too
      // (there is nothing actionable to show beyond "try the switch again").
      if (ok) this.message.success('อัปเดตการแจ้งเตือน LINE แล้ว');
    });
  }
}

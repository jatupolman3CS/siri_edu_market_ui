import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTooltipModule } from 'ng-zorro-antd/tooltip';
import { LineNotificationService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-line-notification',
  standalone: true,
  imports: [FormsModule, NzModalModule, NzSwitchModule, NzTooltipModule, IconComponent, TranslatePipe],
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
  readonly translation = inject(TranslationService);

  readonly status = this.lineNotification.status;
  readonly settings = this.lineNotification.settings;

  readonly busy = signal(false);

  readonly loadError = computed(() => {
    const s = this.lineNotification.state();
    return s.status === 'error' ? s.message : null;
  });

  constructor() {
    this.lineNotification.loadStatus();
    this.lineNotification.loadSettings();

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const line = params.get('line');
      if (!line) return;

      if (line === 'connected') {
        this.message.success(this.translation.t('shared.lineNotification.connectedSuccess'));
        this.lineNotification.loadStatus();
      } else if (line === 'cancelled') {
        this.message.info(this.translation.t('shared.lineNotification.cancelledInfo'));
      } else if (line === 'error') {
        this.message.error(this.translation.t('shared.lineNotification.connectFailed'));
      }

      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {},
        replaceUrl: true,
      });
    });
  }

  async connect(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const result = await this.lineNotification.connect();
      if (!result.ok) {
        this.message.error(result.error ?? this.translation.t('shared.lineNotification.connectFailedShort'));
        return;
      }
      this.lineNotification.redirectToLine(result.authorizeUrl);
    } finally {
      this.busy.set(false);
    }
  }

  confirmDisconnect(): void {
    this.modal.confirm({
      nzTitle: this.translation.t('shared.lineNotification.confirmDisconnectTitle'),
      nzContent: this.translation.t('shared.lineNotification.confirmDisconnectContent'),
      nzOkText: this.translation.t('shared.lineNotification.disconnectBtn'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel'),
      nzOnOk: () => this.disconnect(),
    });
  }

  private async disconnect(): Promise<void> {
    this.busy.set(true);
    try {
      const ok = await this.lineNotification.disconnect();
      if (ok) {
        this.message.success(this.translation.t('shared.lineNotification.disconnectSuccess'));
        this.lineNotification.loadStatus();
      } else {
        this.message.error(this.translation.t('shared.lineNotification.disconnectFailed'));
      }
    } finally {
      this.busy.set(false);
    }
  }

  toggle(key: string | undefined, enabled: boolean): void {
    if (!key) return;

    const settings = this.settings();
    const target = settings.find((setting) => setting.key === key);
    if (!target || target.isLocked) return;

    const map: Record<string, boolean> = {};
    for (const setting of settings) {
      const k = setting.key;
      if (!k || setting.isLocked) continue;
      map[k] = k === key ? enabled : setting.isEnabled;
    }

    void this.lineNotification.updateSettings({ settings: map }).then((ok) => {
      if (ok) this.message.success(this.translation.t('shared.lineNotification.updatedSuccess'));
    });
  }
}

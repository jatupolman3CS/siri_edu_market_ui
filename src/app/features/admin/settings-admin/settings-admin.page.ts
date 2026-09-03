import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { AdminService, type PlatformSettings, type SystemConfigJobToggle } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule, IconComponent, DecimalPipe, DatePipe, NzSwitchModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-admin.page.html',
  styleUrl: './settings-admin.page.scss',
})
export class AdminSettingsPage {
  readonly admin = inject(AdminService);
  private readonly message = inject(NzMessageService);

  readonly form = signal<PlatformSettings>({
    feeRatePercent: 10,
    vatPercent: 7,
    payoutMinTHB: 500,
    payoutSchedule: 'monthly-15',
  });

  readonly saving = signal(false);
  readonly storage = this.admin.storageUsage;
  readonly storageGB = computed(() => {
    const u = this.storage();
    if (!u) return null;
    return (u.totalBytes / (1024 * 1024 * 1024)).toFixed(2);
  });

  /** system-config-job-toggle v1 §4: list is server-confirmed state only — no local optimistic copy. */
  readonly jobToggles = this.admin.jobToggles;
  /** jobKey currently mid-PUT — disables that row's switch and guards against double-click. */
  readonly savingJobKey = signal<string | null>(null);

  readonly gateways = [
    { name: 'Stripe', icon: '💳', note: 'บัตรเครดิต / PromptPay / wallet — เปิดปิดที่ Stripe Dashboard' },
    { name: 'GB Prime Pay', icon: '🏦', note: 'PromptPay QR และ Internet Banking' },
    { name: 'TrueMoney Wallet', icon: '👛', note: 'หักจาก e-Wallet' },
  ];

  readonly schedules = [
    { value: 'monthly-15', label: 'ทุกวันที่ 15 ของเดือน' },
    { value: 'monthly-end', label: 'ทุกสิ้นเดือน' },
    { value: 'weekly-wed', label: 'ทุกสัปดาห์ (พุธ)' },
  ];

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    const [s] = await Promise.all([
      this.admin.loadSettings(),
      this.admin.loadStorageUsage(),
      this.admin.loadJobToggles(),
    ]);
    if (s) {
      this.form.set({
        feeRatePercent: Number(s.feeRatePercent ?? 10),
        vatPercent: Number(s.vatPercent ?? 7),
        payoutMinTHB: Number(s.payoutMinTHB ?? 500),
        payoutSchedule: String(s.payoutSchedule ?? 'monthly-15'),
      });
    }
  }

  patch<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.admin.saveSettings(this.form());
      this.message.success('บันทึกการตั้งค่าเรียบร้อย');
    } catch {
      // apiFail already toasted by AdminService
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * system-config-job-toggle v1 §4: saves immediately on flip (not batched with `save()` above).
   * The bound value is `admin.jobToggles()` itself, so on failure the row simply falls back to
   * whatever `_jobToggles` still holds (untouched by a failed PUT) — no manual "revert" needed.
   */
  async toggleJob(item: SystemConfigJobToggle, enabled: boolean): Promise<void> {
    if (this.savingJobKey()) return;
    this.savingJobKey.set(item.jobKey);
    try {
      await this.admin.updateJobToggle(item.jobKey, enabled);
      this.message.success('อัปเดตสถานะงานเรียบร้อย');
    } catch {
      // apiFail already toasted by AdminService
    } finally {
      this.savingJobKey.set(null);
    }
  }
}

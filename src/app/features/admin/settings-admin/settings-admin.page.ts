import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import {
  AdminService,
  type AdminWatermarkCopy,
  type PlatformSettings,
  type PlatformSettingsUpdate,
  type SystemConfigJobToggle,
  type WatermarkPolicy,
} from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/**
 * watermark-completion v1 §3.2/§4.1: the 5 watermark fields of `PUT /api/admin/settings` are
 * nullable ("omitted = keep the stored value"), unlike the 4 fee/payout fields which are
 * full-replace. The page therefore has to remember which of them the operator actually touched.
 */
type WatermarkSettingKey =
  | 'watermarkPolicy'
  | 'watermarkDefaultEnabled'
  | 'watermarkForensicEnabled'
  | 'watermarkCopyRetentionDays'
  | 'watermarkDefaultSubtitle';

const WATERMARK_SETTING_KEYS: readonly WatermarkSettingKey[] = [
  'watermarkPolicy',
  'watermarkDefaultEnabled',
  'watermarkForensicEnabled',
  'watermarkCopyRetentionDays',
  'watermarkDefaultSubtitle',
];

/**
 * payment-method-master-config v1: same "nullable = leave the stored value alone" pattern as the
 * watermark fields above — the 4 payout-channel switches are only sent once the admin actually
 * flips one, tracked separately since they are unrelated settings.
 */
type PayoutMethodSettingKey =
  | 'payoutMethodBankEnabled'
  | 'payoutMethodPromptPayPhoneEnabled'
  | 'payoutMethodPromptPayNationalIdEnabled'
  | 'payoutMethodPromptPayQrEnabled';

const PAYOUT_METHOD_SETTING_KEYS: readonly PayoutMethodSettingKey[] = [
  'payoutMethodBankEnabled',
  'payoutMethodPromptPayPhoneEnabled',
  'payoutMethodPromptPayNationalIdEnabled',
  'payoutMethodPromptPayQrEnabled',
];

/** watermark-completion v1 §2.2: `WatermarkCopyRetentionDays` is constrained to 7–3650. */
const RETENTION_DAYS_MIN = 7;
const RETENTION_DAYS_MAX = 3650;

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule, IconComponent, DecimalPipe, DatePipe, NzSwitchModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-admin.page.html',
  styleUrl: './settings-admin.page.scss',
})
export class AdminSettingsPage {
  readonly admin = inject(AdminService);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

  readonly form = signal<PlatformSettings>({
    feeRatePercent: 10,
    vatPercent: 7,
    payoutMinTHB: 500,
    payoutSchedule: 'monthly-15',
    // payout-request-slip-verification v1 §3.9 defaults — read-only here until `loadSettings()`
    // answers; this page does not yet expose an editor for either (out of §4 scope for this round).
    payoutMaxTHB: 0,
    nextPayoutDate: null,
    // watermark-completion v1 §2.2 defaults — only shown until `loadSettings()` answers.
    watermarkPolicy: 'required_when_supported',
    watermarkDefaultEnabled: true,
    watermarkForensicEnabled: true,
    watermarkCopyRetentionDays: 90,
    watermarkDefaultSubtitle: null,
    // payment-method-master-config v1 defaults — the platform's current default (QR-only) until
    // `loadSettings()` answers.
    payoutMethodBankEnabled: false,
    payoutMethodPromptPayPhoneEnabled: false,
    payoutMethodPromptPayNationalIdEnabled: false,
    payoutMethodPromptPayQrEnabled: true,
  });

  /** watermark-completion v1 §4.1: only touched watermark fields are sent on save. */
  private readonly touchedWatermarkKeys = signal<ReadonlySet<WatermarkSettingKey>>(new Set());
  /** payment-method-master-config v1: only touched payout-method switches are sent on save. */
  private readonly touchedPayoutMethodKeys = signal<ReadonlySet<PayoutMethodSettingKey>>(new Set());

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

  get gateways(): { name: string; icon: string; note: string }[] {
    return [
      { name: 'Stripe', icon: '💳', note: this.translation.t('admin.settingsAdmin.gatewayStripeNote') },
      { name: 'GB Prime Pay', icon: '🏦', note: this.translation.t('admin.settingsAdmin.gatewayGbNote') },
      { name: 'TrueMoney Wallet', icon: '👛', note: this.translation.t('admin.settingsAdmin.gatewayTrueMoneyNote') },
    ];
  }

  /** watermark-completion v1 §4.1 — labels are fixed by the spec, values by §2.2. */
  get watermarkPolicies(): { value: WatermarkPolicy; label: string }[] {
    return [
      { value: 'seller_choice', label: this.translation.t('admin.settingsAdmin.watermarkPolicySellerChoice') },
      { value: 'required_when_supported', label: this.translation.t('admin.settingsAdmin.watermarkPolicyRequired') },
      { value: 'required_always', label: this.translation.t('admin.settingsAdmin.watermarkPolicyAlways') },
    ];
  }

  readonly retentionDaysMin = RETENTION_DAYS_MIN;
  readonly retentionDaysMax = RETENTION_DAYS_MAX;

  // ===== watermark-completion v1 §4.2: copy-code lookup card =====
  readonly copyToken = signal('');
  readonly copySearching = signal(false);
  readonly copyResults = signal<AdminWatermarkCopy[]>([]);
  /** `false` until a lookup has come back, so the empty table and "not found" stay distinct. */
  readonly copySearched = signal(false);

  get schedules(): { value: string; label: string }[] {
    return [
      { value: 'monthly-15', label: this.translation.t('admin.settingsAdmin.scheduleMonthly15') },
      { value: 'monthly-end', label: this.translation.t('admin.settingsAdmin.scheduleMonthlyEnd') },
      { value: 'weekly-wed', label: this.translation.t('admin.settingsAdmin.scheduleWeeklyWed') },
    ];
  }

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
        payoutMaxTHB: Number(s.payoutMaxTHB ?? 0),
        nextPayoutDate: s.nextPayoutDate ?? null,
        watermarkPolicy: s.watermarkPolicy,
        watermarkDefaultEnabled: s.watermarkDefaultEnabled,
        watermarkForensicEnabled: s.watermarkForensicEnabled,
        watermarkCopyRetentionDays: Number(s.watermarkCopyRetentionDays ?? 90),
        watermarkDefaultSubtitle: s.watermarkDefaultSubtitle,
        payoutMethodBankEnabled: s.payoutMethodBankEnabled,
        payoutMethodPromptPayPhoneEnabled: s.payoutMethodPromptPayPhoneEnabled,
        payoutMethodPromptPayNationalIdEnabled: s.payoutMethodPromptPayNationalIdEnabled,
        payoutMethodPromptPayQrEnabled: s.payoutMethodPromptPayQrEnabled,
      });
    }
    // Reloading discards the pending edits, so nothing is "touched" any more either.
    this.touchedWatermarkKeys.set(new Set());
    this.touchedPayoutMethodKeys.set(new Set());
  }

  patch<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    if ((WATERMARK_SETTING_KEYS as readonly string[]).includes(key as string)) {
      this.touchedWatermarkKeys.update((keys) => new Set(keys).add(key as WatermarkSettingKey));
    }
    if ((PAYOUT_METHOD_SETTING_KEYS as readonly string[]).includes(key as string)) {
      this.touchedPayoutMethodKeys.update((keys) =>
        new Set(keys).add(key as PayoutMethodSettingKey),
      );
    }
  }

  /**
   * watermark-completion v1 §4.1: fee/VAT/payout are always sent (full-replace, unchanged
   * behaviour); a watermark field is only sent once the operator has actually changed it, so an
   * admin who opened this page to edit the VAT rate cannot silently re-write a policy that
   * someone else changed in the meantime.
   */
  private buildSettingsUpdate(): PlatformSettingsUpdate {
    const f = this.form();
    const touched = this.touchedWatermarkKeys();
    const touchedPayoutMethods = this.touchedPayoutMethodKeys();
    const body: PlatformSettingsUpdate = {
      feeRatePercent: f.feeRatePercent,
      vatPercent: f.vatPercent,
      payoutMinTHB: f.payoutMinTHB,
      payoutSchedule: f.payoutSchedule,
    };
    if (touched.has('watermarkPolicy')) body.watermarkPolicy = f.watermarkPolicy;
    if (touched.has('watermarkDefaultEnabled')) {
      body.watermarkDefaultEnabled = f.watermarkDefaultEnabled;
    }
    if (touched.has('watermarkForensicEnabled')) {
      body.watermarkForensicEnabled = f.watermarkForensicEnabled;
    }
    if (touched.has('watermarkCopyRetentionDays')) {
      body.watermarkCopyRetentionDays = f.watermarkCopyRetentionDays;
    }
    if (touched.has('watermarkDefaultSubtitle')) {
      // §3.2: '' is the documented way to clear the stored subtitle back to null.
      body.watermarkDefaultSubtitle = (f.watermarkDefaultSubtitle ?? '').trim();
    }
    if (touchedPayoutMethods.has('payoutMethodBankEnabled')) {
      body.payoutMethodBankEnabled = f.payoutMethodBankEnabled;
    }
    if (touchedPayoutMethods.has('payoutMethodPromptPayPhoneEnabled')) {
      body.payoutMethodPromptPayPhoneEnabled = f.payoutMethodPromptPayPhoneEnabled;
    }
    if (touchedPayoutMethods.has('payoutMethodPromptPayNationalIdEnabled')) {
      body.payoutMethodPromptPayNationalIdEnabled = f.payoutMethodPromptPayNationalIdEnabled;
    }
    if (touchedPayoutMethods.has('payoutMethodPromptPayQrEnabled')) {
      body.payoutMethodPromptPayQrEnabled = f.payoutMethodPromptPayQrEnabled;
    }
    return body;
  }

  async save(): Promise<void> {
    const body = this.buildSettingsUpdate();
    const days = body.watermarkCopyRetentionDays;
    if (days !== undefined && (days < RETENTION_DAYS_MIN || days > RETENTION_DAYS_MAX)) {
      this.message.error(this.translation.t('admin.settingsAdmin.retentionDaysError', { min: RETENTION_DAYS_MIN, max: RETENTION_DAYS_MAX }));
      return;
    }
    this.saving.set(true);
    try {
      await this.admin.saveSettings(body);
      this.touchedWatermarkKeys.set(new Set());
      this.touchedPayoutMethodKeys.set(new Set());
      this.message.success(this.translation.t('admin.settingsAdmin.saveSuccess'));
    } catch {
      // apiFail already toasted by AdminService
    } finally {
      this.saving.set(false);
    }
  }

  // ===== watermark-completion v1 §4.2: ตรวจสอบรหัสสำเนาเอกสาร =====

  /**
   * §3.3: the endpoint accepts the code with or without its `WMK-` prefix and ignores case, so
   * the raw (trimmed) input goes out as typed. An empty list is a real answer — "ไม่พบรหัสสำเนานี้
   * ในระบบ" — which is why `copySearched` only flips on a successful call.
   */
  async searchWatermarkCopy(): Promise<void> {
    const token = this.copyToken().trim();
    if (!token) {
      this.message.warning(this.translation.t('admin.settingsAdmin.copySearchRequired'));
      return;
    }
    if (this.copySearching()) return;
    this.copySearching.set(true);
    try {
      const rows = await this.admin.searchWatermarkCopies({ token });
      this.copyResults.set(rows);
      this.copySearched.set(true);
    } catch {
      // apiFail already toasted by AdminService — a failed lookup is not "not found".
      this.copyResults.set([]);
      this.copySearched.set(false);
    } finally {
      this.copySearching.set(false);
    }
  }

  /** §2.1: `AccessSource` is `purchase` | `subscription`. */
  accessSourceLabel(source: string): string {
    switch (source) {
      case 'purchase':
        return this.translation.t('admin.settingsAdmin.accessSourcePurchase');
      case 'subscription':
        return this.translation.t('admin.settingsAdmin.accessSourceSubscription');
      default:
        return source || '-';
    }
  }

  /** §0.2: the 4 watermark modes, phrased for an admin reading a leak report. */
  watermarkModeLabel(mode: string): string {
    switch (mode) {
      case 'raster':
        return this.translation.t('admin.settingsAdmin.watermarkModeRaster');
      case 'ooxml':
        return this.translation.t('admin.settingsAdmin.watermarkModeOoxml');
      case 'repack':
        return this.translation.t('admin.settingsAdmin.watermarkModeRepack');
      default:
        return this.translation.t('admin.settingsAdmin.watermarkModeNone');
    }
  }

  /** §3.6: closed set of failure reasons — anything unknown is shown as-is, never hidden. */
  failureReasonLabel(reason: string): string {
    switch (reason) {
      case 'disabled_by_seller':
        return this.translation.t('admin.settingsAdmin.failureReasonDisabledBySeller');
      case 'unsupported_format':
        return this.translation.t('admin.settingsAdmin.failureReasonUnsupportedFormat');
      case 'format_mismatch':
        return this.translation.t('admin.settingsAdmin.failureReasonFormatMismatch');
      case 'too_many_pages':
        return this.translation.t('admin.settingsAdmin.failureReasonTooManyPages');
      case 'source_too_large':
        return this.translation.t('admin.settingsAdmin.failureReasonSourceTooLarge');
      case 'render_timeout':
        return this.translation.t('admin.settingsAdmin.failureReasonRenderTimeout');
      case 'render_error':
        return this.translation.t('admin.settingsAdmin.failureReasonRenderError');
      case 'missing_source':
        return this.translation.t('admin.settingsAdmin.failureReasonMissingSource');
      case 'forensic_disabled':
        return this.translation.t('admin.settingsAdmin.failureReasonForensicDisabled');
      default:
        return reason;
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
      this.message.success(this.translation.t('admin.settingsAdmin.updateJobSuccess'));
    } catch {
      // apiFail already toasted by AdminService
    } finally {
      this.savingJobKey.set(null);
    }
  }
}

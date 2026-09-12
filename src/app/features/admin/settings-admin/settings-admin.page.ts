import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
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

/** watermark-completion v1 §2.2: `WatermarkCopyRetentionDays` is constrained to 7–3650. */
const RETENTION_DAYS_MIN = 7;
const RETENTION_DAYS_MAX = 3650;

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
    // watermark-completion v1 §2.2 defaults — only shown until `loadSettings()` answers.
    watermarkPolicy: 'required_when_supported',
    watermarkDefaultEnabled: true,
    watermarkForensicEnabled: true,
    watermarkCopyRetentionDays: 90,
    watermarkDefaultSubtitle: null,
  });

  /** watermark-completion v1 §4.1: only touched watermark fields are sent on save. */
  private readonly touchedWatermarkKeys = signal<ReadonlySet<WatermarkSettingKey>>(new Set());

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

  /** watermark-completion v1 §4.1 — labels are fixed by the spec, values by §2.2. */
  readonly watermarkPolicies: { value: WatermarkPolicy; label: string }[] = [
    { value: 'seller_choice', label: 'ให้ผู้ขายเลือกเอง' },
    { value: 'required_when_supported', label: 'บังคับเมื่อไฟล์รองรับ' },
    { value: 'required_always', label: 'บังคับทุกกรณี' },
  ];

  readonly retentionDaysMin = RETENTION_DAYS_MIN;
  readonly retentionDaysMax = RETENTION_DAYS_MAX;

  // ===== watermark-completion v1 §4.2: copy-code lookup card =====
  readonly copyToken = signal('');
  readonly copySearching = signal(false);
  readonly copyResults = signal<AdminWatermarkCopy[]>([]);
  /** `false` until a lookup has come back, so the empty table and "not found" stay distinct. */
  readonly copySearched = signal(false);

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
        watermarkPolicy: s.watermarkPolicy,
        watermarkDefaultEnabled: s.watermarkDefaultEnabled,
        watermarkForensicEnabled: s.watermarkForensicEnabled,
        watermarkCopyRetentionDays: Number(s.watermarkCopyRetentionDays ?? 90),
        watermarkDefaultSubtitle: s.watermarkDefaultSubtitle,
      });
    }
    // Reloading discards the pending edits, so nothing is "touched" any more either.
    this.touchedWatermarkKeys.set(new Set());
  }

  patch<K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]): void {
    this.form.update((f) => ({ ...f, [key]: value }));
    if ((WATERMARK_SETTING_KEYS as readonly string[]).includes(key as string)) {
      this.touchedWatermarkKeys.update((keys) => new Set(keys).add(key as WatermarkSettingKey));
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
    return body;
  }

  async save(): Promise<void> {
    const body = this.buildSettingsUpdate();
    const days = body.watermarkCopyRetentionDays;
    if (days !== undefined && (days < RETENTION_DAYS_MIN || days > RETENTION_DAYS_MAX)) {
      this.message.error(`เก็บไฟล์สำเนาได้ระหว่าง ${RETENTION_DAYS_MIN} ถึง ${RETENTION_DAYS_MAX} วัน`);
      return;
    }
    this.saving.set(true);
    try {
      await this.admin.saveSettings(body);
      this.touchedWatermarkKeys.set(new Set());
      this.message.success('บันทึกการตั้งค่าเรียบร้อย');
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
      this.message.warning('กรุณากรอกรหัสสำเนาก่อนค้นหา');
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
        return 'ซื้อ';
      case 'subscription':
        return 'สมาชิก';
      default:
        return source || '-';
    }
  }

  /** §0.2: the 4 watermark modes, phrased for an admin reading a leak report. */
  watermarkModeLabel(mode: string): string {
    switch (mode) {
      case 'raster':
        return 'ประทับในหน้า PDF';
      case 'ooxml':
        return 'ประทับในไฟล์ Office';
      case 'repack':
        return 'แนบไฟล์รหัสสำเนาใน ZIP';
      default:
        return 'ไม่มีลายน้ำ';
    }
  }

  /** §3.6: closed set of failure reasons — anything unknown is shown as-is, never hidden. */
  failureReasonLabel(reason: string): string {
    switch (reason) {
      case 'disabled_by_seller':
        return 'ผู้ขายปิดลายน้ำ';
      case 'unsupported_format':
        return 'ฟอร์แมตนี้ประทับลายน้ำไม่ได้';
      case 'format_mismatch':
        return 'นามสกุลไฟล์ไม่ตรงกับฟอร์แมตที่บันทึกไว้';
      case 'too_many_pages':
        return 'จำนวนหน้ามากเกินกำหนด';
      case 'source_too_large':
        return 'ไฟล์ต้นฉบับใหญ่เกินกำหนด';
      case 'render_timeout':
        return 'ประทับไม่ทันเวลาที่กำหนด';
      case 'render_error':
        return 'ประทับลายน้ำไม่สำเร็จ';
      case 'missing_source':
        return 'ไม่พบไฟล์ต้นฉบับ';
      case 'forensic_disabled':
        return 'ปิดการฝังรหัสสำเนารายผู้ซื้อ';
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
      this.message.success('อัปเดตสถานะงานเรียบร้อย');
    } catch {
      // apiFail already toasted by AdminService
    } finally {
      this.savingJobKey.set(null);
    }
  }
}

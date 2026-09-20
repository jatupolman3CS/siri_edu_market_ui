import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { AdsService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { AdminAdsCampaign, AdminAdsPlacement } from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** §4.4: campaign status → translation key. */
const STATUS_KEYS: Record<string, string> = {
  scheduled: 'admin.ads.statusScheduled',
  active: 'admin.ads.statusActive',
  completed: 'admin.ads.statusCompleted',
  cancelled: 'admin.ads.statusCancelled',
  stopped: 'admin.ads.statusStopped',
};

/** §4.4: stop reason → translation key. */
const STOP_REASON_KEYS: Record<string, string> = {
  admin_stopped: 'admin.ads.stopReasonAdminStopped',
  account_suspended: 'admin.ads.stopReasonAccountSuspended',
  document_unavailable: 'admin.ads.stopReasonDocumentUnavailable',
  seller_cancelled: 'admin.ads.stopReasonSellerCancelled',
};

const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

/** §3.11.4 validation. */
interface PlacementFormValues {
  pricePerDay: number | null;
  weeklyPrice: number | null;
  dailySlotCapacity: number | null;
  maxPerResultPage: number | null;
  isEnabled: boolean;
}

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §3.11, §4.1, §4.4) — F-14: the
 * admin "โฆษณา" page — all-campaigns queue + stop, and the placement price/capacity/switch editor.
 * Every ads call goes through `AdsService` (never the SDK directly — audit:guard).
 */
@Component({
  selector: 'app-ads-admin',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    NzModalModule,
    NzSelectModule,
    NzSwitchModule,
    NzTabsModule,
    EmptyStateComponent,
    ImgFallbackDirective,
    PaginationComponent,
    ThbPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ads-admin.page.html',
  styleUrl: './ads-admin.page.scss',
})
export class AdsAdminPage {
  private readonly ads = inject(AdsService);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

  statusLabel(status: string): string {
    const key = STATUS_KEYS[status];
    return key ? this.translation.t(key) : status;
  }

  stopReasonLabel(reason: string | null): string | null {
    if (!reason) return null;
    const key = STOP_REASON_KEYS[reason];
    return key ? this.translation.t(key) : reason;
  }

  // ───────────────────────── tab 1: campaigns ─────────────────────────

  readonly campaigns = signal<AdminAdsCampaign[]>([]);
  readonly loadingList = signal(false);
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  readonly statusFilter = signal<string>('all');
  readonly placementFilter = signal<string>('all');
  readonly sellerIdFilter = signal<string>('');

  get statusFilterOptions(): { value: string; label: string }[] {
    return [
      { value: 'all', label: this.translation.t('admin.subscriptionsAdmin.statusAll') },
      { value: 'scheduled', label: this.translation.t('admin.ads.statusScheduled') },
      { value: 'active', label: this.translation.t('admin.ads.statusActive') },
      { value: 'completed', label: this.translation.t('admin.ads.statusCompleted') },
      { value: 'cancelled', label: this.translation.t('admin.ads.statusCancelled') },
      { value: 'stopped', label: this.translation.t('admin.ads.statusStopped') },
    ];
  }

  canStop(c: AdminAdsCampaign): boolean {
    return c.status === 'scheduled' || c.status === 'active';
  }

  async refreshCampaigns(): Promise<void> {
    this.loadingList.set(true);
    try {
      const result = await this.ads.adminListCampaigns({
        status: this.statusFilter(),
        placement: this.placementFilter(),
        sellerId: this.sellerIdFilter().trim() || undefined,
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.campaigns.set(result.items ?? []);
      this.total.set(result.totalCount ?? 0);
    } finally {
      this.loadingList.set(false);
    }
  }

  onStatusFilterChange(next: string): void {
    this.statusFilter.set(next);
    this.page.set(1);
    void this.refreshCampaigns();
  }

  onPlacementFilterChange(next: string): void {
    this.placementFilter.set(next);
    this.page.set(1);
    void this.refreshCampaigns();
  }

  onSellerIdFilterChange(next: string): void {
    this.sellerIdFilter.set(next);
  }

  applySellerIdFilter(): void {
    this.page.set(1);
    void this.refreshCampaigns();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.refreshCampaigns();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    void this.refreshCampaigns();
  }

  // ───────────────────────── stop-campaign modal (§3.11.2) ─────────────────────────

  readonly stopTarget = signal<AdminAdsCampaign | null>(null);
  readonly stopReason = signal('');
  readonly refundRemainingDays = signal(true);
  readonly stopping = signal(false);

  readonly stopReasonValid = computed(() => {
    const len = this.stopReason().trim().length;
    return len >= MIN_REASON_LENGTH && len <= MAX_REASON_LENGTH;
  });

  readonly stopReasonError = computed<string | null>(() => {
    const len = this.stopReason().trim().length;
    if (len === 0) return null;
    if (len < MIN_REASON_LENGTH) {
      return this.translation.t('admin.ads.stopReasonMinLength', { min: MIN_REASON_LENGTH });
    }
    if (len > MAX_REASON_LENGTH) {
      return this.translation.t('admin.ads.stopReasonMaxLength', { max: MAX_REASON_LENGTH });
    }
    return null;
  });

  openStop(campaign: AdminAdsCampaign): void {
    this.stopTarget.set(campaign);
    this.stopReason.set('');
    this.refundRemainingDays.set(true);
  }

  closeStop(): void {
    this.stopTarget.set(null);
  }

  async confirmStop(): Promise<void> {
    const campaign = this.stopTarget();
    if (!campaign || !this.stopReasonValid()) return;

    this.stopping.set(true);
    try {
      const result = await this.ads.adminStopCampaign(
        campaign.id,
        this.stopReason().trim(),
        this.refundRemainingDays(),
      );
      if (result.ok) {
        this.message.success(this.translation.t('admin.ads.stopSuccess'));
        this.closeStop();
        void this.refreshCampaigns();
      } else if (result.message) {
        this.message.error(result.message);
      }
    } finally {
      this.stopping.set(false);
    }
  }

  // ───────────────────────── tab 2: placements (§3.11.3/§3.11.4) ─────────────────────────

  readonly placements = signal<AdminAdsPlacement[]>([]);
  readonly loadingPlacements = signal(false);

  async refreshPlacements(): Promise<void> {
    this.loadingPlacements.set(true);
    try {
      this.placements.set(await this.ads.adminListPlacements());
    } finally {
      this.loadingPlacements.set(false);
    }
  }

  readonly editingPlacement = signal<AdminAdsPlacement | null>(null);
  readonly placementForm = signal<PlacementFormValues>({
    pricePerDay: null,
    weeklyPrice: null,
    dailySlotCapacity: null,
    maxPerResultPage: null,
    isEnabled: true,
  });
  readonly savingPlacement = signal(false);
  readonly placementFormErrorMessage = signal<string | null>(null);

  readonly placementFormError = computed<string | null>(() => {
    const f = this.placementForm();
    if (f.pricePerDay == null || f.pricePerDay <= 0 || f.pricePerDay > 100000) {
      return this.translation.t('admin.ads.placementErrorPricePerDay');
    }
    if (f.weeklyPrice != null && (f.weeklyPrice <= 0 || f.weeklyPrice > f.pricePerDay * 7)) {
      return this.translation.t('admin.ads.placementErrorWeeklyPrice');
    }
    if (f.dailySlotCapacity == null || f.dailySlotCapacity < 1 || f.dailySlotCapacity > 10) {
      return this.translation.t('admin.ads.placementErrorDailySlot');
    }
    if (f.maxPerResultPage == null || f.maxPerResultPage < 1 || f.maxPerResultPage > 2) {
      return this.translation.t('admin.ads.placementErrorMaxPerPage');
    }
    return null;
  });

  openEditPlacement(p: AdminAdsPlacement): void {
    this.editingPlacement.set(p);
    this.placementForm.set({
      pricePerDay: p.pricePerDay,
      weeklyPrice: p.weeklyPrice,
      dailySlotCapacity: p.dailySlotCapacity,
      maxPerResultPage: p.maxPerResultPage,
      isEnabled: p.isEnabled,
    });
    this.placementFormErrorMessage.set(null);
  }

  closeEditPlacement(): void {
    this.editingPlacement.set(null);
  }

  updatePlacementForm(patch: Partial<PlacementFormValues>): void {
    this.placementForm.update((f) => ({ ...f, ...patch }));
  }

  async savePlacement(): Promise<void> {
    const target = this.editingPlacement();
    const error = this.placementFormError();
    if (!target || error) return;

    const f = this.placementForm();
    this.savingPlacement.set(true);
    this.placementFormErrorMessage.set(null);
    try {
      const result = await this.ads.adminUpdatePlacement(target.placementKey, {
        pricePerDay: f.pricePerDay!,
        weeklyPrice: f.weeklyPrice,
        dailySlotCapacity: f.dailySlotCapacity!,
        maxPerResultPage: f.maxPerResultPage!,
        isEnabled: f.isEnabled,
      });
      if (result.ok) {
        this.message.success(this.translation.t('admin.ads.savePlacementSuccess'));
        this.closeEditPlacement();
        void this.refreshPlacements();
      } else if (result.message) {
        this.placementFormErrorMessage.set(result.message);
      }
    } finally {
      this.savingPlacement.set(false);
    }
  }

  constructor() {
    void this.refreshCampaigns();
    void this.refreshPlacements();
  }
}

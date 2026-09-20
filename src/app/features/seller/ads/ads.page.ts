import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzDatePickerModule } from 'ng-zorro-antd/date-picker';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { AdsService, CatalogService, SellerService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import type {
  AdsAvailability,
  AdsCampaign,
  AdsCampaignQuote,
  AdsPlacement,
  DocumentItem,
} from '../../../core/models';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** §4.4: campaign status → translation key. */
const STATUS_KEY_MAP: Record<string, string> = {
  scheduled: 'sellerAds.statusScheduled',
  active: 'sellerAds.statusActive',
  completed: 'sellerAds.statusCompleted',
  cancelled: 'sellerAds.statusCancelled',
  stopped: 'sellerAds.statusStopped',
};

/** §4.4: stop reason → translation key. */
const STOP_REASON_KEY_MAP: Record<string, string> = {
  admin_stopped: 'sellerAds.statusAdminStopped',
  account_suspended: 'sellerAds.statusAccountSuspended',
  document_unavailable: 'sellerAds.statusDocumentUnavailable',
  seller_cancelled: 'sellerAds.statusSellerCancelled',
};

/** §3.2 caps a single availability request at 90 days — comfortably under that. */
const AVAILABILITY_WINDOW_DAYS = 60;

/** §4.2 rule 3. */
const QUOTE_DEBOUNCE_MS = 300;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatBaht(v: number): string {
  return v.toLocaleString('th-TH', { maximumFractionDigits: 2 });
}

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §4.1, §4.2, §4.4) — F-14: the
 * seller's "โปรโมตเอกสาร" page. Balance card + campaign list read `AdsService`/`SellerService`
 * exclusively (never the SDK directly — audit:guard). §4.2's 6 form-state rules govern the
 * create-campaign modal below; the most load-bearing one is rule 1 — every money figure shown in
 * the modal comes straight from `quote()` (server), never computed here.
 */
@Component({
  selector: 'app-seller-ads',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    NzModalModule,
    NzDatePickerModule,
    NzSelectModule,
    EmptyStateComponent,
    IconComponent,
    PaginationComponent,
    ImgFallbackDirective,
    ThbPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ads.page.html',
  styleUrl: './ads.page.scss',
})
export class SellerAdsPage {
  private readonly ads = inject(AdsService);
  readonly seller = inject(SellerService);
  private readonly catalog = inject(CatalogService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly translation = inject(TranslationService);

  // ───────────────────────── list ─────────────────────────

  readonly campaigns = signal<AdsCampaign[]>([]);
  readonly statusFilter = signal<string>('all');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);
  readonly loadingList = signal(false);
  readonly cancellingId = signal<string | null>(null);

  readonly availableBalance = computed(() => this.seller.earnings()?.availableBalance ?? 0);

  get statusFilterOptions(): { value: string; label: string }[] {
    return [
      { value: 'all', label: this.translation.t('common.all') },
      { value: 'scheduled', label: this.translation.t('sellerAds.statusScheduled') },
      { value: 'active', label: this.translation.t('sellerAds.statusActive') },
      { value: 'completed', label: this.translation.t('sellerAds.statusCompleted') },
      { value: 'cancelled', label: this.translation.t('sellerAds.statusCancelled') },
      { value: 'stopped', label: this.translation.t('sellerAds.statusStopped') },
    ];
  }

  statusLabel(status: string): string {
    const key = STATUS_KEY_MAP[status];
    return key ? this.translation.t(key) : status;
  }

  stopReasonLabel(reason: string | null): string | null {
    if (!reason) return null;
    const key = STOP_REASON_KEY_MAP[reason];
    return key ? this.translation.t(key) : reason;
  }

  canCancel(c: AdsCampaign): boolean {
    return c.status === 'scheduled' || c.status === 'active';
  }

  // ───────────────────────── create-campaign modal (§4.2) ─────────────────────────

  readonly formOpen = signal(false);
  readonly placements = signal<AdsPlacement[]>([]);
  readonly myDocuments = signal<DocumentItem[]>([]);
  readonly loadingForm = signal(false);

  readonly selectedDocumentId = signal<string | null>(null);
  readonly selectedPlacementKey = signal<string | null>(null);
  readonly selectedTargetKey = signal<string | null>(null);
  readonly dateRange = signal<Date[] | null>(null);
  readonly availability = signal<AdsAvailability | null>(null);
  readonly quote = signal<AdsCampaignQuote | null>(null);
  readonly quoting = signal(false);
  readonly submitting = signal(false);
  readonly formError = signal<string | null>(null);

  readonly categories = computed(() => this.catalog.categories());

  readonly selectedPlacement = computed<AdsPlacement | null>(
    () => this.placements().find((p) => p.placementKey === this.selectedPlacementKey()) ?? null,
  );

  private readonly unselectableDates = computed(() => {
    const days = this.availability()?.days ?? [];
    const s = new Set<string>();
    for (const day of days) if (!day.isSelectable) s.add(day.date);
    return s;
  });

  /** §4.2: bound to `nzDisabledDate` — full/past days are truly un-clickable, not just styled grey. */
  readonly isDateDisabled = (current: Date): boolean => {
    if (current < startOfToday()) return true;
    return this.unselectableDates().has(toIsoDate(current));
  };

  /** §4.2 rule 4: the 4 documented conditions. */
  readonly submitDisabled = computed(() => {
    const q = this.quote();
    return !q || q.canAfford === false || q.fullDates.length > 0 || this.submitting();
  });

  readonly submitDisabledReason = computed<string | null>(() => {
    if (this.submitting()) return this.translation.t('sellerAds.submitting');
    if (!this.selectedDocumentId()) return this.translation.t('sellerAds.selectDocument');
    const q = this.quote();
    if (!q) return null;
    if (q.fullDates.length > 0) return this.translation.t('sellerAds.datesFullyBooked');
    if (!q.canAfford) return this.translation.t('sellerAds.insufficientBalance');
    return null;
  });

  private quoteDebounceHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.seller.loadEarnings();
    void this.refresh();
    this.catalog.ensureCategories();
  }

  // ───────────────────────── list actions ─────────────────────────

  onStatusFilterChange(next: string): void {
    this.statusFilter.set(next);
    this.page.set(1);
    void this.refresh();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.refresh();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.loadingList.set(true);
    try {
      const result = await this.ads.listCampaigns({
        status: this.statusFilter(),
        page: this.page(),
        pageSize: this.pageSize(),
      });
      this.campaigns.set(result.items ?? []);
      this.total.set(result.totalCount ?? 0);
    } finally {
      this.loadingList.set(false);
    }
  }

  /** AC-36: `NzModalService.confirm` — never native `confirm()` — states the refund amount up front. */
  confirmCancel(campaign: AdsCampaign): void {
    const estimated = this.estimateRefund(campaign);
    const content =
      estimated > 0
        ? this.translation.t('sellerAds.cancelConfirmWithRefund', { amount: formatBaht(estimated) })
        : this.translation.t('sellerAds.cancelConfirmNoRefund');
    this.modal.confirm({
      nzTitle: this.translation.t('sellerAds.cancelTitle'),
      nzContent: content,
      nzOkText: this.translation.t('sellerAds.cancelConfirmOk'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.close'),
      nzOnOk: () => this.doCancel(campaign.id),
    });
  }

  /**
   * §3.7 has no dry-run endpoint, so the confirm prompt above needs a *preview* before the seller
   * commits — this mirrors DEC-3's public refund formula (price-per-day snapshot × remaining days
   * from tomorrow, Thai time) purely for that preview text. This is not the §4.2 rule 1 ban (that
   * one is about the create form's campaign price, which has real server-only logic — daily vs
   * weekly pricing mode + rounding). The actual cancellation always trusts the server's
   * `refundedAmount` in its response (see `doCancel`), never this estimate.
   */
  private estimateRefund(campaign: AdsCampaign): number {
    const tomorrow = addDays(startOfToday(), 1);
    const start = new Date(`${campaign.startDate}T00:00:00`);
    const end = new Date(`${campaign.endDate}T00:00:00`);
    const refundFrom = start > tomorrow ? start : tomorrow;
    if (refundFrom > end) return 0;
    const msPerDay = 24 * 60 * 60 * 1000;
    const refundDays = Math.round((end.getTime() - refundFrom.getTime()) / msPerDay) + 1;
    return Math.round(campaign.pricePerDay * refundDays * 100) / 100;
  }

  private async doCancel(campaignId: string): Promise<void> {
    this.cancellingId.set(campaignId);
    try {
      const result = await this.ads.cancelCampaign(campaignId);
      if (result.ok) {
        this.message.success(this.translation.t('sellerAds.cancelSuccess', { amount: formatBaht(result.campaign.refundedAmount) }));
        void this.refresh();
        void this.seller.loadEarnings();
      } else if (result.message) {
        this.message.error(result.message);
      }
    } finally {
      this.cancellingId.set(null);
    }
  }

  // ───────────────────────── create-campaign modal actions (§4.2) ─────────────────────────

  async openCreate(): Promise<void> {
    this.selectedDocumentId.set(null);
    this.selectedPlacementKey.set(null);
    this.selectedTargetKey.set(null);
    this.dateRange.set(null);
    this.availability.set(null);
    this.quote.set(null);
    this.formError.set(null);
    this.formOpen.set(true);

    this.loadingForm.set(true);
    try {
      const [placements, docs] = await Promise.all([
        this.ads.loadPlacements(),
        this.seller.listDocumentsPaged({ status: 'approved', pageSize: 100 }),
      ]);
      this.placements.set(placements);
      this.myDocuments.set(docs.items ?? []);
    } finally {
      this.loadingForm.set(false);
    }
  }

  closeForm(): void {
    this.formOpen.set(false);
    if (this.quoteDebounceHandle) clearTimeout(this.quoteDebounceHandle);
  }

  onDocumentChange(id: string | null): void {
    this.selectedDocumentId.set(id);
    this.scheduleQuote();
  }

  /** §4.2 rule 2: placement change re-fetches availability. */
  onPlacementChange(key: string | null): void {
    this.selectedPlacementKey.set(key);
    this.selectedTargetKey.set(null);
    this.dateRange.set(null);
    this.quote.set(null);
    void this.refreshAvailability();
  }

  /** §4.2 rule 2: category (target) change re-fetches availability. */
  onTargetChange(key: string | null): void {
    this.selectedTargetKey.set(key);
    this.dateRange.set(null);
    this.quote.set(null);
    void this.refreshAvailability();
  }

  onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range && range.length === 2 ? range : null);
    this.scheduleQuote();
  }

  /** §4.2 rule 2: re-fetch availability whenever the calendar's visible month changes. */
  onCalendarPanelChange(): void {
    void this.refreshAvailability();
  }

  private async refreshAvailability(): Promise<void> {
    const placement = this.selectedPlacement();
    if (!placement) {
      this.availability.set(null);
      return;
    }
    if (placement.requiresTarget && !this.selectedTargetKey()) {
      this.availability.set(null);
      return;
    }
    const today = new Date();
    const result = await this.ads.loadAvailability({
      placement: placement.placementKey,
      targetKey: placement.requiresTarget ? (this.selectedTargetKey() ?? undefined) : undefined,
      from: toIsoDate(today),
      to: toIsoDate(addDays(today, AVAILABILITY_WINDOW_DAYS)),
    });
    this.availability.set(result);
  }

  /** §4.2 rule 3: debounce 300ms, only once all 4 values are present. */
  private scheduleQuote(): void {
    if (this.quoteDebounceHandle) clearTimeout(this.quoteDebounceHandle);
    this.quoteDebounceHandle = setTimeout(() => void this.fetchQuote(), QUOTE_DEBOUNCE_MS);
  }

  private async fetchQuote(clearError = true): Promise<void> {
    const documentId = this.selectedDocumentId();
    const placement = this.selectedPlacement();
    const range = this.dateRange();
    if (!documentId || !placement || !range || range.length !== 2) {
      this.quote.set(null);
      return;
    }
    if (placement.requiresTarget && !this.selectedTargetKey()) {
      this.quote.set(null);
      return;
    }

    this.quoting.set(true);
    if (clearError) this.formError.set(null);
    try {
      const result = await this.ads.getQuote({
        documentId,
        placementKey: placement.placementKey,
        targetKey: placement.requiresTarget ? this.selectedTargetKey() : null,
        startDate: toIsoDate(range[0]),
        endDate: toIsoDate(range[1]),
      });
      if (result.ok) {
        this.quote.set(result.quote);
      } else {
        this.quote.set(null);
        this.formError.set(result.message);
      }
    } finally {
      this.quoting.set(false);
    }
  }

  async submit(): Promise<void> {
    const documentId = this.selectedDocumentId();
    const placement = this.selectedPlacement();
    const range = this.dateRange();
    const q = this.quote();
    if (!documentId || !placement || !range || range.length !== 2 || !q || this.submitDisabled()) return;

    this.submitting.set(true);
    this.formError.set(null);
    try {
      const result = await this.ads.createCampaign({
        documentId,
        placementKey: placement.placementKey,
        targetKey: placement.requiresTarget ? this.selectedTargetKey() : null,
        startDate: toIsoDate(range[0]),
        endDate: toIsoDate(range[1]),
        expectedTotalAmount: q.totalAmount,
      });
      if (result.ok) {
        this.message.success(this.translation.t('sellerAds.createSuccess'));
        this.closeForm();
        void this.refresh();
        void this.seller.loadEarnings();
        return;
      }
      // §4.2 rule 5: 409 price-changed → auto re-fetch the quote, let the user confirm again.
      if (result.kind === 'price_changed') {
        this.formError.set(result.message);
        await this.fetchQuote(false);
        return;
      }
      // §4.2 rule 6: 409 full-dates → highlight the calendar (availability re-fetch marks them).
      if (result.kind === 'full_dates') {
        this.formError.set(result.message);
        void this.refreshAvailability();
        return;
      }
      this.formError.set(result.message);
    } finally {
      this.submitting.set(false);
    }
  }
}

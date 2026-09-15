import { Injectable, inject } from '@angular/core';
import type {
  AdsAvailability,
  AdsCampaign,
  AdsCampaignDetail,
  AdsCampaignQuote,
  AdsPlacement,
  AdminAdsCampaign,
  AdminAdsPlacement,
} from '../models';
import {
  mapAdsAvailability,
  mapAdsCampaign,
  mapAdsCampaignDetail,
  mapAdsCampaignQuote,
  mapAdsPlacement,
  mapAdminAdsCampaign,
  mapAdminAdsPlacement,
} from '../api-mappers/mappers';
import {
  deleteApiSellerAdsCampaignsByCampaignId,
  getApiAdminAdsCampaigns,
  getApiAdminAdsPlacements,
  getApiSellerAdsAvailability,
  getApiSellerAdsCampaigns,
  getApiSellerAdsCampaignsByCampaignId,
  getApiSellerAdsPlacements,
  postApiAdminAdsCampaignsByCampaignIdStop,
  postApiMarketplaceAdsByCampaignIdClick,
  postApiMarketplaceAdsImpressions,
  postApiSellerAdsCampaigns,
  postApiSellerAdsCampaignsQuote,
  putApiAdminAdsPlacementsByPlacementKey,
} from '../api';
import { unwrapSdkResult, extractErrorStatus } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { PagedResult } from './infinite-pager';

/**
 * seller-ads-promotion v1 (docs/contracts/seller-ads-promotion.md §3, §4) — this round: backend
 * shipped and gate 1 passed, `npm run generate:api` regenerated the SDK against the live backend.
 * Every method below calls through the real generated `core/api` functions.
 *
 * §3 (§0 item 12): every ads endpoint returns the plain `BadRequest(new { message })` /
 * `Conflict(new { message, fullDates? })` / `NotFound()` (empty) shape — never the full
 * `ApiErrorResponse` from `GlobalExceptionMiddleware` — same convention already documented in
 * `PayoutAccountService`. `@hey-api/client-fetch` throws the parsed body itself for those, with no
 * `status` field attached, so {@link rawMessage}/{@link rawFullDates} below read the body directly
 * rather than branching on `extractErrorStatus`.
 *
 * §4.1: `features/**` never import the SDK directly (audit:guard) — this is the *only* place in
 * the app that calls any of the 13 ads endpoints, including the two public impression/click
 * counters (§4.3) — components (document-card, marketplace page, seller/admin ads pages) all go
 * through this service.
 */

/** §0 item 12 / §3: a direct controller `BadRequest`/`Conflict` body has no `status` field — that absence is what identifies it (a native `Error`/network failure is excluded so "Failed to fetch" never masquerades as a validation message). */
function rawMessage(error: unknown): string | null {
  if (error == null || typeof error !== 'object' || error instanceof Error) return null;
  const o = error as Record<string, unknown>;
  if (extractErrorStatus(o) !== undefined) return null;
  return typeof o['message'] === 'string' && o['message'] ? o['message'] : null;
}

/** §3.4 step 7: the slot-full 409's body carries `fullDates` alongside `message` — that field is what tells it apart from the price-changed 409, which has the same (missing-`status`) shape otherwise. */
function rawFullDates(error: unknown): string[] | undefined {
  if (error == null || typeof error !== 'object') return undefined;
  const fd = (error as Record<string, unknown>)['fullDates'];
  if (!Array.isArray(fd)) return undefined;
  return fd.filter((d): d is string => typeof d === 'string');
}

export interface AdsCampaignQuoteParams {
  documentId: string;
  placementKey: string;
  targetKey?: string | null;
  startDate: string;
  endDate: string;
}

export interface CreateAdsCampaignParams extends AdsCampaignQuoteParams {
  expectedTotalAmount: number;
}

export type CreateAdsCampaignResult =
  | { ok: true; campaign: AdsCampaign }
  /** §4.2 rule 5: auto re-fetch the quote and let the user confirm again — never resubmit automatically. */
  | { ok: false; kind: 'price_changed'; message: string }
  /** §4.2 rule 6: highlight these dates on the calendar. */
  | { ok: false; kind: 'full_dates'; message: string; fullDates: string[] }
  | { ok: false; kind: 'generic'; message: string };

@Injectable({ providedIn: 'root' })
export class AdsService {
  private readonly apiFail = inject(ApiFailureReporter);

  /**
   * §4.3: "ยิงครั้งเดียวต่อผลลัพธ์หนึ่งชุด" — keyed off the *identity* of the result-set array a
   * page passes in (a fresh fetch always produces a new array reference; an OnPush re-render of
   * the same array does not), so a genuinely new search/page fires again while a re-render never
   * does, without the page having to invent its own dedup key.
   */
  private readonly seenImpressionResultSets = new WeakSet<object>();

  // ───────────────────────── Seller: placements / availability / quote ─────────────────────────

  /** `GET /api/seller/ads/placements` (§3.1) — only `IsEnabled` placements. */
  async loadPlacements(): Promise<AdsPlacement[]> {
    try {
      const data = unwrapSdkResult(await getApiSellerAdsPlacements());
      return (data ?? []).map(mapAdsPlacement);
    } catch (e) {
      this.apiFail.report('โหลดตำแหน่งโฆษณาไม่สำเร็จ', e);
      return [];
    }
  }

  /** `GET /api/seller/ads/availability` (§3.2) — `null` on any failure (including the documented 400/404). */
  async loadAvailability(params: {
    placement: string;
    targetKey?: string;
    from: string;
    to: string;
  }): Promise<AdsAvailability | null> {
    try {
      const data = unwrapSdkResult(
        await getApiSellerAdsAvailability({
          query: {
            placement: params.placement,
            targetKey: params.targetKey,
            from: params.from,
            to: params.to,
          },
        }),
      );
      return mapAdsAvailability(data);
    } catch (e) {
      const msg = rawMessage(e);
      if (!msg) this.apiFail.report('โหลดความว่างของตำแหน่งโฆษณาไม่สำเร็จ', e);
      return null;
    }
  }

  /** `POST /api/seller/ads/campaigns/quote` (§3.3) — §4.2 rule 1: the only source of money figures shown in the form. */
  async getQuote(
    params: AdsCampaignQuoteParams,
  ): Promise<{ ok: true; quote: AdsCampaignQuote } | { ok: false; message: string }> {
    try {
      const data = unwrapSdkResult(
        await postApiSellerAdsCampaignsQuote({
          body: {
            documentId: params.documentId,
            placementKey: params.placementKey,
            targetKey: params.targetKey ?? null,
            startDate: params.startDate,
            endDate: params.endDate,
          },
        }),
      );
      return { ok: true, quote: mapAdsCampaignQuote(data) };
    } catch (e) {
      const msg = rawMessage(e);
      if (msg) return { ok: false, message: msg };
      this.apiFail.report('คำนวณราคาแคมเปญไม่สำเร็จ', e);
      return { ok: false, message: 'คำนวณราคาแคมเปญไม่สำเร็จ' };
    }
  }

  // ───────────────────────── Seller: campaigns ─────────────────────────

  /** `GET /api/seller/ads/campaigns` (§3.5). */
  async listCampaigns(query: {
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PagedResult<AdsCampaign>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    try {
      const data = unwrapSdkResult(
        await getApiSellerAdsCampaigns({
          query: {
            Page: page,
            PageSize: pageSize,
            status: query.status && query.status !== 'all' ? query.status : undefined,
          },
        }),
      );
      return {
        items: (data.items ?? []).map(mapAdsCampaign),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('โหลดรายการแคมเปญโฆษณาไม่สำเร็จ', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  /** `GET /api/seller/ads/campaigns/{id}` (§3.6) — `null` on 404 (not found / not this seller's) and on any other failure. */
  async getCampaign(campaignId: string): Promise<AdsCampaignDetail | null> {
    try {
      const data = unwrapSdkResult(
        await getApiSellerAdsCampaignsByCampaignId({ path: { campaignId } }),
      );
      return mapAdsCampaignDetail(data);
    } catch (e) {
      this.apiFail.report('โหลดรายละเอียดแคมเปญไม่สำเร็จ', e);
      return null;
    }
  }

  /** `POST /api/seller/ads/campaigns` (§3.4) — the create flow's ordered validation/lock/charge steps all happen server-side; this just reports which shape of failure came back. */
  async createCampaign(params: CreateAdsCampaignParams): Promise<CreateAdsCampaignResult> {
    try {
      const data = unwrapSdkResult(
        await postApiSellerAdsCampaigns({
          body: {
            documentId: params.documentId,
            placementKey: params.placementKey,
            targetKey: params.targetKey ?? null,
            startDate: params.startDate,
            endDate: params.endDate,
            expectedTotalAmount: params.expectedTotalAmount,
          },
        }),
      );
      return { ok: true, campaign: mapAdsCampaign(data) };
    } catch (e) {
      const fullDates = rawFullDates(e);
      if (fullDates) {
        return {
          ok: false,
          kind: 'full_dates',
          message: rawMessage(e) ?? 'ช่วงวันที่เลือกมีวันที่เต็มแล้ว กรุณาเลือกวันอื่น',
          fullDates,
        };
      }
      const msg = rawMessage(e);
      if (msg?.includes('ราคาเปลี่ยนแปลง')) {
        return { ok: false, kind: 'price_changed', message: msg };
      }
      if (msg) return { ok: false, kind: 'generic', message: msg };
      this.apiFail.report('สร้างแคมเปญโฆษณาไม่สำเร็จ', e);
      return { ok: false, kind: 'generic', message: 'สร้างแคมเปญโฆษณาไม่สำเร็จ' };
    }
  }

  /** `DELETE /api/seller/ads/campaigns/{id}` (§3.7) — cancel + refund. */
  async cancelCampaign(
    campaignId: string,
  ): Promise<{ ok: true; campaign: AdsCampaign } | { ok: false; message?: string }> {
    try {
      const data = unwrapSdkResult(
        await deleteApiSellerAdsCampaignsByCampaignId({ path: { campaignId } }),
      );
      return { ok: true, campaign: mapAdsCampaign(data) };
    } catch (e) {
      const msg = rawMessage(e);
      if (msg) return { ok: false, message: msg };
      this.apiFail.report('ยกเลิกแคมเปญโฆษณาไม่สำเร็จ', e);
      return { ok: false };
    }
  }

  // ───────────────────────── Admin ─────────────────────────

  /** `GET /api/admin/ads/campaigns` (§3.11.1). */
  async adminListCampaigns(query: {
    status?: string;
    sellerId?: string;
    placement?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PagedResult<AdminAdsCampaign>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    try {
      const data = unwrapSdkResult(
        await getApiAdminAdsCampaigns({
          query: {
            Page: page,
            PageSize: pageSize,
            status: query.status && query.status !== 'all' ? query.status : undefined,
            sellerId: query.sellerId || undefined,
            placement: query.placement && query.placement !== 'all' ? query.placement : undefined,
          },
        }),
      );
      return {
        items: (data.items ?? []).map(mapAdminAdsCampaign),
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('โหลดรายการแคมเปญโฆษณาไม่สำเร็จ', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  /** `POST /api/admin/ads/campaigns/{id}/stop` (§3.11.2). */
  async adminStopCampaign(
    campaignId: string,
    reason: string,
    refundRemainingDays: boolean,
  ): Promise<{ ok: true; campaign: AdminAdsCampaign } | { ok: false; message?: string }> {
    try {
      const data = unwrapSdkResult(
        await postApiAdminAdsCampaignsByCampaignIdStop({
          path: { campaignId },
          body: { reason, refundRemainingDays },
        }),
      );
      return { ok: true, campaign: mapAdminAdsCampaign(data) };
    } catch (e) {
      const msg = rawMessage(e);
      if (msg) return { ok: false, message: msg };
      this.apiFail.report('ระงับแคมเปญโฆษณาไม่สำเร็จ', e);
      return { ok: false };
    }
  }

  /** `GET /api/admin/ads/placements` (§3.11.3) — every row, including disabled ones. */
  async adminListPlacements(): Promise<AdminAdsPlacement[]> {
    try {
      const data = unwrapSdkResult(await getApiAdminAdsPlacements());
      return (data ?? []).map(mapAdminAdsPlacement);
    } catch (e) {
      this.apiFail.report('โหลดตำแหน่งโฆษณาไม่สำเร็จ', e);
      return [];
    }
  }

  /** `PUT /api/admin/ads/placements/{key}` (§3.11.4). */
  async adminUpdatePlacement(
    placementKey: string,
    body: {
      pricePerDay: number;
      weeklyPrice: number | null;
      dailySlotCapacity: number;
      maxPerResultPage: number;
      isEnabled: boolean;
    },
  ): Promise<{ ok: true; placement: AdminAdsPlacement } | { ok: false; message?: string }> {
    try {
      const data = unwrapSdkResult(
        await putApiAdminAdsPlacementsByPlacementKey({ path: { placementKey }, body }),
      );
      return { ok: true, placement: mapAdminAdsPlacement(data) };
    } catch (e) {
      const msg = rawMessage(e);
      if (msg) return { ok: false, message: msg };
      this.apiFail.report('บันทึกตำแหน่งโฆษณาไม่สำเร็จ', e);
      return { ok: false };
    }
  }

  // ───────────────────────── Public: impression / click counters (§3.8, §4.3) ─────────────────────────

  /**
   * §4.3: called once per rendered result set (the caller passes the same array reference it
   * renders from — typically a signal's current value — so a re-render never re-fires this).
   * Fire-and-forget: never awaited by the caller, never toasts on failure, silently skips
   * `campaignIds` that end up empty (nothing sponsored on this page).
   */
  recordImpressions(resultSet: object, campaignIds: readonly (string | undefined)[]): void {
    if (this.seenImpressionResultSets.has(resultSet)) return;
    this.seenImpressionResultSets.add(resultSet);
    const unique = Array.from(
      new Set(campaignIds.filter((id): id is string => !!id)),
    );
    if (unique.length === 0) return;
    void postApiMarketplaceAdsImpressions({ body: { campaignIds: unique } }).catch(() => {
      // §4.3: fire-and-forget — an impression that fails to record must never surface a toast.
    });
  }

  /**
   * §4.3/§3.8.2: fired on a sponsored card's click, *before* navigation — the caller must never
   * `await` this (it would delay opening the document). Errors are swallowed for the same reason
   * impressions are: this is telemetry, not a user-facing action.
   */
  recordClick(campaignId: string | undefined): void {
    if (!campaignId) return;
    void postApiMarketplaceAdsByCampaignIdClick({ path: { campaignId } }).catch(() => {
      // §4.3: fire-and-forget.
    });
  }
}

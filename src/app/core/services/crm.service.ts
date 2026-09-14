import { Injectable, inject, signal } from '@angular/core';
import type {
  CrmOverview,
  CrmSegmentUser,
  CrmUserDetail,
  MyCrmProfile,
} from '../models';
import { createServerPager, type ServerPager } from './server-pager';

/**
 * crm-core v1 (`docs/contracts/crm-core.md`) §3, §4.2 — buyer privacy self-service
 * (`/account/privacy`, §3.1–§3.3) and admin CRM inspection (`/admin/crm/**`, §3.4–§3.6).
 *
 * **Round 1 (this file, crm-core-fe-1/fe-2)**: every method that would call one of the 6 new
 * endpoints throws `TODO(contract)` — none of them exist in the generated SDK yet, and this
 * build round is explicitly forbidden from running `npm run generate:api` (§4.5/§6.5/§6.6).
 * The surrounding loading-signal bookkeeping is real and stays as-is; only the throwing line
 * gets replaced by the real SDK call + mapper in round 2 (`crm-core-fe-wire`, §6.7), same as
 * `AdminService`'s F-08 stub round did for `searchUsers`/`getUser`/`suspendUser`/etc.
 *
 * Pages call these directly and report failures themselves via `ApiFailureReporter` (same
 * pattern as `AdminSubscriptionsPage.reload()` / `AdminFeedbackPage.reload()`) rather than the
 * service swallowing errors internally — there is nothing useful to fall back to here, so a
 * silent empty state would look like "the user really has no data" instead of "not wired yet".
 */
@Injectable({ providedIn: 'root' })
export class CrmService {
  // ====== Buyer: §3.1–§3.3 ======

  private readonly _myProfile = signal<MyCrmProfile | null>(null);
  private readonly _loadingMine = signal(false);

  readonly myProfile = this._myProfile.asReadonly();
  readonly loadingMine = this._loadingMine.asReadonly();

  /** §3.1 `GET /api/me/crm` — never 404s (AC-11); a caller with no profile yet still gets a 200. */
  async loadMine(): Promise<void> {
    this._loadingMine.set(true);
    try {
      // TODO(contract): crm-core v1 §3.1 — GET /api/me/crm, wire after generate:api (round 2)
      throw new Error('TODO(contract): GET /api/me/crm ยังไม่ได้ wire SDK');
    } finally {
      this._loadingMine.set(false);
    }
  }

  /** §3.2 `PUT /api/me/crm/tracking` — idempotent; `enabled=false` also purges existing data server-side. */
  async setTracking(enabled: boolean): Promise<void> {
    // TODO(contract): crm-core v1 §3.2 — PUT /api/me/crm/tracking, wire after generate:api (round 2)
    throw new Error(`TODO(contract): PUT /api/me/crm/tracking (enabled=${enabled}) ยังไม่ได้ wire SDK`);
  }

  /** §3.3 `DELETE /api/me/crm` — idempotent 204; does not touch `trackingEnabled` (§3.3 note). */
  async deleteMyData(): Promise<void> {
    // TODO(contract): crm-core v1 §3.3 — DELETE /api/me/crm, wire after generate:api (round 2)
    throw new Error('TODO(contract): DELETE /api/me/crm ยังไม่ได้ wire SDK');
  }

  /** Test helper — mirrors `NotificationConfigService.setItemsForTest`. */
  setMyProfileForTest(profile: MyCrmProfile | null): void {
    this._myProfile.set(profile);
  }

  // ====== Admin: §3.4–§3.6 ======

  private readonly _adminOverview = signal<CrmOverview | null>(null);
  private readonly _loadingOverview = signal(false);

  readonly adminOverview = this._adminOverview.asReadonly();
  readonly loadingOverview = this._loadingOverview.asReadonly();

  /** §3.4 `GET /api/admin/crm/overview`. */
  async loadOverview(): Promise<void> {
    this._loadingOverview.set(true);
    try {
      // TODO(contract): crm-core v1 §3.4 — GET /api/admin/crm/overview, wire after generate:api (round 2)
      throw new Error('TODO(contract): GET /api/admin/crm/overview ยังไม่ได้ wire SDK');
    } finally {
      this._loadingOverview.set(false);
    }
  }

  /** Test helper — mirrors `NotificationConfigService.setItemsForTest`. */
  setAdminOverviewForTest(overview: CrmOverview | null): void {
    this._adminOverview.set(overview);
  }

  /**
   * §3.5 `GET /api/admin/crm/segments/{code}/users` — same `ServerPager` shape
   * `SubscriptionService.accessHistoryPagerInstance` already uses (service holds the pager,
   * page reads its signals + calls the 3 proxy methods below).
   */
  private readonly segmentUsersPagerInstance: ServerPager<CrmSegmentUser, string> =
    createServerPager<CrmSegmentUser, string>({
      pageSize: 20,
      errorMessage: 'โหลดสมาชิกของ segment ไม่สำเร็จ',
      fetch: async () => {
        // TODO(contract): crm-core v1 §3.5 — GET /api/admin/crm/segments/{code}/users, wire after generate:api (round 2)
        throw new Error('TODO(contract): GET /api/admin/crm/segments/{code}/users ยังไม่ได้ wire SDK');
      },
    });

  readonly segmentUsers = this.segmentUsersPagerInstance.items;
  readonly segmentUsersPage = this.segmentUsersPagerInstance.page;
  readonly segmentUsersPageSize = this.segmentUsersPagerInstance.pageSize;
  readonly segmentUsersTotalCount = this.segmentUsersPagerInstance.totalCount;
  readonly segmentUsersTotalPages = this.segmentUsersPagerInstance.totalPages;
  readonly segmentUsersLoading = this.segmentUsersPagerInstance.loading;

  async loadSegmentUsers(code: string): Promise<void> {
    await this.segmentUsersPagerInstance.reloadFromPage1(code);
  }

  async onSegmentUsersPageChange(page: number): Promise<void> {
    await this.segmentUsersPagerInstance.onPageChange(page);
  }

  async onSegmentUsersPageSizeChange(size: number): Promise<void> {
    await this.segmentUsersPagerInstance.onPageSizeChange(size);
  }

  private readonly _userDetail = signal<CrmUserDetail | null>(null);
  private readonly _loadingUserDetail = signal(false);

  readonly userDetail = this._userDetail.asReadonly();
  readonly loadingUserDetail = this._loadingUserDetail.asReadonly();

  /** §3.6 `GET /api/admin/crm/users/{userId}` — feeds `CrmUserPanelComponent`. */
  async loadUserDetail(userId: string): Promise<void> {
    this._loadingUserDetail.set(true);
    try {
      // TODO(contract): crm-core v1 §3.6 — GET /api/admin/crm/users/{userId}, wire after generate:api (round 2)
      throw new Error(`TODO(contract): GET /api/admin/crm/users/${userId} ยังไม่ได้ wire SDK`);
    } finally {
      this._loadingUserDetail.set(false);
    }
  }

  /** Test helper — mirrors `NotificationConfigService.setItemsForTest`. */
  setUserDetailForTest(detail: CrmUserDetail | null): void {
    this._userDetail.set(detail);
  }
}

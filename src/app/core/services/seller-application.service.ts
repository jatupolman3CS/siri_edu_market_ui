import { Injectable, inject, signal } from '@angular/core';
import {
  getApiMeSellerApplication,
  postApiMeSellerApplication,
  getApiAdminSellerApplications,
  postApiAdminSellerApplicationsByUserIdApprove,
  postApiAdminSellerApplicationsByUserIdReject,
} from '../api';
import type {
  AdminSellerApplicationResponse,
  SellerApplicationResponse,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';

export type SellerApplicationStatus = 'pending' | 'approved' | 'rejected';

/**
 * GAP-01: buyer-to-seller onboarding. There was previously no way to become a seller
 * through the site — SELLER_PROFILE rows only came from the database seeder.
 */
@Injectable({ providedIn: 'root' })
export class SellerApplicationService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _mine = signal<SellerApplicationResponse | null>(null);
  private readonly _loading = signal<boolean>(false);

  /** The signed-in user's application, or null when they have never applied. */
  readonly mine = this._mine.asReadonly();
  readonly loading = this._loading.asReadonly();

  async loadMine(): Promise<SellerApplicationResponse | null> {
    this._loading.set(true);
    try {
      const result = await getApiMeSellerApplication();
      // 404 simply means "has not applied yet" — not an error worth reporting.
      if (result.response?.status === 404) {
        this._mine.set(null);
        return null;
      }
      const data = unwrapSdkResult(result);
      this._mine.set(data);
      return data;
    } catch {
      this._mine.set(null);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  async submit(input: {
    studioName: string;
    bio: string;
    specialties: string[];
  }): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await postApiMeSellerApplication({ body: input });
      this._mine.set(unwrapSdkResult(result));
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ส่งใบสมัครผู้ขาย', e);
      return { ok: false, error: 'ส่งใบสมัครไม่สำเร็จ' };
    }
  }

  // ===== Admin =====

  async listPending(page = 1, pageSize = 20): Promise<AdminSellerApplicationResponse[]> {
    try {
      const result = await getApiAdminSellerApplications({ query: { Page: page, PageSize: pageSize } });
      return unwrapSdkResult(result).items ?? [];
    } catch (e) {
      this.apiFail.report('โหลดใบสมัครผู้ขาย', e);
      return [];
    }
  }

  async listPendingPaged(
    page = 1,
    pageSize = 10,
  ): Promise<{ items: AdminSellerApplicationResponse[]; totalCount: number; page: number; pageSize: number; totalPages: number }> {
    try {
      const result = await getApiAdminSellerApplications({ query: { Page: page, PageSize: pageSize } });
      const data = unwrapSdkResult(result);
      return {
        items: data.items ?? [],
        page: data.page ?? page,
        pageSize: data.pageSize ?? pageSize,
        totalCount: data.totalCount ?? 0,
        totalPages: data.totalPages ?? 1,
      };
    } catch (e) {
      this.apiFail.report('โหลดใบสมัครผู้ขาย', e);
      return { items: [], page, pageSize, totalCount: 0, totalPages: 1 };
    }
  }

  async approve(userId: string): Promise<boolean> {
    try {
      await postApiAdminSellerApplicationsByUserIdApprove({ path: { userId }, throwOnError: true });
      return true;
    } catch (e) {
      this.apiFail.report('อนุมัติใบสมัครผู้ขาย', e);
      return false;
    }
  }

  async reject(userId: string, reason: string): Promise<boolean> {
    try {
      await postApiAdminSellerApplicationsByUserIdReject({
        path: { userId },
        body: { reason },
        throwOnError: true,
      });
      return true;
    } catch (e) {
      this.apiFail.report('ปฏิเสธใบสมัครผู้ขาย', e);
      return false;
    }
  }
}

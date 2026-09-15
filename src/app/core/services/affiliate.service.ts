import { Injectable, inject, signal } from '@angular/core';
import type { AffiliateSummary } from '../models';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { unwrapSdkResult } from './api-result';
import { mapAffiliateSummary } from '../api-mappers/mappers';
import { getApiMeAffiliate } from '../api';
import { captureAffiliateClick } from '../util/affiliate-capture';

/**
 * referral-program v2 §3.7 / §4.1 (docs/contracts/referral-program.md §4.1)
 * Manages affiliate program summary and state for current buyer.
 */
@Injectable({ providedIn: 'root' })
export class AffiliateService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _summary = signal<AffiliateSummary | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());

  readonly summary = this._summary.asReadonly();
  readonly state = this._state.asReadonly();

  constructor() {
    void captureAffiliateClick().catch(() => {
      // fire-and-forget error guard
    });
  }

  /** referral-program v2 §3.7: `GET /api/me/affiliate` — lazy-creates the link server-side. */
  async refreshSummary(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      const result = await getApiMeAffiliate();
      const data = unwrapSdkResult(result);
      this._summary.set(data ? mapAffiliateSummary(data) : null);
      this._state.set(idleActionState());
    } catch (e) {
      this.apiFail.report('โหลดข้อมูลลิงก์พันธมิตร', e);
      this._summary.set(null);
      this._state.set(errorActionState('โหลดข้อมูลลิงก์พันธมิตรไม่สำเร็จ'));
    }
  }

  /**
   * Test helper to set summary directly in component tests.
   */
  setSummaryForTest(summary: AffiliateSummary | null): void {
    this._summary.set(summary);
  }
}

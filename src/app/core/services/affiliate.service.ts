import { Injectable, signal } from '@angular/core';
import type { AffiliateSummary } from '../models';
import {
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { captureAffiliateClick } from '../util/affiliate-capture';

/**
 * referral-program v2 §3.7 / §4.1 (docs/contracts/referral-program.md §4.1)
 * Manages affiliate program summary and state for current buyer.
 */
@Injectable({ providedIn: 'root' })
export class AffiliateService {
  private readonly _summary = signal<AffiliateSummary | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());

  readonly summary = this._summary.asReadonly();
  readonly state = this._state.asReadonly();

  constructor() {
    void captureAffiliateClick().catch(() => {
      // fire-and-forget error guard
    });
  }

  /**
   * Refreshes the current user's affiliate summary from GET /api/me/affiliate.
   * In round 1, backend is not generated yet.
   */
  async refreshSummary(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      // TODO(contract): wire หลัง regen คืน null ไปก่อน ห้าม hardcode ตัวเลขปลอมที่ดูเหมือนของจริง
      this._summary.set(null);
      this._state.set(idleActionState());
    } catch {
      this._summary.set(null);
      this._state.set(idleActionState());
    }
  }

  /**
   * Test helper to set summary directly in component tests.
   */
  setSummaryForTest(summary: AffiliateSummary | null): void {
    this._summary.set(summary);
  }
}

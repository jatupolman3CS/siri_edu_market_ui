import { Injectable, signal } from '@angular/core';
import type { ReferralCodeValidation, ReferralSummary } from '../models';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { captureReferralCode } from '../util/referral-capture';
import { getApiMeReferral, getApiMeReferralValidate } from '../api';
import { mapReferralCodeValidation, mapReferralSummary } from '../api-mappers/mappers';
import { unwrapSdkResult } from './api-result';

/**
 * referral-program v1 (docs/contracts/referral-program.md §3, §4)
 * Manages referral summary and validation for buyer referral program.
 */
@Injectable({ providedIn: 'root' })
export class ReferralService {
  private readonly _summary = signal<ReferralSummary | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());

  readonly summary = this._summary.asReadonly();
  readonly state = this._state.asReadonly();

  constructor() {
    captureReferralCode();
  }

  /**
   * Refreshes the current user's referral summary from GET /api/me/referral.
   */
  async refreshSummary(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      const result = await getApiMeReferral();
      const data = unwrapSdkResult(result);
      if (data) {
        this._summary.set(mapReferralSummary(data));
        this._state.set(idleActionState());
        return;
      }
      this._summary.set(null);
      this._state.set(idleActionState());
    } catch {
      this._summary.set(null);
      this._state.set(idleActionState());
    }
  }

  /**
   * Validates a referral code for the current user via GET /api/me/referral/validate?code=.
   */
  async validateCode(code: string): Promise<ReferralCodeValidation> {
    const trimmed = code?.trim() ?? '';
    if (!trimmed) {
      return { valid: false, reasonText: 'กรุณากรอกโค้ดแนะนำเพื่อน' };
    }

    try {
      const result = await getApiMeReferralValidate({ query: { code: trimmed } });
      const data = unwrapSdkResult(result);
      if (data) {
        return mapReferralCodeValidation(data);
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Test helper to set summary directly in component tests.
   */
  setSummaryForTest(summary: ReferralSummary | null): void {
    this._summary.set(summary);
  }
}

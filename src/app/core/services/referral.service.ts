import { Injectable, signal } from '@angular/core';
import type { ReferralCodeValidation, ReferralSummary } from '../models';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { captureReferralCode } from '../util/referral-capture';

/**
 * Sentinel thrown at not-yet-wired SDK call sites.
 * TODO(contract): remove in round 2 once SDK is regenerated.
 */
class NotWiredYetError extends Error {
  constructor() {
    super('TODO(contract): wire หลัง regen');
  }
}

/**
 * referral-program v1 (docs/contracts/referral-program.md §3, §4)
 * Manages referral summary and validation stub for buyer referral program.
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
      // TODO(contract): wire หลัง regen — แทนบรรทัดถัดไปด้วย:
      //   const data = unwrapSdkResult(await getApiMeReferral());
      //   this._summary.set(mapReferralSummary(data));
      //   this._state.set(idleActionState());
      //   return;
      throw new NotWiredYetError();
    } catch (e) {
      if (e instanceof NotWiredYetError) {
        this._summary.set(null);
        this._state.set(idleActionState());
        return;
      }
      this._state.set(errorActionState('โหลดข้อมูลชวนเพื่อนไม่สำเร็จ'));
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
      // TODO(contract): wire หลัง regen — แทนบรรทัดถัดไปด้วย:
      //   const data = unwrapSdkResult(await getApiMeReferralValidate({ query: { code: trimmed } }));
      //   return mapReferralCodeValidation(data);
      throw new NotWiredYetError();
    } catch (e) {
      if (e instanceof NotWiredYetError) {
        return { valid: false };
      }
      return { valid: false, reasonText: 'ตรวจสอบโค้ดไม่สำเร็จ' };
    }
  }

  /**
   * Test helper to set summary directly in component tests.
   */
  setSummaryForTest(summary: ReferralSummary | null): void {
    this._summary.set(summary);
  }
}

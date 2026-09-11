import { Injectable, inject } from '@angular/core';
import {
  getApiMeOnboarding,
  postApiMeOnboardingSkip,
  putApiMeOnboardingInterests,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';

export interface OnboardingStatus {
  isCompleted: boolean;
  interestCategoryIds: string[];
}

/**
 * registration-onboarding v1 §4.5: manages buyer/seller onboarding status,
 * category interest selections, and onboarding completion.
 *
 * Round 2 (wired): every call below hits the regenerated SDK for real now (gate 1 confirmed
 * backend matches this contract, snapshot updated, `npm run generate:api` regenerated
 * `sdk.gen.ts`/`types.gen.ts` against the live backend) — no more raw `client` fetch/type-assertion.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly apiFail = inject(ApiFailureReporter);

  async getStatus(): Promise<OnboardingStatus> {
    try {
      const data = unwrapSdkResult(await getApiMeOnboarding());
      return {
        isCompleted: data.isCompleted,
        interestCategoryIds: data.interestCategoryIds ?? [],
      };
    } catch (e) {
      this.apiFail.report('ดึงข้อมูล Onboarding', e);
      return {
        isCompleted: false,
        interestCategoryIds: [],
      };
    }
  }

  async updateInterests(categoryIds: string[]): Promise<{ ok: boolean; error?: string }> {
    try {
      await putApiMeOnboardingInterests({ body: { categoryIds } });
      return { ok: true };
    } catch (e) {
      this.apiFail.report('บันทึกหมวดหมู่ที่สนใจ', e);
      const msg = e instanceof Error ? e.message : '';
      return { ok: false, error: msg || 'บันทึกหมวดหมู่ไม่สำเร็จ' };
    }
  }

  async skip(): Promise<{ ok: boolean; error?: string }> {
    try {
      await postApiMeOnboardingSkip();
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ข้าม Onboarding', e);
      const msg = e instanceof Error ? e.message : '';
      return { ok: false, error: msg || 'ข้ามขั้นตอนไม่สำเร็จ' };
    }
  }
}

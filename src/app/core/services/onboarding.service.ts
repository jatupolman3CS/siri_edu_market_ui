import { Injectable, inject } from '@angular/core';
import { client } from '../api/client.gen';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';

export interface OnboardingStatus {
  isCompleted: boolean;
  interestCategoryIds: string[];
}

/**
 * registration-onboarding v1 §4.5: manages buyer/seller onboarding status,
 * category interest selections, and onboarding completion.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly apiFail = inject(ApiFailureReporter);

  async getStatus(): Promise<OnboardingStatus> {
    try {
      const result = await (client as unknown as {
        get: (opts: { url: string }) => Promise<{ data?: OnboardingStatus; error?: unknown }>;
      }).get({ url: '/api/me/onboarding' });
      const res = unwrapSdkResult(result as any) as unknown as OnboardingStatus;
      return {
        isCompleted: Boolean(res.isCompleted),
        interestCategoryIds: Array.isArray(res.interestCategoryIds) ? res.interestCategoryIds : [],
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
      const result = await (client as unknown as {
        put: (opts: { url: string; body: { categoryIds: string[] } }) => Promise<{ data?: OnboardingStatus; error?: unknown }>;
      }).put({
        url: '/api/me/onboarding/interests',
        body: { categoryIds },
      });
      unwrapSdkResult(result as any);
      return { ok: true };
    } catch (e) {
      this.apiFail.report('บันทึกหมวดหมู่ที่สนใจ', e);
      const msg = e instanceof Error ? e.message : '';
      return { ok: false, error: msg || 'บันทึกหมวดหมู่ไม่สำเร็จ' };
    }
  }

  async skip(): Promise<{ ok: boolean; error?: string }> {
    try {
      const result = await (client as unknown as {
        post: (opts: { url: string }) => Promise<{ data?: OnboardingStatus; error?: unknown }>;
      }).post({ url: '/api/me/onboarding/skip' });
      unwrapSdkResult(result as any);
      return { ok: true };
    } catch (e) {
      this.apiFail.report('ข้าม Onboarding', e);
      const msg = e instanceof Error ? e.message : '';
      return { ok: false, error: msg || 'ข้ามขั้นตอนไม่สำเร็จ' };
    }
  }
}

import { Injectable, inject, signal } from '@angular/core';
import type { DocumentItem, ExamCountdownExamType, ExamCountdownSetting } from '../models';
import { mapDocument, mapExamCountdownSetting } from '../api-mappers/mappers';
import {
  deleteApiMeExamCountdown,
  getApiMarketplaceSearch,
  getApiMeExamCountdown,
  patchApiMeExamCountdownEnabled,
  putApiMeExamCountdown,
} from '../api';
import { extractErrorStatus, unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';
import { createInfinitePager } from './infinite-pager';

/**
 * exam-countdown-mode v1 (docs/contracts/exam-countdown-mode.md §3, §4) — service-as-store for
 * "โหมดใกล้สอบ", shared by the homepage banner+grid (`home.page.ts`) and the permanent settings
 * form on `/account` (`ExamCountdownFormComponent`, both places).
 *
 * Round 2 (wired): `GET`/`PUT`/`PATCH .../enabled`/`DELETE api/me/exam-countdown` all call the
 * regenerated SDK for real now (gate 1 confirmed backend matches this contract, snapshot updated,
 * `npm run generate:api` regenerated `sdk.gen.ts`/`types.gen.ts` against the live backend).
 *
 * `daysRemaining`/`isPast` are intentionally NOT modeled on {@link ExamCountdownSetting} — §0
 * การตัดสินใจที่ 3 / §3.1: the backend never computes them, only the raw `examDate`. Every caller
 * derives them via {@link daysRemainingFromExamDate} (AC-17).
 */
@Injectable({ providedIn: 'root' })
export class ExamCountdownService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _setting = signal<ExamCountdownSetting | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());

  /** Used by `docsPager.fetch` — set whenever `_setting` carries a real `examType`. */
  private currentExamType: ExamCountdownExamType | null = null;

  readonly setting = this._setting.asReadonly();
  /** `loading` vs `idle` distinguishes "still fetching" from "fetched, no setting yet" (both `setting()===null`). */
  readonly state = this._state.asReadonly();

  /**
   * เอกสารที่กรองตาม `examType` ปัจจุบัน — reuse `getApiMarketplaceSearch` ตรง ๆ (endpoint เดิม, มี
   * อยู่แล้วในระบบก่อนสเปกนี้) ไม่มี endpoint ใหม่สำหรับ grid นี้เลย (§0 ข้อ 3, การตัดสินใจที่ 1/2).
   */
  readonly docsPager = createInfinitePager<DocumentItem>({
    pageSize: 20,
    fetch: async (page, pageSize) => {
      const examType = this.currentExamType;
      if (!examType) {
        return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
      }
      const result = await getApiMarketplaceSearch({
        query: { Standard: examType, Page: page, PageSize: pageSize },
      });
      const data = unwrapSdkResult(result);
      return {
        items: (data.items ?? []).map(mapDocument),
        page: data.page,
        pageSize: data.pageSize,
        totalCount: data.totalCount,
        totalPages: data.totalPages,
      };
    },
    errorMessage: 'โหลดเอกสารไม่สำเร็จ',
  });

  readonly docs = this.docsPager.items;
  readonly docsState = this.docsPager.state;
  readonly hasMoreDocs = this.docsPager.hasMore;

  /**
   * `GET /api/me/exam-countdown` (§3.1). 404 (ยังไม่เคยตั้งค่า) = ไม่ใช่ error state ปกติ — set
   * `setting()` เป็น `null` เฉย ๆ ไม่รายงานผ่าน `ApiFailureReporter` (AC-5/AC-6). Caller (home page)
   * ต้อง guard ด้วย `auth.isAuthenticated()` ก่อนเสมอ (§0 ข้อ 11) — service นี้ไม่ guard เอง.
   *
   * gate 1 finding, verified live (`dotnet run` :5282): the SDK client defaults `throwOnError:
   * true` (`api-runtime.ts`'s `createClientConfig`), so `getApiMeExamCountdown()` **throws** on a
   * 404 rather than resolving to a `{ response }` to branch on afterwards — the round-1 stub's
   * commented pseudocode assumed the latter and would never have reached its 404 branch. 404
   * (and every other non-2xx here) is auto-`ProblemDetails` from ASP.NET Core, but that body's
   * own `status` field (`{"status":404,...}`, confirmed via curl) is exactly what
   * {@link extractErrorStatus} reads — the same "check `extractErrorStatus(e)`, never parse the
   * rest of the body" pattern every other service in this codebase already uses (e.g.
   * `PayoutAccountService.reveal()`'s 404).
   */
  async loadSetting(): Promise<void> {
    this._state.set(loadingActionState());
    try {
      const mapped = mapExamCountdownSetting(unwrapSdkResult(await getApiMeExamCountdown()));
      this._setting.set(mapped);
      this.currentExamType = mapped.examType;
      this._state.set(idleActionState());
      this.docsPager.reset();
      // `loadFirst()` rethrows on failure (infinite-pager.ts's F-30-2 contract) — fire-and-forget
      // on purpose here (docs grid failing must not fail loadSetting() as a whole), but the
      // rejection still needs a catch or it becomes an unhandled promise rejection. The failure
      // itself stays visible via `docsState()` (errorActionState), no double-reporting.
      void this.docsPager.loadFirst().catch(() => {});
    } catch (e) {
      this._setting.set(null);
      this.currentExamType = null;
      if (extractErrorStatus(e) === 404) {
        this._state.set(idleActionState());
        return;
      }
      this._state.set(errorActionState('โหลดข้อมูลไม่สำเร็จ'));
      this.apiFail.report('โหลดโหมดใกล้สอบ', e);
    }
  }

  /**
   * `PUT /api/me/exam-countdown` (§3.2, upsert). สำเร็จแล้ว `isEnabled=true` เสมอ (§0 การตัดสินใจที่
   * 5) — ฝั่ง backend เป็นคนบังคับ ไม่ใช่ frontend. `400` (ประเภทสอบ/วันสอบไม่ถูกต้อง) คืน
   * `{ ok:false, error }` ให้ฟอร์มแสดง inline (ไม่ toast — ตาม §4 ของสเปก) เหมือน pattern
   * `PayoutAccountService.save()`.
   */
  async saveSetting(
    examType: ExamCountdownExamType,
    examDate: string,
  ): Promise<{ ok: boolean; error?: string }> {
    this._state.set(loadingActionState());
    try {
      const data = unwrapSdkResult(
        await putApiMeExamCountdown({ body: { examType, examDate } }),
      );
      const mapped = mapExamCountdownSetting(data);
      this._setting.set(mapped);
      this.currentExamType = mapped.examType;
      this._state.set(idleActionState());
      this.docsPager.reset();
      void this.docsPager.loadFirst().catch(() => {});
      return { ok: true };
    } catch (e) {
      this._state.set(idleActionState());
      const validationMessage = ExamCountdownService.plainValidationMessage(e);
      return { ok: false, error: validationMessage ?? 'บันทึกโหมดใกล้สอบไม่สำเร็จ' };
    }
  }

  /**
   * `PATCH /api/me/exam-countdown/enabled` (§3.3). ไม่แตะ `examType`/`examDate` — component ไม่ต้อง
   * toast เอง เพราะการเปลี่ยน `setting().isEnabled` ทำให้ banner หายไปเองผ่าน signal reactivity
   * (AC-20) นั่นคือ feedback ที่ผู้ใช้เห็นอยู่แล้ว.
   */
  async setEnabled(enabled: boolean): Promise<void> {
    try {
      const data = unwrapSdkResult(
        await patchApiMeExamCountdownEnabled({ body: { enabled } }),
      );
      this._setting.set(mapExamCountdownSetting(data));
    } catch (e) {
      this.apiFail.report('เปลี่ยนสถานะโหมดใกล้สอบ', e);
    }
  }

  /**
   * `DELETE /api/me/exam-countdown` (§3.4) — idempotent เสมอ (`204` ทั้งกรณีมี/ไม่มีแถวอยู่ก่อน) จึง
   * เคลียร์ local state ให้เป็น `null` ได้ตรง ๆ หลังเรียกสำเร็จเสมอ.
   */
  async clearSetting(): Promise<void> {
    try {
      await deleteApiMeExamCountdown();
    } catch (e) {
      this.apiFail.report('ล้างค่าโหมดใกล้สอบ', e);
      return;
    }
    this._setting.set(null);
    this.currentExamType = null;
    this.docsPager.reset();
  }

  /**
   * §3.2's `400` ผ่าน controller's `catch (ArgumentException) { BadRequest(new { message }) }` —
   * plain body ไม่มี `status`/`statusCode`/`title`/`code` เลย เหมือน `PayoutAccountService`'s `PUT`
   * `400` (verified ต่อ backend เดียวกัน, pattern เดียวกันเป๊ะ) — ต่างจาก 401 ที่ผ่าน
   * `GlobalExceptionMiddleware` เสมอและมี `status` เสมอ.
   */
  private static plainValidationMessage(error: unknown): string | null {
    if (error == null || typeof error !== 'object' || error instanceof Error) return null;
    const o = error as Record<string, unknown>;
    if (extractErrorStatus(o) !== undefined) return null;
    return typeof o['message'] === 'string' && o['message'] ? o['message'] : null;
  }

  /** Test helper — mirrors `setPageForTesting` (`ExamHubService`) / `setSummaryForTest` (`ReferralService`). */
  setSettingForTest(setting: ExamCountdownSetting | null): void {
    this._setting.set(setting);
    this.currentExamType = setting?.examType ?? null;
  }
}

/**
 * exam-countdown-mode v1 §4 (AC-17) — pure function, no service dependency, so it can be unit
 * tested directly and reused by both `home.page.ts` and `ExamCountdownFormComponent`. Uses the
 * browser's local calendar date (not UTC) because that is what the person reading "เหลืออีก N วัน"
 * actually experiences — `examDate` itself carries no time-of-day component (`DateOnly` on the
 * backend, §0 ข้อ 6), so midnight-local of both dates is the only meaningful comparison.
 */
export function daysRemainingFromExamDate(examDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${examDate}T00:00:00`);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

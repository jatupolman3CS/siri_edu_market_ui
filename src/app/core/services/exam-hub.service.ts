import { Injectable, signal } from '@angular/core';
import type { DocumentItem, ExamHubPage, ExamHubType } from '../models';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { createInfinitePager } from './infinite-pager';

/**
 * Sentinel thrown at not-yet-wired SDK call sites.
 * TODO(contract): remove in round 2 once SDK is regenerated.
 */
class NotWiredYetError extends Error {
  constructor() {
    super('TODO(contract): wire หลัง regen');
  }
}

export interface UpdateExamHubPageInput {
  title?: string;
  metaDescription?: string;
  introText?: string;
  examDateInfo?: string;
  scoreCriteriaInfo?: string;
  trendInfo?: string;
}

/**
 * exam-hub-landing-pages v1 (docs/contracts/exam-hub-landing-pages.md §3, §4, §6)
 * Service for public Exam Hub landing pages and admin CMS management.
 */
@Injectable({ providedIn: 'root' })
export class ExamHubService {
  private readonly _page = signal<ExamHubPage | null>(null);
  private readonly _state = signal<ActionState>(idleActionState());
  private readonly _updateState = signal<ActionState>(idleActionState());
  private currentExamType: ExamHubType = 'tcas';

  readonly page = this._page.asReadonly();
  readonly state = this._state.asReadonly();
  readonly updateState = this._updateState.asReadonly();

  readonly pager = createInfinitePager<DocumentItem>({
    pageSize: 20,
    fetch: async (page, pageSize) => {
      try {
        // TODO(contract): wire หลัง regen — แทนบรรทัดถัดไปด้วย:
        //   const data = unwrapSdkResult(await getApiExamHubByExamTypeDocuments({
        //     path: { examType: this.currentExamType },
        //     query: { page, pageSize },
        //   }));
        //   return {
        //     items: (data.items ?? []).map(mapDocument),
        //     page: data.page,
        //     pageSize: data.pageSize,
        //     totalCount: data.totalCount,
        //     totalPages: data.totalPages,
        //   };
        throw new NotWiredYetError();
      } catch (e) {
        if (e instanceof NotWiredYetError) {
          return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
        }
        throw e;
      }
    },
    errorMessage: 'โหลดข้อมูลไม่สำเร็จ',
  });

  readonly docs = this.pager.items;
  readonly docsState = this.pager.state;
  readonly hasMore = this.pager.hasMore;

  /**
   * Loads CMS page content from GET /api/exam-hub/{examType}.
   */
  async loadPage(examType: ExamHubType): Promise<void> {
    this._state.set(loadingActionState());
    try {
      // TODO(contract): wire หลัง regen — แทนบรรทัดถัดไปด้วย:
      //   const data = unwrapSdkResult(await getApiExamHubByExamType({ path: { examType } }));
      //   this._page.set(mapExamHubPage(data));
      //   this._state.set(idleActionState());
      //   return;
      throw new NotWiredYetError();
    } catch (e) {
      if (e instanceof NotWiredYetError) {
        this._page.set(this.getStubDefaultPage(examType));
        this._state.set(idleActionState());
        return;
      }
      this._page.set(null);
      this._state.set(errorActionState('โหลดข้อมูลไม่สำเร็จ'));
    }
  }

  /**
   * Loads documents list for the exam hub from GET /api/exam-hub/{examType}/documents.
   */
  async loadDocuments(examType: ExamHubType): Promise<void> {
    this.currentExamType = examType;
    this.pager.reset();
    try {
      await this.pager.loadFirst();
    } catch {
      // Error is tracked in pager.state()
    }
  }

  async loadMore(): Promise<void> {
    await this.pager.loadMore();
  }

  /**
   * Updates CMS page content via PUT /api/admin/exam-hub/{examType}.
   */
  async updatePage(examType: ExamHubType, input: UpdateExamHubPageInput): Promise<void> {
    this._updateState.set(loadingActionState());
    try {
      // TODO(contract): wire หลัง regen — แทนบรรทัดถัดไปด้วย:
      //   const data = unwrapSdkResult(await putApiAdminExamHubByExamType({
      //     path: { examType },
      //     body: input,
      //   }));
      //   this._page.set(mapExamHubPage(data));
      //   this._updateState.set(successActionState('บันทึกเนื้อหาเรียบร้อย'));
      //   return;
      throw new NotWiredYetError();
    } catch (e) {
      if (e instanceof NotWiredYetError) {
        const current = this._page() ?? this.getStubDefaultPage(examType);
        this._page.set({
          ...current,
          ...input,
          title: input.title ?? current.title,
          metaDescription: input.metaDescription ?? current.metaDescription,
          introText: input.introText ?? current.introText,
          examDateInfo: input.examDateInfo !== undefined ? input.examDateInfo : current.examDateInfo,
          scoreCriteriaInfo: input.scoreCriteriaInfo !== undefined ? input.scoreCriteriaInfo : current.scoreCriteriaInfo,
          trendInfo: input.trendInfo !== undefined ? input.trendInfo : current.trendInfo,
          updatedAt: new Date().toISOString(),
        });
        this._updateState.set(successActionState('บันทึกเนื้อหาเรียบร้อย'));
        return;
      }
      this._updateState.set(errorActionState('บันทึกไม่สำเร็จ'));
      throw e;
    }
  }

  setPageForTesting(p: ExamHubPage | null): void {
    this._page.set(p);
  }

  private getStubDefaultPage(examType: ExamHubType): ExamHubPage {
    const titles: Record<ExamHubType, { title: string; intro: string }> = {
      tcas: {
        title: 'TCAS — ระบบคัดเลือกเข้ามหาวิทยาลัย',
        intro: 'รวมเอกสารและข้อมูลอัปเดตล่าสุดสำหรับระบบ TCAS ครบทุกรอบ',
      },
      'tgat-tpat': {
        title: 'TGAT/TPAT — เตรียมสอบวัดความถนัด',
        intro: 'รวมเอกสารติว TGAT และ TPAT ทุกพาร์ท',
      },
      'a-level': {
        title: 'A-Level — สอบวิชาสามัญ',
        intro: 'รวมเอกสารติว A-Level ครบทุกวิชา',
      },
      onet: {
        title: 'O-NET — สอบมาตรฐานการศึกษา',
        intro: 'รวมเอกสารติว O-NET ครบทุกช่วงชั้น',
      },
    };
    const info = titles[examType] ?? titles.tcas;
    return {
      examType,
      title: info.title,
      metaDescription: info.intro,
      introText: info.intro,
    };
  }
}

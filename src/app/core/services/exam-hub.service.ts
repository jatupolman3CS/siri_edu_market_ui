import { Injectable, inject, signal } from '@angular/core';
import type { DocumentItem, ExamHubPage, ExamHubType } from '../models';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  successActionState,
  type ActionState,
} from './action-state';
import { createInfinitePager } from './infinite-pager';
import {
  getApiExamHubByExamType,
  getApiExamHubByExamTypeDocuments,
  putApiAdminExamHubByExamType,
} from '../api';
import { mapDocument, mapExamHubPage } from '../api-mappers/mappers';
import { unwrapSdkResult } from './api-result';
import { TranslationService } from '../i18n/translation.service';

export interface UpdateExamHubPageInput {
  title?: string | null;
  metaDescription?: string | null;
  introText?: string | null;
  examDateInfo?: string | null;
  scoreCriteriaInfo?: string | null;
  trendInfo?: string | null;
}

/**
 * exam-hub-landing-pages v1 (docs/contracts/exam-hub-landing-pages.md §3, §4, §6)
 * Service for public Exam Hub landing pages and admin CMS management.
 */
@Injectable({ providedIn: 'root' })
export class ExamHubService {
  private readonly translation = inject(TranslationService);
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
        const result = await getApiExamHubByExamTypeDocuments({
          path: { examType: this.currentExamType },
          query: { Page: page, PageSize: pageSize },
        });
        const data = unwrapSdkResult(result);
        return {
          items: (data.items ?? []).map(mapDocument),
          page: data.page ?? page,
          pageSize: data.pageSize ?? pageSize,
          totalCount: data.totalCount ?? 0,
          totalPages: data.totalPages ?? 0,
        };
      } catch {
        return { items: [], page, pageSize, totalCount: 0, totalPages: 0 };
      }
    },
    errorMessage: this.translation.t('common.loadFailed'),
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
      const result = await getApiExamHubByExamType({ path: { examType } });
      const data = unwrapSdkResult(result);
      if (data) {
        this._page.set(mapExamHubPage(data));
        this._state.set(idleActionState());
        return;
      }
      this._page.set(this.getStubDefaultPage(examType));
      this._state.set(idleActionState());
    } catch {
      this._page.set(null);
      this._state.set(errorActionState(this.translation.t('common.loadFailed')));
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

  /**
   * Loads more documents for the current exam hub.
   */
  async loadMore(): Promise<void> {
    await this.pager.loadMore();
  }

  /**
   * Updates CMS page content via PUT /api/admin/exam-hub/{examType}.
   */
  async updatePage(examType: ExamHubType, input: UpdateExamHubPageInput): Promise<void> {
    this._updateState.set(loadingActionState());
    try {
      const result = await putApiAdminExamHubByExamType({
        path: { examType },
        body: input,
      });
      const data = unwrapSdkResult(result);
      if (data) {
        this._page.set(mapExamHubPage(data));
        this._updateState.set(successActionState(this.translation.t('examHub.saveSuccess')));
        return;
      }
      throw new Error('No response data');
    } catch (error) {
      this._updateState.set(errorActionState(this.translation.t('examHub.saveFailed')));
      throw error;
    }
  }

  setPageForTesting(p: ExamHubPage | null): void {
    this._page.set(p);
  }

  private getStubDefaultPage(examType: ExamHubType): ExamHubPage {
    const keyMap: Record<ExamHubType, string> = {
      tcas: 'tcas',
      'tgat-tpat': 'tgatTpat',
      'a-level': 'aLevel',
      onet: 'onet',
    };
    const k = keyMap[examType] ?? 'tcas';
    const title = this.translation.t(`examHub.defaultTitle.${k}`);
    const intro = this.translation.t(`examHub.defaultIntro.${k}`);
    return { examType, title, metaDescription: intro, introText: intro };
  }
}

import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FeedbackService } from '../../../core/services/feedback.service';
import { AuthService } from '../../../core/services/auth.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { resolveDownloadUrl } from '../../../core/api-runtime';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { FeedbackModalComponent } from '../../../shared/components/feedback-modal/feedback-modal.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TranslationService, TranslatePipe } from '../../../core/i18n';
import type {
  FeedbackStatus,
  FeedbackType,
  MyFeedbackListItemResponse,
  MyFeedbackResponse,
} from '../../../core/models';

@Component({
  selector: 'app-buyer-feedback',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    EmptyStateComponent,
    PaginationComponent,
    FeedbackModalComponent,
    IconComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback.page.html',
  styleUrls: ['./feedback.page.scss'],
})
export class BuyerFeedbackPage {
  private readonly feedbackService = inject(FeedbackService);
  private readonly auth = inject(AuthService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly i18n = inject(TranslationService);

  readonly items = signal<MyFeedbackListItemResponse[]>([]);
  readonly loading = signal(false);
  readonly status = signal<string>('all');
  readonly page = signal(1);
  readonly pageSize = signal(10);
  readonly total = signal(0);

  readonly expandedIds = signal<Set<string>>(new Set());
  readonly detailsMap = signal<Map<string, MyFeedbackResponse>>(new Map());
  readonly loadingDetails = signal<Set<string>>(new Set());

  readonly statusTabs = [
    { value: 'all', labelKey: 'feedback.statusAll' },
    { value: 'new', labelKey: 'feedback.statusNew' },
    { value: 'in_progress', labelKey: 'feedback.statusInProgress' },
    { value: 'resolved', labelKey: 'feedback.statusResolved' },
    { value: 'closed', labelKey: 'feedback.statusClosed' },
  ];

  constructor() {
    void this.reload();
  }

  statusLabel(s: string | undefined): string {
    if (!s) return this.i18n.t('feedback.unspecified');
    const keyMap: Record<string, string> = {
      new: 'feedback.statusNew',
      in_progress: 'feedback.statusInProgress',
      resolved: 'feedback.statusResolved',
      closed: 'feedback.statusClosed',
    };
    return keyMap[s] ? this.i18n.t(keyMap[s] as any) : s;
  }

  typeLabel(t: string | undefined): string {
    if (!t) return this.i18n.t('feedback.unspecified');
    const keyMap: Record<string, string> = {
      bug: 'feedback.typeBug',
      suggestion: 'feedback.typeSuggestion',
      usability: 'feedback.typeUsability',
      other: 'feedback.typeOther',
    };
    return keyMap[t] ? this.i18n.t(keyMap[t] as any) : t;
  }

  setStatus(s: string): void {
    this.status.set(s);
    this.page.set(1);
    void this.reload();
  }

  onPageChange(p: number): void {
    this.page.set(p);
    void this.reload();
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const statusParam = this.status() === 'all' ? undefined : (this.status() as FeedbackStatus);
      const res = await this.feedbackService.listMine(statusParam, this.page(), this.pageSize());
      this.items.set(res.items ?? []);
      this.total.set(res.totalCount ?? 0);
    } catch (e) {
      this.apiFail.report(this.i18n.t('systemContent.loadFeedbackList'), e);
      this.items.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleExpand(id: string | undefined): Promise<void> {
    if (!id) return;
    const current = new Set(this.expandedIds());
    if (current.has(id)) {
      current.delete(id);
      this.expandedIds.set(current);
      return;
    }

    current.add(id);
    this.expandedIds.set(current);

    if (!this.detailsMap().has(id)) {
      const loading = new Set(this.loadingDetails());
      loading.add(id);
      this.loadingDetails.set(loading);

      try {
        const detail = await this.feedbackService.getMine(id);
        const map = new Map(this.detailsMap());
        map.set(id, detail);
        this.detailsMap.set(map);
      } catch (e) {
        this.apiFail.report(this.i18n.t('systemContent.loadDetails'), e);
      } finally {
        const done = new Set(this.loadingDetails());
        done.delete(id);
        this.loadingDetails.set(done);
      }
    }
  }

  isExpanded(id: string | undefined): boolean {
    return id ? this.expandedIds().has(id) : false;
  }

  isLoadingDetail(id: string | undefined): boolean {
    return id ? this.loadingDetails().has(id) : false;
  }

  getDetail(id: string | undefined): MyFeedbackResponse | undefined {
    return id ? this.detailsMap().get(id) : undefined;
  }

  resolveImageUrl(url: string | null | undefined): string {
    return resolveDownloadUrl(url, this.auth.accessToken(), null, true);
  }
}

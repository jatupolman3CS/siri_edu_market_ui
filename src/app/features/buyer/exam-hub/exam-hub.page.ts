import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { AdsService, ExamHubService } from '../../../core/services';
import type { DocumentItem, ExamHubType } from '../../../core/models';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TranslatePipe } from '../../../core/i18n';

/**
 * exam-hub-landing-pages v1 (docs/contracts/exam-hub-landing-pages.md §4, §6)
 * Single component used across 4 routes: /tcas, /tgat-tpat, /a-level, /onet.
 */
@Component({
  selector: 'app-exam-hub-page',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    EmptyStateComponent,
    IconComponent,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exam-hub.page.html',
  styleUrl: './exam-hub.page.scss',
})
export class ExamHubPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  readonly examHub = inject(ExamHubService);
  readonly ads = inject(AdsService);

  readonly examType: ExamHubType =
    (this.route.snapshot.data['examType'] as ExamHubType) ?? 'tcas';

  readonly page = this.examHub.page;
  readonly pageState = this.examHub.state;
  readonly docs = this.examHub.docs;
  readonly docsState = this.examHub.docsState;
  readonly hasMore = this.examHub.hasMore;
  readonly sponsoredDocs = signal<DocumentItem[]>([]);

  readonly hasAnyInfoCard = computed(() => {
    const p = this.page();
    return Boolean(
      p && (p.examDateInfo || p.scoreCriteriaInfo || p.trendInfo),
    );
  });

  private loaded = false;

  async ngOnInit(): Promise<void> {
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    await Promise.all([
      this.examHub.loadPage(this.examType),
      this.examHub.loadDocuments(this.examType),
    ]);

    this.loadSponsoredAds();

    const p = this.page();
    if (p) {
      if (p.title) {
        this.titleService.setTitle(`${p.title} — SIRIEDUMARKET`);
      }
      if (p.metaDescription) {
        this.meta.updateTag({ name: 'description', content: p.metaDescription });
      }
    }
  }

  private loadSponsoredAds(): void {
    void this.ads.getSponsoredAds('exam_hub_top', this.examType, 2).then((sponsored) => {
      this.sponsoredDocs.set(sponsored);
      if (sponsored.length > 0) {
        this.ads.recordImpressions(
          this.sponsoredDocs,
          sponsored.map((d) => d.sponsoredCampaignId),
        );
      }
    });
  }

  async loadMore(): Promise<void> {
    await this.examHub.loadMore();
  }

  async retry(): Promise<void> {
    this.loaded = false;
    await this.loadAll();
  }
}

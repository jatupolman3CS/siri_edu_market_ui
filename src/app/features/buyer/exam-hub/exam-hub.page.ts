import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Meta } from '@angular/platform-browser';
import { AdsService, ExamHubService, SeoMetaService } from '../../../core/services';
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
  private readonly router = inject(Router);
  private readonly meta = inject(Meta);
  private readonly seo = inject(SeoMetaService);
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
    const hubPath = currentPath(this.router.url);

    await Promise.all([
      this.examHub.loadPage(this.examType),
      this.examHub.loadDocuments(this.examType),
    ]);

    this.loadSponsoredAds();

    const p = this.page();
    // Hub pages are in the sitemap, so they also get canonical + og:url (query-less path) —
    // the router-level reset left them without one while the hub content loaded. Skipped when the
    // user already navigated away mid-load, so the next page never inherits the hub's SEO.
    if (p && currentPath(this.router.url) === hubPath) {
      this.seo.setPageSeo({
        title: p.title ? `${p.title} — SIRIEDUMARKET` : undefined,
        description:
          p.metaDescription || (this.meta.getTag('name="description"')?.content ?? ''),
        canonicalUrl: this.seo.canonicalUrl(hubPath),
      });
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

function currentPath(url: string): string {
  return url.split(/[?#]/)[0] || '/';
}

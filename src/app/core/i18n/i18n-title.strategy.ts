import { Injectable, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { SeoMetaService } from '../services/seo-meta.service';
import { TranslationService } from './translation.service';

/** Route `data` key holding an i18n key for the page's meta description. Its presence opts the
 * route into static-page SEO (description + canonical + website Open Graph). */
export const SEO_DESCRIPTION_DATA_KEY = 'seoDescription';
const SITE_DESCRIPTION_KEY = 'seo.siteDescription';

/**
 * Translated `<title>` per route, plus the router-level SEO hook:
 *
 * - route with `data.seoDescription` → `SeoMetaService.setPageSeo` with the translated text and a
 *   canonical of origin + path (query/fragment dropped, so `/marketplace?q=x` → `/marketplace`).
 * - any other route → `SeoMetaService.resetPageSeo`, so canonical/og:image/JSON-LD of the previous
 *   page (e.g. a document) never linger. Runs on NavigationEnd timing, i.e. before the dynamic pages
 *   (document/category/store) and exam hubs set their own SEO after loading — they always win.
 *   Skipped when only the query/fragment changed (`/category/x?sub=y`), because those pages don't
 *   re-run their SEO for a same-path navigation.
 *
 * Language switches re-translate title + static-page SEO only; they never reset, so a loaded
 * dynamic page keeps its SEO.
 */
@Injectable({ providedIn: 'root' })
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly translation = inject(TranslationService);
  private readonly seo = inject(SeoMetaService);
  private currentSnapshot: RouterStateSnapshot | null = null;
  private lastSeoPath: string | null = null;

  constructor() {
    super();
    effect(() => {
      // Re-evaluate title reactively when currentLang changes
      this.translation.currentLang();
      if (this.currentSnapshot) {
        this.applyTitle(this.currentSnapshot);
        this.applySeo(this.currentSnapshot, false);
      }
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.currentSnapshot = snapshot;
    this.applyTitle(snapshot);
    this.applySeo(snapshot, true);
  }

  private applyTitle(snapshot: RouterStateSnapshot): void {
    const titleKey = this.buildTitle(snapshot);
    if (!titleKey) {
      this.title.setTitle('SIRIEDUMARKET');
      return;
    }

    const translated = this.translation.t(titleKey);
    this.title.setTitle(translated && translated !== titleKey ? translated : titleKey);
  }

  private applySeo(snapshot: RouterStateSnapshot, isNavigation: boolean): void {
    const path = stripQueryAndFragment(snapshot.url);
    const descriptionKey = deepestChild(snapshot.root).data[SEO_DESCRIPTION_DATA_KEY];

    if (typeof descriptionKey === 'string' && descriptionKey) {
      this.seo.setPageSeo({
        title: this.title.getTitle(),
        description: this.translation.t(descriptionKey),
        canonicalUrl: this.seo.canonicalUrl(path),
      });
      this.lastSeoPath = path;
      return;
    }

    if (!isNavigation || path === this.lastSeoPath) return;
    this.lastSeoPath = path;
    this.seo.resetPageSeo({
      title: this.title.getTitle(),
      description: this.translation.t(SITE_DESCRIPTION_KEY),
    });
  }
}

function deepestChild(route: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let current = route;
  while (current.firstChild) current = current.firstChild;
  return current;
}

function stripQueryAndFragment(url: string): string {
  const path = url.split(/[?#]/)[0];
  return path || '/';
}

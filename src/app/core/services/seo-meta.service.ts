import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

/**
 * seo-ssr v1 (`docs/contracts/seo-ssr.md` §4.1/DEC-2) — client-side layer 1: dynamic
 * `Title`/`Meta`/canonical `<link>`/JSON-LD `<script>` for the three highest-value public pages
 * (document detail, category detail, seller storefront), mirroring the existing pattern in
 * `exam-hub.page.ts`. Pure DOM utility — never imports `sdk.gen`/`client.gen` (§4.1), so callers
 * (the page components) are responsible for resolving any relative image URL to absolute first
 * (they already do, via `resolvePublicUrl`/`resolveAvatarUrl` — DocumentItem.cover/gallery are
 * already absolute by the time they reach here).
 *
 * JSON-LD shapes mirror the backend HTML-snapshot endpoints in §3.1/§3.2/§3.3 as closely as the
 * data available on these pages allows, so a bot that DOES execute JS (Googlebot's second wave)
 * sees the same structured data as the no-JS snapshot (§1.2 — not cloaking, same content either
 * way) — but this service never calls those backend endpoints itself; it only renders what the
 * page already fetched through `core/services/`.
 */

const SCHEMA_CONTEXT = 'https://schema.org' as const;
const SITE_NAME = 'SIRIEDUMARKET';
/** Fixed id so re-setting SEO (e.g. navigating from document A to document B) replaces the
 * existing tag instead of leaving a stale one behind (AC-17) or appending duplicates. */
const JSON_LD_SCRIPT_ID = 'seo-json-ld';
/** seo-document-content v1 DEC-12/§4.3: the document page's second JSON-LD script
 * (`BreadcrumbList`). Separate fixed id for the same replace-not-duplicate reason, and removed by
 * every non-document setter so it never lingers on a category/store/static page. */
const BREADCRUMB_JSON_LD_SCRIPT_ID = 'seo-breadcrumb-json-ld';
/** seo-document-content v1 §4.3: breadcrumb labels are the backend snapshot's fixed Thai text —
 * never translated with the UI language, so structured data matches the no-JS snapshot. */
const BREADCRUMB_HOME_NAME = 'หน้าแรก';
const BREADCRUMB_MARKETPLACE_NAME = 'ตลาด';
/** seo-document-content v1 §3.3: `encodingFormat` MIME per file format — anything else is omitted. */
const ENCODING_FORMAT_MIME: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip',
};
/** Site-wide default share image — same file `src/index.html` points its static `og:image` at
 * (that copy is hard-coded to the prod origin because no-JS bots never run this code). */
const DEFAULT_OG_IMAGE_PATH = '/icon-512.png';

/** Static public pages (home, marketplace, categories, free, bundles) — driven from route
 * `data.seoDescription` by `I18nTitleStrategy`. Never touches `#site-json-ld` (the site-wide
 * `WebSite`/`Organization` graph in `src/index.html`). */
export interface SeoPageInput {
  /** Also used for `og:title`; when omitted the current `document.title` is reused. */
  title?: string;
  description: string;
  canonicalUrl: string;
}

/** Site defaults restored when leaving a page that set its own SEO (document A → /wishlist must
 * not keep document A's canonical/og:image/JSON-LD). */
export interface SeoDefaultsInput {
  title: string;
  description: string;
}

export interface SeoDocumentInput {
  documentId: string;
  title: string;
  shortDescription: string;
  /** seo-document-content v1 DEC-10: AI meta description — feeds `<meta>`/og/twitter only; the
   * JSON-LD `description` stays `shortDescription` (the visible text under `<h1>`). */
  seoDescription?: string;
  /** seo-document-content v1 §3.3: JSON-LD `keywords` (joined with `, `), omitted when empty. */
  keywords?: readonly string[];
  canonicalUrl: string;
  /** Already-absolute URL (`DocumentItem.cover`). */
  coverImageUrl: string;
  /** Already-absolute URLs (`DocumentItem.gallery`). */
  galleryImageUrls: readonly string[];
  price: number;
  studioName: string;
  /** Raw slug — only the fallback when `resourceTypeLabel` is blank (§3.3). */
  resourceType: string;
  /** seo-document-content v1 DEC-11: Thai label (`RESOURCE_TYPE_LABELS`) for `learningResourceType`. */
  resourceTypeLabel: string;
  /** seo-document-content v1 DEC-11: Thai labels (`GRADE_LEVEL_LABELS`) for `educationalLevel`. */
  gradeLevelLabels: readonly string[];
  /** File format slug (`pdf`, `docx`, …) → `encodingFormat` MIME. */
  format: string;
  /** seo-document-content v1 DEC-12: first `categoryIds` entry the catalog resolves (`url` is
   * absolute). Absent → JSON-LD omits `category` and the breadcrumb has 3 items. */
  breadcrumbCategory?: { name: string; url: string };
  language: string;
  reviewCount: number;
  /** DEC-7: only read when `reviewCount > 0` — never used to fabricate a rating. */
  averageRating?: number;
}

export interface SeoCategoryInput {
  name: string;
  description: string;
  canonicalUrl: string;
}

export interface SeoStoreInput {
  studioName: string;
  bio: string;
  canonicalUrl: string;
  /** Already-absolute URL (`resolveAvatarUrl`). */
  avatarImageUrl: string;
  /** Already-absolute URL, `''` when the seller has no banner. */
  bannerImageUrl: string;
}

interface JsonLdAggregateRating {
  '@type': 'AggregateRating';
  ratingValue: number;
  reviewCount: number;
}

interface JsonLdOffer {
  '@type': 'Offer';
  url: string;
  priceCurrency: 'THB';
  price: number;
  availability: string;
  seller: { '@type': 'Organization'; name: string };
}

/** seo-document-content v1 §3.3 / DEC-11 (supersedes seo-ssr DEC-6): multi-type entity, no
 * `additionalType`. Key order mirrors the backend snapshot; optional keys are omitted, not null. */
interface JsonLdProduct {
  '@context': typeof SCHEMA_CONTEXT;
  '@type': ['Product', 'LearningResource'];
  name: string;
  description: string;
  sku: string;
  image: string[];
  url: string;
  brand: { '@type': 'Brand'; name: string };
  category?: string;
  keywords?: string;
  learningResourceType: string;
  educationalLevel?: string[];
  inLanguage: string;
  encodingFormat?: string;
  offers: JsonLdOffer;
  aggregateRating?: JsonLdAggregateRating;
}

interface JsonLdListItem {
  '@type': 'ListItem';
  position: number;
  name: string;
  item: string;
}

/** seo-document-content v1 §3.3 / DEC-12. */
interface JsonLdBreadcrumbList {
  '@context': typeof SCHEMA_CONTEXT;
  '@type': 'BreadcrumbList';
  itemListElement: JsonLdListItem[];
}

interface JsonLdCollectionPage {
  '@context': typeof SCHEMA_CONTEXT;
  '@type': 'CollectionPage';
  name: string;
  description: string;
  url: string;
}

interface JsonLdProfilePage {
  '@context': typeof SCHEMA_CONTEXT;
  '@type': 'ProfilePage';
  mainEntity: {
    '@type': 'Organization';
    name: string;
    description: string;
    image: string[];
    url: string;
  };
}

type JsonLdPayload = JsonLdProduct | JsonLdCollectionPage | JsonLdProfilePage | JsonLdBreadcrumbList;

@Injectable({ providedIn: 'root' })
export class SeoMetaService {
  private readonly document = inject(DOCUMENT);
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);

  /** Absolute URL for a router path (e.g. `/document/{id}`) against the browser's own origin —
   * DEC-10: canonical must always match the URL the router actually uses, never a slug the route
   * doesn't accept. */
  canonicalUrl(path: string): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}${path}`;
  }

  /** `/document/:id` — seo-document-content v1 DEC-10/11/12: `["Product","LearningResource"]`
   * JSON-LD + a separate `BreadcrumbList` script; meta description prefers `seoDescription`. */
  setDocumentSeo(input: SeoDocumentInput): void {
    // DEC-10: `<meta>`/og/twitter descriptions may differ from the visible text; JSON-LD may not.
    const metaDescription = input.seoDescription?.trim() || input.shortDescription;
    this.titleService.setTitle(`${input.title} — ${SITE_NAME}`);
    this.setDescription(metaDescription);
    this.setCanonical(input.canonicalUrl);

    this.setOpenGraph({
      'og:type': 'product',
      'og:title': input.title,
      'og:description': metaDescription,
      'og:url': input.canonicalUrl,
      'og:image': input.coverImageUrl,
      'og:site_name': SITE_NAME,
    });
    this.setTwitterCard({
      'twitter:card': 'summary_large_image',
      'twitter:title': input.title,
      'twitter:description': metaDescription,
      'twitter:image': input.coverImageUrl,
    });

    const images = dedupeTruthy([input.coverImageUrl, ...input.galleryImageUrls]).slice(0, 5);
    const category = input.breadcrumbCategory?.name.trim() || undefined;
    const keywords = nonBlank(input.keywords ?? []);
    const gradeLevels = nonBlank(input.gradeLevelLabels);
    const encodingFormat = ENCODING_FORMAT_MIME[input.format.trim().toLowerCase()];

    const jsonLd: JsonLdProduct = {
      '@context': SCHEMA_CONTEXT,
      '@type': ['Product', 'LearningResource'],
      name: input.title,
      description: input.shortDescription,
      sku: input.documentId,
      image: images,
      url: input.canonicalUrl,
      brand: { '@type': 'Brand', name: input.studioName },
      ...(category ? { category } : {}),
      ...(keywords.length > 0 ? { keywords: keywords.join(', ') } : {}),
      learningResourceType: input.resourceTypeLabel.trim() || input.resourceType,
      ...(gradeLevels.length > 0 ? { educationalLevel: gradeLevels } : {}),
      inLanguage: input.language,
      ...(encodingFormat ? { encodingFormat } : {}),
      offers: {
        '@type': 'Offer',
        url: input.canonicalUrl,
        priceCurrency: 'THB',
        price: input.price,
        availability: 'https://schema.org/InStock',
        seller: { '@type': 'Organization', name: input.studioName },
      },
    };

    // DEC-7: never include `aggregateRating` when there are no real reviews yet, even though
    // `averageRating` always carries the platform's 3.00 prior default.
    if (input.reviewCount > 0) {
      jsonLd.aggregateRating = {
        '@type': 'AggregateRating',
        ratingValue: input.averageRating ?? 0,
        reviewCount: input.reviewCount,
      };
    }

    this.setJsonLd(jsonLd);
    this.setJsonLd(this.buildDocumentBreadcrumb(input), BREADCRUMB_JSON_LD_SCRIPT_ID);
  }

  /** DEC-12: หน้าแรก › ตลาด › (first resolvable category) › title — positions 1..n, last = canonical. */
  private buildDocumentBreadcrumb(input: SeoDocumentInput): JsonLdBreadcrumbList {
    const crumbs: { name: string; item: string }[] = [
      { name: BREADCRUMB_HOME_NAME, item: this.canonicalUrl('/') },
      { name: BREADCRUMB_MARKETPLACE_NAME, item: this.canonicalUrl('/marketplace') },
    ];
    const category = input.breadcrumbCategory;
    if (category && category.name.trim() && category.url.trim()) {
      crumbs.push({ name: category.name.trim(), item: category.url.trim() });
    }
    crumbs.push({ name: input.title, item: input.canonicalUrl });
    return {
      '@context': SCHEMA_CONTEXT,
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    };
  }

  /** `/category/:slug` — DEC-8: `CollectionPage` only, no `ItemList`/`mainEntity`. */
  setCategorySeo(input: SeoCategoryInput): void {
    this.titleService.setTitle(`${input.name} — ${SITE_NAME}`);
    this.setDescription(input.description);
    this.setCanonical(input.canonicalUrl);

    this.setOpenGraph({
      'og:type': 'website',
      'og:title': input.name,
      'og:description': input.description,
      'og:url': input.canonicalUrl,
      'og:site_name': SITE_NAME,
    });

    const jsonLd: JsonLdCollectionPage = {
      '@context': SCHEMA_CONTEXT,
      '@type': 'CollectionPage',
      name: input.name,
      description: input.description,
      url: input.canonicalUrl,
    };
    this.setJsonLd(jsonLd);
    // seo-document-content v1 §4.3: never keep a document page's breadcrumb script here.
    this.removeBreadcrumbJsonLd();
  }

  /** `/store/:id` — DEC-9: `ProfilePage` wrapping `Organization`, no `aggregateRating`. */
  setStoreSeo(input: SeoStoreInput): void {
    this.titleService.setTitle(`${input.studioName} — ${SITE_NAME}`);
    this.setDescription(input.bio);
    this.setCanonical(input.canonicalUrl);

    this.setOpenGraph({
      'og:type': 'website',
      'og:title': input.studioName,
      'og:description': input.bio,
      'og:url': input.canonicalUrl,
      'og:image': input.avatarImageUrl,
      'og:site_name': SITE_NAME,
    });

    const jsonLd: JsonLdProfilePage = {
      '@context': SCHEMA_CONTEXT,
      '@type': 'ProfilePage',
      mainEntity: {
        '@type': 'Organization',
        name: input.studioName,
        description: input.bio,
        image: dedupeTruthy([input.avatarImageUrl, input.bannerImageUrl]),
        url: input.canonicalUrl,
      },
    };
    this.setJsonLd(jsonLd);
    // seo-document-content v1 §4.3: never keep a document page's breadcrumb script here.
    this.removeBreadcrumbJsonLd();
  }

  /** Static public page: description, canonical (= the caller's query-less URL), website-type
   * Open Graph, and the site-default share image in place of any page-specific one left behind. */
  setPageSeo(input: SeoPageInput): void {
    if (input.title) this.titleService.setTitle(input.title);
    const title = input.title || this.titleService.getTitle();
    this.applySiteDefaults(title, input.description);
    this.setCanonical(input.canonicalUrl);
    this.meta.updateTag({ property: 'og:url', content: input.canonicalUrl });
  }

  /** Route without its own static SEO (private pages, and the 3 dynamic pages + exam hubs before
   * they finish loading): drop everything page-specific the previous route set. Title is left to
   * the TitleStrategy; `title` here only feeds `og:title`. */
  resetPageSeo(defaults: SeoDefaultsInput): void {
    this.applySiteDefaults(defaults.title, defaults.description);
    this.document.querySelector('link[rel="canonical"]')?.remove();
    this.meta.removeTag('property="og:url"');
  }

  private applySiteDefaults(title: string, description: string): void {
    this.setDescription(description);
    this.setOpenGraph({
      'og:type': 'website',
      'og:title': title,
      'og:description': description,
      'og:image': this.canonicalUrl(DEFAULT_OG_IMAGE_PATH),
      'og:site_name': SITE_NAME,
    });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary' });
    this.meta.removeTag('name="twitter:title"');
    this.meta.removeTag('name="twitter:description"');
    this.meta.removeTag('name="twitter:image"');
    this.document.getElementById(JSON_LD_SCRIPT_ID)?.remove();
    this.removeBreadcrumbJsonLd();
  }

  private removeBreadcrumbJsonLd(): void {
    this.document.getElementById(BREADCRUMB_JSON_LD_SCRIPT_ID)?.remove();
  }

  private setDescription(description: string): void {
    this.meta.updateTag({ name: 'description', content: description });
  }

  private setCanonical(url: string): void {
    let link = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  private setOpenGraph(tags: Readonly<Record<string, string>>): void {
    for (const [property, content] of Object.entries(tags)) {
      if (!content) continue;
      this.meta.updateTag({ property, content });
    }
  }

  private setTwitterCard(tags: Readonly<Record<string, string>>): void {
    for (const [name, content] of Object.entries(tags)) {
      if (!content) continue;
      this.meta.updateTag({ name, content });
    }
  }

  private setJsonLd(data: JsonLdPayload, scriptId: string = JSON_LD_SCRIPT_ID): void {
    let script = this.document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = scriptId;
      script.setAttribute('type', 'application/ld+json');
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(data);
  }
}

function nonBlank(values: readonly string[]): string[] {
  return values.map((v) => v?.trim() ?? '').filter((v) => v !== '');
}

function dedupeTruthy(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

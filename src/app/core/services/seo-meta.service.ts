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

export interface SeoDocumentInput {
  documentId: string;
  title: string;
  shortDescription: string;
  canonicalUrl: string;
  /** Already-absolute URL (`DocumentItem.cover`). */
  coverImageUrl: string;
  /** Already-absolute URLs (`DocumentItem.gallery`). */
  galleryImageUrls: readonly string[];
  price: number;
  studioName: string;
  resourceType: string;
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

interface JsonLdProduct {
  '@context': typeof SCHEMA_CONTEXT;
  '@type': 'Product';
  additionalType: string;
  name: string;
  description: string;
  sku: string;
  image: string[];
  url: string;
  brand: { '@type': 'Brand'; name: string };
  learningResourceType: string;
  inLanguage: string;
  offers: JsonLdOffer;
  aggregateRating?: JsonLdAggregateRating;
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

type JsonLdPayload = JsonLdProduct | JsonLdCollectionPage | JsonLdProfilePage;

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

  /** `/document/:id` — DEC-6: `Product` + `additionalType: LearningResource`. */
  setDocumentSeo(input: SeoDocumentInput): void {
    this.titleService.setTitle(`${input.title} — ${SITE_NAME}`);
    this.setDescription(input.shortDescription);
    this.setCanonical(input.canonicalUrl);

    this.setOpenGraph({
      'og:type': 'product',
      'og:title': input.title,
      'og:description': input.shortDescription,
      'og:url': input.canonicalUrl,
      'og:image': input.coverImageUrl,
      'og:site_name': SITE_NAME,
    });
    this.setTwitterCard({
      'twitter:card': 'summary_large_image',
      'twitter:title': input.title,
      'twitter:description': input.shortDescription,
      'twitter:image': input.coverImageUrl,
    });

    const images = dedupeTruthy([input.coverImageUrl, ...input.galleryImageUrls]).slice(0, 5);

    const jsonLd: JsonLdProduct = {
      '@context': SCHEMA_CONTEXT,
      '@type': 'Product',
      additionalType: 'https://schema.org/LearningResource',
      name: input.title,
      description: input.shortDescription,
      sku: input.documentId,
      image: images,
      url: input.canonicalUrl,
      brand: { '@type': 'Brand', name: input.studioName },
      learningResourceType: input.resourceType,
      inLanguage: input.language,
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

  private setJsonLd(data: JsonLdPayload): void {
    let script = this.document.getElementById(JSON_LD_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = this.document.createElement('script');
      script.id = JSON_LD_SCRIPT_ID;
      script.setAttribute('type', 'application/ld+json');
      this.document.head.appendChild(script);
    }
    script.text = JSON.stringify(data);
  }
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

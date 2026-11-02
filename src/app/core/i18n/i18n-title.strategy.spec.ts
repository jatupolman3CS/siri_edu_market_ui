import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { routes as appRoutes } from '../../app.routes';
import { SeoMetaService } from '../services/seo-meta.service';
import { I18nTitleStrategy } from './i18n-title.strategy';
import { TranslationService } from './translation.service';
import { en } from './translations/en';
import { th } from './translations/th';

@Component({ standalone: true, template: '' })
class DummyPageComponent {}

/**
 * Router-level SEO hook: routes carrying `data.seoDescription` get description + query-less
 * canonical + website Open Graph; every other route resets whatever the previous page left behind
 * (document canonical/og:image/JSON-LD), but never on a query/fragment-only navigation and never
 * on a language switch — the dynamic pages set their own SEO after loading and must keep it.
 */
describe('I18nTitleStrategy — route SEO', () => {
  let router: Router;
  let title: Title;
  let meta: Meta;
  let seo: SeoMetaService;
  let translation: TranslationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'marketplace',
            component: DummyPageComponent,
            title: 'routes.marketplace',
            data: { seoDescription: 'seo.marketplace' },
          },
          { path: 'document/:id', component: DummyPageComponent },
          { path: 'wishlist', component: DummyPageComponent, title: 'routes.wishlist' },
        ]),
        { provide: TitleStrategy, useClass: I18nTitleStrategy },
      ],
    });
    router = TestBed.inject(Router);
    title = TestBed.inject(Title);
    meta = TestBed.inject(Meta);
    seo = TestBed.inject(SeoMetaService);
    translation = TestBed.inject(TranslationService);
    translation.setLanguage('th');
    TestBed.tick();
  });

  afterEach(() => {
    document.getElementById('seo-json-ld')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
    document
      .querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]')
      .forEach((el) => el.remove());
    translation.setLanguage('th');
    TestBed.resetTestingModule();
  });

  function canonical(): string | null {
    return document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  }

  /** What document-detail.page does once its data has loaded. */
  function simulateDocumentPageSeo(id: string): void {
    seo.setDocumentSeo({
      documentId: id,
      title: `เอกสาร ${id}`,
      shortDescription: `คำอธิบาย ${id}`,
      canonicalUrl: seo.canonicalUrl(`/document/${id}`),
      coverImageUrl: `https://siriedumarket.test/api/files/download/${id}.jpg`,
      galleryImageUrls: [],
      price: 10,
      studioName: 'ร้าน',
      resourceType: 'lesson-summary',
      language: 'th',
      reviewCount: 0,
    });
  }

  it('static route: translated description, canonical without query/fragment, website OG', async () => {
    await router.navigateByUrl('/marketplace?q=คณิต#top');

    expect(title.getTitle()).toBe(th.routes.marketplace);
    expect(meta.getTag('name="description"')?.content).toBe(th.seo.marketplace);
    expect(canonical()).toBe(`${window.location.origin}/marketplace`);
    expect(meta.getTag('property="og:url"')?.content).toBe(`${window.location.origin}/marketplace`);
    expect(meta.getTag('property="og:type"')?.content).toBe('website');
    expect(meta.getTag('property="og:title"')?.content).toBe(th.routes.marketplace);
  });

  it('leaving a document page for a route without seoDescription clears its canonical/og:image/JSON-LD', async () => {
    await router.navigateByUrl('/document/a');
    simulateDocumentPageSeo('a');
    expect(canonical()).toBe(`${window.location.origin}/document/a`);

    await router.navigateByUrl('/wishlist');

    expect(canonical()).toBeNull();
    expect(document.getElementById('seo-json-ld')).toBeNull();
    expect(meta.getTag('property="og:url"')).toBeNull();
    expect(meta.getTag('property="og:type"')?.content).toBe('website');
    expect(meta.getTag('property="og:image"')?.content).toBe(`${window.location.origin}/icon-512.png`);
    expect(meta.getTag('name="twitter:image"')).toBeNull();
    expect(meta.getTag('name="description"')?.content).toBe(th.seo.siteDescription);
    expect(title.getTitle()).toBe(th.routes.wishlist);
  });

  it('leaving a document page for a static route replaces everything with the static page SEO', async () => {
    await router.navigateByUrl('/document/a');
    simulateDocumentPageSeo('a');

    await router.navigateByUrl('/marketplace');

    expect(canonical()).toBe(`${window.location.origin}/marketplace`);
    expect(document.getElementById('seo-json-ld')).toBeNull();
    expect(meta.getTag('name="description"')?.content).toBe(th.seo.marketplace);
    expect(meta.getTag('property="og:image"')?.content).toBe(`${window.location.origin}/icon-512.png`);
  });

  it('document A → document B resets at navigation time, so the page can set B afterwards', async () => {
    await router.navigateByUrl('/document/a');
    simulateDocumentPageSeo('a');

    await router.navigateByUrl('/document/b');
    expect(canonical()).toBeNull();
    expect(document.getElementById('seo-json-ld')).toBeNull();

    simulateDocumentPageSeo('b');
    expect(canonical()).toBe(`${window.location.origin}/document/b`);
  });

  it('query/fragment-only navigation on a dynamic page keeps the page-set SEO', async () => {
    await router.navigateByUrl('/document/a');
    simulateDocumentPageSeo('a');

    await router.navigateByUrl('/document/a?tab=reviews#reviews');

    expect(canonical()).toBe(`${window.location.origin}/document/a`);
    expect(document.getElementById('seo-json-ld')).not.toBeNull();
  });

  it('language switch re-translates static-page SEO', async () => {
    await router.navigateByUrl('/marketplace');

    translation.setLanguage('en');
    TestBed.tick();

    expect(meta.getTag('name="description"')?.content).toBe(en.seo.marketplace);
    expect(canonical()).toBe(`${window.location.origin}/marketplace`);
  });

  it('language switch never wipes the SEO a dynamic page already set', async () => {
    await router.navigateByUrl('/document/a');
    simulateDocumentPageSeo('a');

    translation.setLanguage('en');
    TestBed.tick();

    expect(canonical()).toBe(`${window.location.origin}/document/a`);
    expect(document.getElementById('seo-json-ld')).not.toBeNull();
  });
});

describe('app.routes — static-page seoDescription keys', () => {
  const buyerChildren = appRoutes.find((r) => r.children?.some((c) => c.path === 'marketplace'))
    ?.children ?? [];

  it.each(['', 'marketplace', 'categories', 'free', 'bundles'])(
    '"/%s" carries a seoDescription key present in both dictionaries',
    (path) => {
      const route = buyerChildren.find((c) => c.path === path);
      const key = route?.data?.['seoDescription'] as string | undefined;

      expect(key).toMatch(/^seo\./);
      const leaf = (key ?? '').slice('seo.'.length) as keyof typeof th.seo;
      expect(th.seo[leaf]).toBeTruthy();
      expect(en.seo[leaf]).toBeTruthy();
    },
  );

  it.each(['category/:slug', 'document/:id', 'store/:id', 'tcas', 'tgat-tpat', 'a-level', 'onet'])(
    '"/%s" sets its own SEO after loading, so it has no seoDescription',
    (path) => {
      const route = buyerChildren.find((c) => c.path === path);
      expect(route).toBeTruthy();
      expect(route?.data?.['seoDescription']).toBeUndefined();
    },
  );
});

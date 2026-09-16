import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { SeoMetaService } from './seo-meta.service';

/**
 * seo-ssr v1 (`docs/contracts/seo-ssr.md` §1.4 group C / §1.5) — unit coverage for the shared
 * meta-service the three buyer pages wire into: title/description/canonical set correctly,
 * exactly one JSON-LD `<script>` at a time (replaced, never duplicated — mirrors AC-17), and
 * `aggregateRating` present/absent strictly by `reviewCount` (DEC-7).
 */
describe('SeoMetaService', () => {
  let service: SeoMetaService;
  let titleService: Title;
  let meta: Meta;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SeoMetaService);
    titleService = TestBed.inject(Title);
    meta = TestBed.inject(Meta);
  });

  afterEach(() => {
    document.getElementById('seo-json-ld')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
    TestBed.resetTestingModule();
  });

  function jsonLdScripts(): HTMLScriptElement[] {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  }

  describe('setDocumentSeo', () => {
    const baseInput = {
      documentId: 'doc-1',
      title: 'สรุปคณิต ม.6',
      shortDescription: 'สรุปเข้มก่อนสอบ',
      canonicalUrl: 'https://siriedumarket.test/document/doc-1',
      coverImageUrl: 'https://siriedumarket.test/api/files/download/cover.jpg',
      galleryImageUrls: ['https://siriedumarket.test/api/files/download/g1.jpg'],
      price: 49,
      studioName: 'ครูเอ',
      resourceType: 'lesson-summary',
      language: 'th',
    };

    it('sets title, meta description, and canonical link', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 0 });

      expect(titleService.getTitle()).toBe('สรุปคณิต ม.6 — SIRIEDUMARKET');
      expect(meta.getTag('name="description"')?.content).toBe('สรุปเข้มก่อนสอบ');
      const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      expect(link?.getAttribute('href')).toBe('https://siriedumarket.test/document/doc-1');
    });

    it('sets Open Graph + Twitter Card tags', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 0 });

      expect(meta.getTag('property="og:type"')?.content).toBe('product');
      expect(meta.getTag('property="og:title"')?.content).toBe('สรุปคณิต ม.6');
      expect(meta.getTag('property="og:image"')?.content).toBe(baseInput.coverImageUrl);
      expect(meta.getTag('property="og:site_name"')?.content).toBe('SIRIEDUMARKET');
      expect(meta.getTag('name="twitter:card"')?.content).toBe('summary_large_image');
      expect(meta.getTag('name="twitter:image"')?.content).toBe(baseInput.coverImageUrl);
    });

    it('emits exactly one JSON-LD script with @type Product + additionalType LearningResource', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 0 });

      const scripts = jsonLdScripts();
      expect(scripts.length).toBe(1);
      const data = JSON.parse(scripts[0].text) as Record<string, unknown>;
      expect(data['@type']).toBe('Product');
      expect(data['additionalType']).toBe('https://schema.org/LearningResource');
      expect(data['sku']).toBe('doc-1');
      expect((data['offers'] as Record<string, unknown>)['price']).toBe(49);
      expect((data['offers'] as Record<string, unknown>)['priceCurrency']).toBe('THB');
      expect(Array.isArray(data['image'])).toBe(true);
      for (const url of data['image'] as string[]) {
        expect(url.startsWith('http')).toBe(true);
      }
    });

    it('DEC-7: omits aggregateRating entirely when reviewCount is 0', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 0, averageRating: 3 });

      const data = JSON.parse(jsonLdScripts()[0].text) as Record<string, unknown>;
      expect(data['aggregateRating']).toBeUndefined();
    });

    it('DEC-7: includes aggregateRating with the real reviewCount when reviewCount > 0', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 12, averageRating: 4.5 });

      const data = JSON.parse(jsonLdScripts()[0].text) as Record<string, unknown>;
      const rating = data['aggregateRating'] as Record<string, unknown>;
      expect(rating['@type']).toBe('AggregateRating');
      expect(rating['reviewCount']).toBe(12);
      expect(rating['ratingValue']).toBe(4.5);
    });

    it('AC-17: replaces (does not duplicate) title/JSON-LD when called again for a different document', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 0 });
      service.setDocumentSeo({
        ...baseInput,
        documentId: 'doc-2',
        title: 'เอกสารอีกชิ้น',
        shortDescription: 'คำอธิบายอีกชิ้น',
        canonicalUrl: 'https://siriedumarket.test/document/doc-2',
        reviewCount: 5,
        averageRating: 5,
      });

      expect(titleService.getTitle()).toBe('เอกสารอีกชิ้น — SIRIEDUMARKET');
      const scripts = jsonLdScripts();
      expect(scripts.length).toBe(1);
      const data = JSON.parse(scripts[0].text) as Record<string, unknown>;
      expect(data['sku']).toBe('doc-2');
      expect(data['aggregateRating']).toBeDefined();
    });
  });

  describe('setCategorySeo', () => {
    it('sets title/description/canonical and a CollectionPage JSON-LD with no mainEntity/ItemList', () => {
      service.setCategorySeo({
        name: 'คณิตศาสตร์',
        description: 'เอกสารวิชาคณิตศาสตร์ทุกระดับชั้น',
        canonicalUrl: 'https://siriedumarket.test/category/math',
      });

      expect(titleService.getTitle()).toBe('คณิตศาสตร์ — SIRIEDUMARKET');
      expect(meta.getTag('name="description"')?.content).toBe('เอกสารวิชาคณิตศาสตร์ทุกระดับชั้น');
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://siriedumarket.test/category/math',
      );

      const scripts = jsonLdScripts();
      expect(scripts.length).toBe(1);
      const data = JSON.parse(scripts[0].text) as Record<string, unknown>;
      expect(data['@type']).toBe('CollectionPage');
      expect(data['mainEntity']).toBeUndefined();
      expect(data['itemListElement']).toBeUndefined();
    });
  });

  describe('setStoreSeo', () => {
    it('sets title/description/canonical and a ProfilePage/Organization JSON-LD with no aggregateRating', () => {
      service.setStoreSeo({
        studioName: 'ครูเอ สตูดิโอ',
        bio: 'ร้านเอกสารคุณภาพ',
        canonicalUrl: 'https://siriedumarket.test/store/seller-1',
        avatarImageUrl: 'https://siriedumarket.test/api/files/download/avatar.jpg',
        bannerImageUrl: 'https://siriedumarket.test/api/files/download/banner.jpg',
      });

      expect(titleService.getTitle()).toBe('ครูเอ สตูดิโอ — SIRIEDUMARKET');
      expect(meta.getTag('name="description"')?.content).toBe('ร้านเอกสารคุณภาพ');

      const scripts = jsonLdScripts();
      expect(scripts.length).toBe(1);
      const data = JSON.parse(scripts[0].text) as Record<string, unknown>;
      expect(data['@type']).toBe('ProfilePage');
      const mainEntity = data['mainEntity'] as Record<string, unknown>;
      expect(mainEntity['@type']).toBe('Organization');
      expect(mainEntity['name']).toBe('ครูเอ สตูดิโอ');
      expect(mainEntity['aggregateRating']).toBeUndefined();
      expect(data['aggregateRating']).toBeUndefined();
    });

    it('omits an empty bannerImageUrl from the Organization image array', () => {
      service.setStoreSeo({
        studioName: 'ครูเอ สตูดิโอ',
        bio: 'ร้านเอกสารคุณภาพ',
        canonicalUrl: 'https://siriedumarket.test/store/seller-1',
        avatarImageUrl: 'https://siriedumarket.test/api/files/download/avatar.jpg',
        bannerImageUrl: '',
      });

      const data = JSON.parse(jsonLdScripts()[0].text) as Record<string, unknown>;
      const mainEntity = data['mainEntity'] as Record<string, unknown>;
      expect(mainEntity['image']).toEqual(['https://siriedumarket.test/api/files/download/avatar.jpg']);
    });
  });

  describe('canonicalUrl', () => {
    it('builds an absolute URL against the current window origin', () => {
      const url = service.canonicalUrl('/document/doc-1');
      expect(url).toBe(`${window.location.origin}/document/doc-1`);
    });
  });
});

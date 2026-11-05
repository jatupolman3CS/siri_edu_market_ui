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
    document.getElementById('seo-breadcrumb-json-ld')?.remove();
    document.querySelector('link[rel="canonical"]')?.remove();
    document
      .querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]')
      .forEach((el) => el.remove());
    TestBed.resetTestingModule();
  });

  function jsonLdScripts(): HTMLScriptElement[] {
    return Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
  }

  function jsonLdById(id: string): Record<string, unknown> {
    const script = document.getElementById(id) as HTMLScriptElement | null;
    if (!script) throw new Error(`no #${id}`);
    return JSON.parse(script.text) as Record<string, unknown>;
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
      resourceTypeLabel: 'สรุปบทเรียน',
      gradeLevelLabels: ['ม.4-6'],
      format: 'pdf',
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

    it('seo-document-content AC-F4 / DEC-11: product JSON-LD is ["Product","LearningResource"] with no additionalType', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 0 });

      // DEC-12: the document page carries exactly two ld+json scripts (product + breadcrumb).
      const scripts = jsonLdScripts();
      expect(scripts.length).toBe(2);
      const data = jsonLdById('seo-json-ld');
      expect(data['@type']).toEqual(['Product', 'LearningResource']);
      expect('additionalType' in data).toBe(false);
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

      const data = jsonLdById('seo-json-ld');
      expect(data['aggregateRating']).toBeUndefined();
    });

    it('DEC-7: includes aggregateRating with the real reviewCount when reviewCount > 0', () => {
      service.setDocumentSeo({ ...baseInput, reviewCount: 12, averageRating: 4.5 });

      const data = jsonLdById('seo-json-ld');
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
      expect(scripts.length).toBe(2);
      const data = jsonLdById('seo-json-ld');
      expect(data['sku']).toBe('doc-2');
      expect(data['aggregateRating']).toBeDefined();
      // AC-F4: the breadcrumb is replaced too (A -> B), not duplicated.
      const crumbs = jsonLdById('seo-breadcrumb-json-ld')['itemListElement'] as Record<string, unknown>[];
      expect(crumbs[crumbs.length - 1]['item']).toBe('https://siriedumarket.test/document/doc-2');
      expect(crumbs[crumbs.length - 1]['name']).toBe('เอกสารอีกชิ้น');
    });

    describe('seo-document-content v1 (DEC-10/11/12, AC-F4/AC-F5)', () => {
      it('DEC-10: meta/og/twitter description = seoDescription when present, JSON-LD description stays shortDescription', () => {
        const expected = 'สรุปคณิตศาสตร์ ม.6 ครบทุกบท สำหรับทบทวนก่อนสอบเข้ามหาวิทยาลัย';
        service.setDocumentSeo({ ...baseInput, seoDescription: expected, reviewCount: 0 });

        expect(meta.getTag('name="description"')?.content).toBe(expected);
        expect(meta.getTag('property="og:description"')?.content).toBe(expected);
        expect(meta.getTag('name="twitter:description"')?.content).toBe(expected);
        expect(jsonLdById('seo-json-ld')['description']).toBe('สรุปเข้มก่อนสอบ');
      });

      it('DEC-10: without seoDescription (absent or blank) every description is shortDescription', () => {
        service.setDocumentSeo({ ...baseInput, seoDescription: '   ', reviewCount: 0 });

        expect(meta.getTag('name="description"')?.content).toBe('สรุปเข้มก่อนสอบ');
        expect(meta.getTag('property="og:description"')?.content).toBe('สรุปเข้มก่อนสอบ');
        expect(meta.getTag('name="twitter:description"')?.content).toBe('สรุปเข้มก่อนสอบ');
        expect(jsonLdById('seo-json-ld')['description']).toBe('สรุปเข้มก่อนสอบ');
      });

      it('DEC-11: learningResourceType is the Thai label, plus educationalLevel / encodingFormat / category / keywords', () => {
        service.setDocumentSeo({
          ...baseInput,
          gradeLevelLabels: ['ม.4-6', 'มหาวิทยาลัย'],
          keywords: ['แคลคูลัส', 'ลิมิต', 'อนุพันธ์'],
          breadcrumbCategory: { name: 'คณิตศาสตร์', url: 'https://siriedumarket.test/category/math' },
          reviewCount: 0,
        });

        const data = jsonLdById('seo-json-ld');
        expect(data['learningResourceType']).toBe('สรุปบทเรียน');
        expect(data['educationalLevel']).toEqual(['ม.4-6', 'มหาวิทยาลัย']);
        expect(data['encodingFormat']).toBe('application/pdf');
        expect(data['category']).toBe('คณิตศาสตร์');
        expect(data['keywords']).toBe('แคลคูลัส, ลิมิต, อนุพันธ์');
        expect(data['inLanguage']).toBe('th');
      });

      it('DEC-11: optional keys are omitted (never null/empty) when there is nothing to put in them', () => {
        service.setDocumentSeo({
          ...baseInput,
          resourceTypeLabel: '',
          gradeLevelLabels: [],
          keywords: [],
          format: 'rar',
          reviewCount: 0,
        });

        const data = jsonLdById('seo-json-ld');
        // §3.3: the label falls back to the raw slug.
        expect(data['learningResourceType']).toBe('lesson-summary');
        for (const key of ['educationalLevel', 'encodingFormat', 'category', 'keywords']) {
          expect(key in data).toBe(false);
        }
      });

      it.each([
        ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['zip', 'application/zip'],
      ])('§3.3: format %s -> encodingFormat %s', (format, mime) => {
        service.setDocumentSeo({ ...baseInput, format, reviewCount: 0 });
        expect(jsonLdById('seo-json-ld')['encodingFormat']).toBe(mime);
      });

      it('DEC-12: #seo-breadcrumb-json-ld = หน้าแรก > ตลาด > category > title, positions 1..4, last item = canonical', () => {
        service.setDocumentSeo({
          ...baseInput,
          breadcrumbCategory: { name: 'คณิตศาสตร์', url: 'https://siriedumarket.test/category/math' },
          reviewCount: 0,
        });

        const data = jsonLdById('seo-breadcrumb-json-ld');
        expect(data['@context']).toBe('https://schema.org');
        expect(data['@type']).toBe('BreadcrumbList');
        expect(data['itemListElement']).toEqual([
          { '@type': 'ListItem', position: 1, name: 'หน้าแรก', item: `${window.location.origin}/` },
          { '@type': 'ListItem', position: 2, name: 'ตลาด', item: `${window.location.origin}/marketplace` },
          { '@type': 'ListItem', position: 3, name: 'คณิตศาสตร์', item: 'https://siriedumarket.test/category/math' },
          { '@type': 'ListItem', position: 4, name: 'สรุปคณิต ม.6', item: 'https://siriedumarket.test/document/doc-1' },
        ]);
      });

      it('AC-C3 mirror: no resolvable category -> breadcrumb has 3 items and the product has no category', () => {
        service.setDocumentSeo({ ...baseInput, reviewCount: 0 });

        const items = jsonLdById('seo-breadcrumb-json-ld')['itemListElement'] as Record<string, unknown>[];
        expect(items.map((i) => i['position'])).toEqual([1, 2, 3]);
        expect(items.map((i) => i['name'])).toEqual(['หน้าแรก', 'ตลาด', 'สรุปคณิต ม.6']);
        expect(items[2]['item']).toBe('https://siriedumarket.test/document/doc-1');
        expect('category' in jsonLdById('seo-json-ld')).toBe(false);
      });

      it('§4.3: setCategorySeo / setStoreSeo drop the breadcrumb a document page left behind', () => {
        service.setDocumentSeo({ ...baseInput, reviewCount: 0 });
        service.setCategorySeo({
          name: 'คณิตศาสตร์',
          description: 'd',
          canonicalUrl: 'https://siriedumarket.test/category/math',
        });
        expect(document.getElementById('seo-breadcrumb-json-ld')).toBeNull();
        expect(jsonLdScripts().length).toBe(1);

        service.setDocumentSeo({ ...baseInput, reviewCount: 0 });
        service.setStoreSeo({
          studioName: 'ครูเอ',
          bio: 'b',
          canonicalUrl: 'https://siriedumarket.test/store/s-1',
          avatarImageUrl: 'https://siriedumarket.test/a.jpg',
          bannerImageUrl: '',
        });
        expect(document.getElementById('seo-breadcrumb-json-ld')).toBeNull();
        expect(jsonLdScripts().length).toBe(1);
      });
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

  describe('setPageSeo / resetPageSeo (static pages + leaving a dynamic page)', () => {
    const docInput = {
      documentId: 'doc-1',
      title: 'สรุปคณิต ม.6',
      shortDescription: 'สรุปเข้มก่อนสอบ',
      canonicalUrl: 'https://siriedumarket.test/document/doc-1',
      coverImageUrl: 'https://siriedumarket.test/api/files/download/cover.jpg',
      galleryImageUrls: [],
      price: 49,
      studioName: 'ครูเอ',
      resourceType: 'lesson-summary',
      resourceTypeLabel: 'สรุปบทเรียน',
      gradeLevelLabels: ['ม.4-6'],
      format: 'pdf',
      language: 'th',
      reviewCount: 0,
    };

    function addSiteJsonLd(): HTMLScriptElement {
      const site = document.createElement('script');
      site.id = 'site-json-ld';
      site.setAttribute('type', 'application/ld+json');
      site.text = '{"@context":"https://schema.org","@graph":[]}';
      document.head.appendChild(site);
      return site;
    }

    afterEach(() => {
      document.getElementById('site-json-ld')?.remove();
      document
        .querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]')
        .forEach((el) => el.remove());
    });

    it('setPageSeo sets title, description, canonical and website Open Graph', () => {
      service.setPageSeo({
        title: 'ตลาดเอกสาร — SIRIEDUMARKET',
        description: 'ค้นหาชีทสรุป',
        canonicalUrl: 'https://siriedumarket.test/marketplace',
      });

      expect(titleService.getTitle()).toBe('ตลาดเอกสาร — SIRIEDUMARKET');
      expect(meta.getTag('name="description"')?.content).toBe('ค้นหาชีทสรุป');
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://siriedumarket.test/marketplace',
      );
      expect(meta.getTag('property="og:type"')?.content).toBe('website');
      expect(meta.getTag('property="og:title"')?.content).toBe('ตลาดเอกสาร — SIRIEDUMARKET');
      expect(meta.getTag('property="og:description"')?.content).toBe('ค้นหาชีทสรุป');
      expect(meta.getTag('property="og:url"')?.content).toBe('https://siriedumarket.test/marketplace');
      expect(meta.getTag('property="og:site_name"')?.content).toBe('SIRIEDUMARKET');
    });

    it('setPageSeo without title reuses the current document title for og:title', () => {
      titleService.setTitle('หมวดหมู่ — SIRIEDUMARKET');
      service.setPageSeo({ description: 'd', canonicalUrl: 'https://siriedumarket.test/categories' });

      expect(titleService.getTitle()).toBe('หมวดหมู่ — SIRIEDUMARKET');
      expect(meta.getTag('property="og:title"')?.content).toBe('หมวดหมู่ — SIRIEDUMARKET');
    });

    it('setPageSeo after a document page drops its JSON-LD, cover og:image and twitter image, keeping #site-json-ld', () => {
      const site = addSiteJsonLd();
      service.setDocumentSeo(docInput);
      expect(document.getElementById('seo-json-ld')).not.toBeNull();

      service.setPageSeo({
        title: 'SIRIEDUMARKET',
        description: 'หน้าแรก',
        canonicalUrl: 'https://siriedumarket.test/',
      });

      expect(document.getElementById('seo-json-ld')).toBeNull();
      expect(document.getElementById('seo-breadcrumb-json-ld')).toBeNull();
      expect(document.getElementById('site-json-ld')).toBe(site);
      expect(meta.getTag('property="og:type"')?.content).toBe('website');
      expect(meta.getTag('property="og:image"')?.content).toBe(`${window.location.origin}/icon-512.png`);
      expect(meta.getTag('name="twitter:image"')).toBeNull();
      expect(meta.getTag('name="twitter:title"')).toBeNull();
      expect(meta.getTag('name="twitter:card"')?.content).toBe('summary');
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://siriedumarket.test/',
      );
    });

    it('resetPageSeo after a document page removes canonical/og:url/JSON-LD and restores defaults', () => {
      const site = addSiteJsonLd();
      service.setDocumentSeo(docInput);
      // seo-document-content AC-F4: both document scripts exist before the reset.
      expect(document.getElementById('seo-breadcrumb-json-ld')).not.toBeNull();

      service.resetPageSeo({ title: 'รายการโปรด — SIRIEDUMARKET', description: 'ค่าเริ่มต้นของเว็บ' });

      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
      expect(meta.getTag('property="og:url"')).toBeNull();
      expect(document.getElementById('seo-json-ld')).toBeNull();
      expect(document.getElementById('seo-breadcrumb-json-ld')).toBeNull();
      expect(document.getElementById('site-json-ld')).toBe(site);
      expect(meta.getTag('name="description"')?.content).toBe('ค่าเริ่มต้นของเว็บ');
      expect(meta.getTag('property="og:title"')?.content).toBe('รายการโปรด — SIRIEDUMARKET');
      expect(meta.getTag('property="og:description"')?.content).toBe('ค่าเริ่มต้นของเว็บ');
      expect(meta.getTag('property="og:type"')?.content).toBe('website');
      expect(meta.getTag('property="og:image"')?.content).toBe(`${window.location.origin}/icon-512.png`);
      expect(meta.getTag('name="twitter:image"')).toBeNull();
      expect(jsonLdScripts()).toEqual([site]);
    });
  });

  describe('canonicalUrl', () => {
    it('builds an absolute URL against the current window origin', () => {
      const url = service.canonicalUrl('/document/doc-1');
      expect(url).toBe(`${window.location.origin}/document/doc-1`);
    });
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Meta, Title } from '@angular/platform-browser';
import { of } from 'rxjs';
import { BuyerCategoryDetailPage } from './category-detail.page';
import { CatalogService } from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import type { Category, DocumentItem } from '../../../core/models';

/**
 * seo-ssr v1 §1.4 group C (AC-16/AC-17) — dynamic title/meta description/canonical link/JSON-LD
 * (`CollectionPage` only, DEC-8: no `ItemList`/`mainEntity`) for `/category/:slug`. `Title`/
 * `Meta` are the real Angular services here, so the assertions prove the tags actually land in
 * the DOM.
 */

function buildCategory(over: Partial<Category> = {}): Category {
  return {
    id: 'cat-1',
    name: 'คณิตศาสตร์',
    slug: 'math',
    icon: '📐',
    color: '#F9A8D4',
    description: 'เอกสารวิชาคณิตศาสตร์ทุกระดับชั้น',
    documentCount: 10,
    subcategories: [],
    ...over,
  };
}

function buildCatalog(category: Category | undefined) {
  return {
    categoryDetailState: () => idleActionState(),
    categoryDocumentsState: () => idleActionState(),
    categoryDocuments: signal<DocumentItem[]>([]).asReadonly(),
    getCategoryBySlug: () => category,
    getSubcategoryById: () => undefined,
    getSubcategoryBySlug: () => undefined,
    loadCategoryDetailBySlug: vi.fn(async () => category ?? null),
    loadCategoryDocuments: vi.fn(),
  };
}

function render(category: Category | undefined, slug = 'math') {
  const fakeRoute = {
    paramMap: of(convertToParamMap({ slug })),
    queryParamMap: of(convertToParamMap({})),
  };

  TestBed.configureTestingModule({
    imports: [BuyerCategoryDetailPage],
    providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: fakeRoute },
      { provide: CatalogService, useValue: buildCatalog(category) },
    ],
  });

  const fixture = TestBed.createComponent(BuyerCategoryDetailPage);
  fixture.detectChanges();
  return { fixture, titleService: TestBed.inject(Title), meta: TestBed.inject(Meta) };
}

afterEach(() => {
  document.getElementById('seo-json-ld')?.remove();
  document.querySelector('link[rel="canonical"]')?.remove();
  TestBed.resetTestingModule();
});

describe('BuyerCategoryDetailPage — SEO meta (seo-ssr v1)', () => {
  it('AC-16: sets document.title, meta description, canonical link, and a parseable CollectionPage JSON-LD', () => {
    const category = buildCategory();
    const { titleService, meta } = render(category);

    expect(titleService.getTitle()).toBe('คณิตศาสตร์ — SIRIEDUMARKET');
    expect(meta.getTag('name="description"')?.content).toBe('เอกสารวิชาคณิตศาสตร์ทุกระดับชั้น');

    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe(`${window.location.origin}/category/math`);

    const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    expect(script).not.toBeNull();
    const data = JSON.parse(script!.text) as Record<string, unknown>;
    expect(data['@type']).toBe('CollectionPage');
    expect(data['mainEntity']).toBeUndefined();
    expect(data['itemListElement']).toBeUndefined();
  });

  it('AC-17: navigating from one category to another does not leave a stale title/JSON-LD', () => {
    const catA = buildCategory({ slug: 'math', name: 'คณิตศาสตร์' });
    const { titleService: titleA } = render(catA, 'math');
    expect(titleA.getTitle()).toContain('คณิตศาสตร์');

    TestBed.resetTestingModule();
    const catB = buildCategory({ slug: 'science', name: 'วิทยาศาสตร์' });
    const { titleService: titleB } = render(catB, 'science');
    expect(titleB.getTitle()).toContain('วิทยาศาสตร์');
    expect(titleB.getTitle()).not.toContain('คณิตศาสตร์');

    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    expect(scripts.length).toBe(1);
    const data = JSON.parse((scripts[0] as HTMLScriptElement).text) as Record<string, unknown>;
    expect(data['name']).toBe('วิทยาศาสตร์');
  });

  it('does not set any SEO tags while the category has not loaded yet (no crash, no stale title)', () => {
    render(undefined, 'missing-slug');
    const script = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
    expect(script).toBeNull();
  });
});

import { Injectable, computed, signal } from '@angular/core';
import { Category, DocumentItem, GradeLevel, ResourceType, Subcategory } from '../models';
import { MOCK_DOCUMENTS, MOCK_PENDING_DOCUMENTS } from '../mock/documents.mock';
import { MOCK_CATEGORIES, MOCK_SUBCATEGORIES } from '../mock/categories.mock';

export interface CatalogFilters {
  search: string;
  categoryIds: string[];
  subcategoryIds: string[];
  gradeLevels: GradeLevel[];
  resourceTypes: ResourceType[];
  formats: string[];
  standards: string[];
  minPrice: number;
  maxPrice: number;
  minRating: number;
  freeOnly: boolean;
  sort: 'newest' | 'popular' | 'price-asc' | 'price-desc' | 'rating';
}

export type MarketplaceTab = 'all' | 'free' | 'top-rated' | 'new' | 'bundles';

const DEFAULT_FILTERS: CatalogFilters = {
  search: '',
  categoryIds: [],
  subcategoryIds: [],
  gradeLevels: [],
  resourceTypes: [],
  formats: [],
  standards: [],
  minPrice: 0,
  maxPrice: 1000,
  minRating: 0,
  freeOnly: false,
  sort: 'popular',
};

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly _documents = signal<DocumentItem[]>(MOCK_DOCUMENTS);
  private readonly _pending = signal<DocumentItem[]>(MOCK_PENDING_DOCUMENTS);
  private readonly _categories = signal<Category[]>(MOCK_CATEGORIES);
  private readonly _subcategories = signal<Subcategory[]>(MOCK_SUBCATEGORIES);
  private readonly _filters = signal<CatalogFilters>({ ...DEFAULT_FILTERS });
  private readonly _tab = signal<MarketplaceTab>('all');

  readonly documents = this._documents.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly categories = this._categories.asReadonly();
  readonly subcategories = this._subcategories.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly tab = this._tab.asReadonly();

  readonly featured = computed(() =>
    this._documents().filter((d) => d.isFeatured).slice(0, 6),
  );

  readonly bestsellers = computed(() =>
    this._documents().filter((d) => d.isBestseller).slice(0, 8),
  );

  readonly editorsPicks = computed(() =>
    this._documents().filter((d) => d.isEditorsPick).slice(0, 6),
  );

  readonly freeResources = computed(() =>
    this._documents().filter((d) => d.isFree),
  );

  readonly trending = computed(() =>
    [...this._documents()].sort((a, b) => b.downloads - a.downloads).slice(0, 8),
  );

  readonly newArrivals = computed(() =>
    [...this._documents()]
      .sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 6),
  );

  readonly filtered = computed(() => {
    const f = this._filters();
    const t = this._tab();
    let docs = [...this._documents()];

    // Tab filtering
    switch (t) {
      case 'free':
        docs = docs.filter((d) => d.isFree);
        break;
      case 'top-rated':
        docs = docs.filter((d) => d.rating >= 4.7);
        break;
      case 'new':
        docs = [...docs].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      // 'bundles' is handled at marketplace level via BundleService
    }

    if (f.search.trim()) {
      const term = f.search.toLowerCase();
      docs = docs.filter(
        (d) =>
          d.title.toLowerCase().includes(term) ||
          d.shortDescription.toLowerCase().includes(term) ||
          d.tags.some((tag) => tag.toLowerCase().includes(term)),
      );
    }

    if (f.categoryIds.length) {
      docs = docs.filter((d) => f.categoryIds.includes(d.categoryId));
    }
    if (f.subcategoryIds.length) {
      docs = docs.filter(
        (d) => d.subcategoryId && f.subcategoryIds.includes(d.subcategoryId),
      );
    }
    if (f.gradeLevels.length) {
      docs = docs.filter((d) =>
        d.gradeLevels.some((g) => f.gradeLevels.includes(g)),
      );
    }
    if (f.resourceTypes.length) {
      docs = docs.filter((d) => f.resourceTypes.includes(d.resourceType));
    }
    if (f.formats.length) {
      docs = docs.filter((d) => f.formats.includes(d.format));
    }
    if (f.standards.length) {
      docs = docs.filter((d) =>
        (d.standards ?? []).some((s) => f.standards.includes(s)),
      );
    }
    docs = docs.filter(
      (d) => d.price >= f.minPrice && d.price <= f.maxPrice,
    );
    if (f.minRating > 0) {
      docs = docs.filter((d) => d.rating >= f.minRating);
    }
    if (f.freeOnly) {
      docs = docs.filter((d) => d.isFree);
    }

    if (t !== 'new') {
      switch (f.sort) {
        case 'newest':
          docs.sort((a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime(),
          );
          break;
        case 'price-asc':
          docs.sort((a, b) => a.price - b.price);
          break;
        case 'price-desc':
          docs.sort((a, b) => b.price - a.price);
          break;
        case 'rating':
          docs.sort((a, b) => b.rating - a.rating);
          break;
        case 'popular':
        default:
          docs.sort((a, b) => b.downloads - a.downloads);
      }
    }

    return docs;
  });

  setTab(tab: MarketplaceTab): void {
    this._tab.set(tab);
  }

  setFilters(patch: Partial<CatalogFilters>): void {
    this._filters.update((f) => ({ ...f, ...patch }));
  }

  resetFilters(): void {
    this._filters.set({ ...DEFAULT_FILTERS });
    this._tab.set('all');
  }

  getById(id: string): DocumentItem | undefined {
    return this._documents().find((d) => d.id === id);
  }

  getCategoryById(id: string): Category | undefined {
    return this._categories().find((c) => c.id === id);
  }

  getCategoryBySlug(slug: string): Category | undefined {
    return this._categories().find((c) => c.slug === slug);
  }

  getSubcategoryById(id: string): Subcategory | undefined {
    return this._subcategories().find((s) => s.id === id);
  }

  getSubcategoryBySlug(slug: string): Subcategory | undefined {
    return this._subcategories().find((s) => s.slug === slug);
  }

  getSubcategoriesOf(categoryId: string): Subcategory[] {
    return this._subcategories().filter((s) => s.parentId === categoryId);
  }

  countByGrade(grade: GradeLevel): number {
    return this._documents().filter((d) => d.gradeLevels.includes(grade)).length;
  }

  countByResourceType(type: ResourceType): number {
    return this._documents().filter((d) => d.resourceType === type).length;
  }

  getRelated(documentId: string, limit = 4): DocumentItem[] {
    const doc = this.getById(documentId);
    if (!doc) return [];
    return this._documents()
      .filter((d) => d.id !== documentId && d.categoryId === doc.categoryId)
      .slice(0, limit);
  }

  approve(id: string): void {
    this._pending.update((list) => list.filter((d) => d.id !== id));
  }

  reject(id: string): void {
    this._pending.update((list) => list.filter((d) => d.id !== id));
  }
}

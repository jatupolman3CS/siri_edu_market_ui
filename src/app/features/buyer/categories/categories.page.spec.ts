import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BuyerCategoriesPage } from './categories.page';
import { CatalogService } from '../../../core/services';
import { idleActionState } from '../../../core/services/action-state';
import type { Category } from '../../../core/models';

/**
 * real-data-stats v1 §4.4 — Categories page hero description: same computation as Home (§4.2).
 * "แตกย่อยเป็น N หมวดย่อย" only appears once `subcategoryCount` (§3.1) is actually known on at
 * least one category — never a fabricated "0 หมวดย่อย".
 */
function buildCategory(over: Partial<Category>): Category {
  return {
    id: 'cat-1',
    name: 'การศึกษา',
    slug: 'education',
    icon: '📚',
    color: '#F9A8D4',
    description: '',
    documentCount: 10,
    ...over,
  };
}

function render(categories: Category[]) {
  const fakeCatalog = {
    ensureCategories: vi.fn(),
    loadCategories: vi.fn(),
    categories: () => categories,
    categoriesState: () => idleActionState(),
  };

  TestBed.configureTestingModule({
    imports: [BuyerCategoriesPage],
    providers: [provideRouter([]), { provide: CatalogService, useValue: fakeCatalog }],
  });

  const fixture = TestBed.createComponent(BuyerCategoriesPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('BuyerCategoriesPage — hero description (real-data-stats v1 §4.4)', () => {
  it('omits the sub-category clause when subcategoryCount is not wired yet', () => {
    const fixture = render([buildCategory({ id: 'cat-1' }), buildCategory({ id: 'cat-2' })]);

    const page = fixture.componentInstance;
    expect(page.heroDescription()).toBe(
      'กว่า 2 หมวดหมู่หลัก ครอบคลุมการศึกษา ธุรกิจ ไอที ดีไซน์ และอีกมากมาย',
    );
  });

  it('includes the sub-category count once at least one category reports it', () => {
    const fixture = render([
      buildCategory({ id: 'cat-1', subcategoryCount: 5 }),
      buildCategory({ id: 'cat-2', subcategoryCount: 3 }),
    ]);

    const page = fixture.componentInstance;
    expect(page.heroDescription()).toBe(
      'กว่า 2 หมวดหมู่หลัก แตกย่อยเป็น 8 หมวดย่อย ครอบคลุมการศึกษา ธุรกิจ ไอที ดีไซน์ และอีกมากมาย',
    );
  });

  it('falls back to a category-free description before any category has loaded', () => {
    const fixture = render([]);

    const page = fixture.componentInstance;
    expect(page.heroDescription()).not.toContain('หมวดย่อย');
    expect(page.heroDescription()).not.toMatch(/กว่า 0/);
  });
});

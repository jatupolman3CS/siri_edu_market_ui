import { TestBed } from '@angular/core/testing';
import { CategoryVisualComponent, categoryIllustrationUrl } from './category-visual.component';

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [CategoryVisualComponent] });
  const fixture = TestBed.createComponent(CategoryVisualComponent);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el };
}

afterEach(() => TestBed.resetTestingModule());

describe('categoryIllustrationUrl', () => {
  it('resolves known ids, case-insensitively, and returns null for unknown ones', () => {
    expect(categoryIllustrationUrl('kindergarten')).toBe('/images/categories/kindergarten.svg');
    expect(categoryIllustrationUrl(' Languages ')).toBe('/images/categories/languages.svg');
    expect(categoryIllustrationUrl('cat-01')).toBeNull();
    expect(categoryIllustrationUrl(undefined, null)).toBeNull();
  });

  it('falls back to the slug when the id has no illustration', () => {
    expect(categoryIllustrationUrl('cat-03', 'competitions')).toBe('/images/categories/competitions.svg');
  });
});

describe('CategoryVisualComponent', () => {
  it('renders the illustration <img> sized to the size input for a known category id', () => {
    const { el } = render({ categoryId: 'university-entrance', icon: '🎓', size: 56 });
    const img = el.querySelector('[data-testid="category-visual-img"]') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/images/categories/university-entrance.svg');
    expect(img.style.width).toBe('56px');
    expect(img.style.height).toBe('56px');
    expect(el.querySelector('[data-testid="category-visual-emoji"]')).toBeNull();
  });

  it('fills the parent box (no fixed px size) when size is omitted', () => {
    const { fixture, el } = render({ categoryId: 'kindergarten', icon: '🧸' });
    const img = el.querySelector('img') as HTMLImageElement;
    expect(img.style.width).toBe('');
    expect(img.hasAttribute('width')).toBe(false);
    expect((fixture.nativeElement as HTMLElement).classList.contains('category-visual--fill')).toBe(true);
  });

  it('falls back to the emoji icon for a legacy id (cat-01) with no illustration', () => {
    const { el } = render({ categoryId: 'cat-01', icon: '📐' });
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[data-testid="category-visual-emoji"]')?.textContent?.trim()).toBe('📐');
  });

  it('uses the fallback icon when the category has no emoji', () => {
    const { el } = render({ categoryId: 'cat-99', icon: '' });
    expect(el.querySelector('[data-testid="category-visual-emoji"]')?.textContent?.trim()).toBe('📄');
  });

  it('drops back to the emoji when the image fails to load', () => {
    const { fixture, el } = render({ categoryId: 'languages', icon: '🌐' });
    const img = el.querySelector('img') as HTMLImageElement;
    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('[data-testid="category-visual-emoji"]')?.textContent?.trim()).toBe('🌐');
  });
});

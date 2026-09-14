import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DiscoveryRailComponent } from './discovery-rail.component';
import { CartService, WishlistService } from '../../../core/services';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { DiscoverySection, DocumentItem } from '../../../core/models';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.2/§4.3/§1.4 — render
 * title/reason/items from the input signal + hide itself when items.length < 3.
 */
function buildDoc(id: string): DocumentItem {
  return mapDocument({ id, slug: id, title: `เอกสาร ${id}`, shortDescription: '', price: 100 });
}

function buildSection(over: Partial<DiscoverySection> = {}): DiscoverySection {
  return {
    key: 'interest:category:math',
    title: 'คณิตศาสตร์ที่คุณสนใจ',
    reason: 'เพราะคุณสนใจคณิตศาสตร์',
    facetType: 'category',
    facetValue: 'math',
    facetLabel: 'คณิตศาสตร์',
    items: [buildDoc('doc-1'), buildDoc('doc-2'), buildDoc('doc-3')],
    ...over,
  };
}

function render(section: DiscoverySection) {
  TestBed.configureTestingModule({
    imports: [DiscoveryRailComponent],
    providers: [
      provideRouter([]),
      { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
      { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(DiscoveryRailComponent);
  fixture.componentRef.setInput('section', section);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('DiscoveryRailComponent', () => {
  it('renders the title, reason, and every item from the input section', () => {
    const fixture = render(buildSection());

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คณิตศาสตร์ที่คุณสนใจ');
    expect(text).toContain('เพราะคุณสนใจคณิตศาสตร์');
    expect(text).toContain('เอกสาร doc-1');
    expect(text).toContain('เอกสาร doc-2');
    expect(text).toContain('เอกสาร doc-3');
  });

  it('hides itself entirely when items.length < 3', () => {
    const fixture = render(buildSection({ items: [buildDoc('doc-1'), buildDoc('doc-2')] }));

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.trim()).toBe('');
  });

  it('renders a "ดูทั้งหมด" link to /marketplace?<facetType>=<facetValue> when facetType is set', () => {
    const fixture = render(buildSection({ facetType: 'subcategory', facetValue: 'algebra' }));

    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'ดูทั้งหมด',
    ) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/marketplace?subcategory=algebra');
  });

  it('omits the "ดูทั้งหมด" link when facetType is null (fallback rows, §3.2)', () => {
    const fixture = render(buildSection({ facetType: null, facetValue: null, facetLabel: null }));

    const link = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a')).find(
      (a) => a.textContent?.trim() === 'ดูทั้งหมด',
    );
    expect(link).toBeUndefined();
  });
});

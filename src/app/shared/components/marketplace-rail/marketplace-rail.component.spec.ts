import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MarketplaceRailComponent } from './marketplace-rail.component';
import { AdsService, CartService, QuickViewService, WishlistService } from '../../../core/services';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { DocumentItem } from '../../../core/models';

/**
 * marketplace-redesign v1 §Screens 2 "Rail" — presentational rail used by the browse-mode
 * marketplace page. Copy is pre-translated and passed in as plain strings by the parent page.
 */
function buildDoc(id: string): DocumentItem {
  return mapDocument({ id, slug: id, title: `เอกสาร ${id}`, shortDescription: '', price: 100 });
}

function render(overrides: {
  docs?: DocumentItem[];
  loading?: boolean;
} = {}) {
  TestBed.configureTestingModule({
    imports: [MarketplaceRailComponent],
    providers: [
      provideRouter([]),
      { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
      { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn() } },
      { provide: QuickViewService, useValue: { open: vi.fn() } },
      { provide: AdsService, useValue: { recordImpressions: vi.fn(), recordClick: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(MarketplaceRailComponent);
  fixture.componentRef.setInput('eyebrow', 'มาใหม่');
  fixture.componentRef.setInput('title', 'รายการที่เพิ่งเข้า');
  fixture.componentRef.setInput('desc', 'เอกสารที่อัปโหลดภายใน 10 วันที่ผ่านมา');
  fixture.componentRef.setInput('viewAllLabel', 'ดูทั้งหมด 12 รายการ');
  fixture.componentRef.setInput('docs', overrides.docs ?? [buildDoc('doc-1'), buildDoc('doc-2'), buildDoc('doc-3')]);
  fixture.componentRef.setInput('loading', overrides.loading ?? false);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('MarketplaceRailComponent', () => {
  it('renders eyebrow/title/desc/viewAllLabel plus every document card when docs.length >= 3', () => {
    const fixture = render();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('มาใหม่');
    expect(text).toContain('รายการที่เพิ่งเข้า');
    expect(text).toContain('เอกสารที่อัปโหลดภายใน 10 วันที่ผ่านมา');
    expect(text).toContain('ดูทั้งหมด 12 รายการ');
    expect(text).toContain('เอกสาร doc-1');
    expect(text).toContain('เอกสาร doc-2');
    expect(text).toContain('เอกสาร doc-3');
  });

  it('renders nothing when not loading and docs.length < 3', () => {
    const fixture = render({ docs: [buildDoc('doc-1'), buildDoc('doc-2')] });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text.trim()).toBe('');
  });

  it('shows 5 skeleton slots (not the docs) while loading, even with < 3 docs', () => {
    const fixture = render({ docs: [], loading: true });

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.animate-pulse').length).toBe(5);
    expect(root.textContent).toContain('มาใหม่');
  });

  it('emits viewAll when the "ดูทั้งหมด" button is clicked', () => {
    const fixture = render();
    const onViewAll = vi.fn();
    fixture.componentInstance.viewAll.subscribe(onViewAll);

    const button = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ดูทั้งหมด'),
    ) as HTMLButtonElement;
    button.click();

    expect(onViewAll).toHaveBeenCalledTimes(1);
  });
});

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';
import { TranslationService } from '../../../core/i18n';

/**
 * A page that recreates its pager while it reloads, as /admin/audit and the two /admin/crm pagers
 * do (`@if (loading) { … } @else { … <app-pagination> }`): the new pager is created at the page
 * size that was just chosen.
 */
@Component({
  standalone: true,
  imports: [PaginationComponent],
  template: `
    @if (!loading()) {
      <app-pagination [pageSize]="pageSize()" [total]="250" (pageSizeChange)="onPageSizeChange($event)" />
    }
  `,
})
class ReloadingPagerHostComponent {
  readonly loading = signal(false);
  readonly pageSize = signal(10);
  readonly emitted: number[] = [];

  onPageSizeChange(size: number): void {
    this.emitted.push(size);
    this.pageSize.set(size);
    this.loading.set(true);
  }
}

function sizeSelect(root: HTMLElement): HTMLSelectElement {
  const select = root.querySelector('select');
  if (!select) {
    throw new Error('no page-size select');
  }
  return select;
}

/** The text of the option the closed select shows. */
function shownOption(select: HTMLSelectElement): string {
  return (select.options[select.selectedIndex]?.textContent ?? '').trim();
}

/** A user picking an option: as in a browser, `change` fires only when the selection changes. */
function choose(select: HTMLSelectElement, value: string): void {
  if (select.value === value) {
    return;
  }
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('PaginationComponent', () => {
  let component: PaginationComponent;
  let fixture: ComponentFixture<PaginationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
  });

  // The language effect persists to localStorage; clear it so a later spec file in the same
  // worker does not start in English (wallet.service.spec expects the Thai default).
  afterEach(() => window.localStorage?.removeItem('siriedu_lang'));

  it('calculates total pages correctly', () => {
    fixture.componentRef.setInput('total', 95);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.detectChanges();
    expect(component.computedTotalPages()).toBe(10);
  });

  it('generates page number array with ellipses when total pages > 7', () => {
    fixture.componentRef.setInput('total', 100);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('page', 5);
    fixture.detectChanges();
    const pages = component.pages();
    expect(pages).toContain(1);
    expect(pages).toContain('...');
    expect(pages).toContain(5);
    expect(pages).toContain(10);
  });

  it('emits pageChange on goToPage / prev / next', () => {
    let changedPage = 0;
    component.pageChange.subscribe((p) => (changedPage = p));

    fixture.componentRef.setInput('total', 50);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('page', 2);
    fixture.detectChanges();

    component.next();
    expect(changedPage).toBe(3);

    component.prev();
    expect(changedPage).toBe(1);

    component.goToPage(4);
    expect(changedPage).toBe(4);
  });

  it('shows the count in every page-size option (th and en)', () => {
    const translation = TestBed.inject(TranslationService);
    fixture.componentRef.setInput('pageSizeOptions', [10, 20, 50, 100]);
    fixture.componentRef.setInput('total', 250);

    const optionTexts = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('select option')).map((o) =>
        (o.textContent ?? '').trim(),
      );

    translation.setLanguage('th');
    fixture.detectChanges();
    expect(optionTexts()).toEqual(['10 รายการ', '20 รายการ', '50 รายการ', '100 รายการ']);

    translation.setLanguage('en');
    fixture.detectChanges();
    expect(optionTexts()).toEqual(['10 items', '20 items', '50 items', '100 items']);

    translation.setLanguage('th');
  });

  it('page-number buttons grow to 44x44 on a coarse pointer and keep 36px on a mouse (G-12 / R-2)', () => {
    fixture.componentRef.setInput('total', 100);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('page', 5);
    fixture.detectChanges();

    const pageButtons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('nav button:not([aria-label])'),
    );
    expect(pageButtons.length).toBeGreaterThan(0);
    for (const button of pageButtons) {
      // jsdom has no media queries: assert the utilities; the rendered 44x44 is measured in the browser.
      expect(button.classList).toContain('w-9');
      expect(button.classList).toContain('h-9');
      expect(button.classList).toContain('[@media(pointer:coarse)]:min-w-11');
      expect(button.classList).toContain('[@media(pointer:coarse)]:min-h-11');
    }
  });

  it('emits pageSizeChange on onPageSizeChange', () => {
    let changedSize = 0;
    component.pageSizeChange.subscribe((s) => (changedSize = s));

    const event = {
      target: { value: '50' },
    } as unknown as Event;

    component.onPageSizeChange(event);
    expect(changedSize).toBe(50);
  });

  // R-27 item 10: the select shows the real page size. A `[value]` on the <select> was applied
  // before the @for options existed, so a pager created at 50 showed "10", and picking 10 then
  // fired no change event (/admin/audit on first load; /admin/crm and its segment page after 50).
  it('shows the page size it is created with (50), not the first option', () => {
    fixture.componentRef.setInput('total', 250);
    fixture.componentRef.setInput('pageSize', 50);
    fixture.detectChanges();

    const select = sizeSelect(fixture.nativeElement as HTMLElement);
    expect(select.value).toBe('50');
    expect(shownOption(select)).toMatch(/^50 /);
  });

  it('follows later page-size changes (10 -> 100 -> 10)', () => {
    fixture.componentRef.setInput('total', 250);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.detectChanges();
    const select = sizeSelect(fixture.nativeElement as HTMLElement);
    expect(select.value).toBe('10');

    fixture.componentRef.setInput('pageSize', 100);
    fixture.detectChanges();
    expect(select.value).toBe('100');
    expect(shownOption(select)).toMatch(/^100 /);

    fixture.componentRef.setInput('pageSize', 10);
    fixture.detectChanges();
    expect(select.value).toBe('10');
    expect(shownOption(select)).toMatch(/^10 /);
  });

  it('after the pager is recreated at 50, choosing 10 emits pageSizeChange(10)', () => {
    const host = TestBed.createComponent(ReloadingPagerHostComponent);
    const root = host.nativeElement as HTMLElement;
    host.detectChanges();

    choose(sizeSelect(root), '50');
    expect(host.componentInstance.emitted).toEqual([50]);
    host.detectChanges(); // loading: the pager is gone
    expect(root.querySelector('app-pagination')).toBeNull();

    host.componentInstance.loading.set(false);
    host.detectChanges(); // loaded: a new pager, created at 50
    const select = sizeSelect(root);
    expect(select.value).toBe('50');

    choose(select, '10');
    expect(host.componentInstance.emitted).toEqual([50, 10]);
  });
});

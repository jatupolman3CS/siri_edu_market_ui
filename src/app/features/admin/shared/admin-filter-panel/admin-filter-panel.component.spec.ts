import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdminFilterPanelComponent } from './admin-filter-panel.component';
import { ViewportService } from '../../../../core/layout';

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AdminFilterPanelComponent],
  template: `
    <ng-template #fields><span class="probe-field">field</span></ng-template>
    <app-admin-filter-panel
      [fields]="fields"
      [activeCount]="count()"
      (showResults)="shown = shown + 1"
      (clearAll)="cleared = cleared + 1"
    />
  `,
})
class HostComponent {
  readonly count = signal(0);
  shown = 0;
  cleared = 0;
}

function render(count: number) {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.componentInstance.count.set(count);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AdminFilterPanelComponent (responsive-ui v1 U4-5)', () => {
  it('renders the fields inline for >=744 and no sheet until opened', () => {
    const fixture = render(0);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('[data-testid="filter-inline"] .probe-field')).not.toBeNull();
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });

  it('omits "(n)" when no filter is active', () => {
    const fixture = render(0);
    const button = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="filter-sheet-button"]');
    expect(button?.textContent).not.toMatch(/\(\d+\)/);
  });

  it('shows the active filter count on the button', () => {
    const fixture = render(3);
    const button = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="filter-sheet-button"]');
    expect(button?.textContent).toContain('(3)');
  });

  it('opens a bottom sheet with the same fields; ดูผลลัพธ์ emits and closes; ล้างทั้งหมด emits', () => {
    const fixture = render(1);
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('[data-testid="filter-sheet-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const dialog = root.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('.probe-field')).not.toBeNull();

    // F21: the projected footer row is a flex item of .bottom-sheet__footer — without w-full it
    // shrank to its content (~200px) and both flex-1 buttons wrapped to 2 lines.
    const footerRow = root.querySelector('[data-testid="filter-clear-all"]')?.parentElement as HTMLElement;
    expect(footerRow.hasAttribute('sheetFooter')).toBe(true);
    expect(footerRow.className.split(/\s+/)).toEqual(expect.arrayContaining(['flex', 'w-full']));

    (root.querySelector('[data-testid="filter-clear-all"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.cleared).toBe(1);
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();

    (root.querySelector('[data-testid="filter-show-results"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.shown).toBe(1);
    expect(root.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('AdminFilterPanelComponent — overlay lifecycle (responsive-ui v1.4 R-9 / F42)', () => {
  it('closes an open sheet when the viewport reaches the tablet tier (rotation), and it stays closed back on phone', () => {
    const isTabletUp = signal(false);
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [{ provide: ViewportService, useValue: { isTabletUp, isPhone: signal(true), isLaptopUp: signal(false), isDesktop: signal(false), tier: signal('phone') } }],
    });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    (root.querySelector('[data-testid="filter-sheet-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(root.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.documentElement.style.overflow).toBe('hidden');

    isTabletUp.set(true); // portrait -> landscape
    fixture.detectChanges();
    isTabletUp.set(false); // and back
    fixture.detectChanges();

    expect(root.querySelector('[role="dialog"]')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
  });
});

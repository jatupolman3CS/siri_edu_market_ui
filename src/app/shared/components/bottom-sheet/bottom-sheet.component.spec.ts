import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BottomSheetComponent } from './bottom-sheet.component';

@Component({
  standalone: true,
  imports: [BottomSheetComponent],
  template: `
    @if (mounted()) {
      <app-bottom-sheet [open]="open()" [title]="title()" (closed)="onClosed()">
        <p class="body-content">เนื้อหา</p>
        @if (withFooter()) {
          <div sheetFooter><button type="button" class="apply">ดูผลลัพธ์</button></div>
        }
      </app-bottom-sheet>
    }
  `,
})
class HostComponent {
  readonly mounted = signal(true);
  readonly open = signal(false);
  readonly title = signal('ตัวกรอง');
  readonly withFooter = signal(true);
  closedCount = 0;
  onClosed(): void {
    this.closedCount++;
    this.open.set(false);
  }
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const host = fixture.componentInstance;
  const openSheet = () => {
    host.open.set(true);
    fixture.detectChanges();
  };
  return { fixture, el, host, openSheet };
}

describe('BottomSheetComponent', () => {
  afterEach(() => {
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('renders nothing while closed and the dialog once opened', () => {
    const { el, openSheet } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    openSheet();
    const dialog = el.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    const labelledBy = dialog?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(el.querySelector(`#${labelledBy}`)?.textContent?.trim()).toBe('ตัวกรอง');
    expect(el.querySelector('.bottom-sheet__body .body-content')?.textContent).toBe('เนื้อหา');
  });

  it('renders the [sheetFooter] slot in the footer', () => {
    const { el, openSheet } = setup();
    openSheet();
    expect(el.querySelector('[data-testid="sheet-footer"] .apply')?.textContent).toBe('ดูผลลัพธ์');
  });

  it('closes: open → closed after the close button', () => {
    const { fixture, el, host, openSheet } = setup();
    openSheet();
    (el.querySelector('[data-testid="sheet-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.closedCount).toBe(1);
    expect(el.querySelector('[role="dialog"]')).toBeNull();
  });

  it('emits closed on backdrop click', () => {
    const { el, host, openSheet } = setup();
    openSheet();
    (el.querySelector('[data-testid="sheet-backdrop"]') as HTMLElement).click();
    expect(host.closedCount).toBe(1);
  });

  it('emits closed on ESC only while open', () => {
    const { host, openSheet } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.closedCount).toBe(0);

    openSheet();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.closedCount).toBe(1);
  });

  it('ignores an Escape an inner overlay (nz-select, date picker) already handled', () => {
    const { host, openSheet } = setup();
    openSheet();

    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
    handled.preventDefault();
    document.dispatchEvent(handled);
    expect(host.closedCount).toBe(0);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(host.closedCount).toBe(1);
  });

  it('keeps <body> from becoming the scroller while locked, and restores both on close', () => {
    const { fixture, host, openSheet } = setup();
    const html = document.documentElement;

    openSheet();
    // body is pinned to visible BEFORE html is hidden, so the page keeps its scroll position.
    expect(document.body.style.overflow).toBe('visible');
    expect(html.style.overflow).toBe('hidden');

    host.open.set(false);
    fixture.detectChanges();
    expect(html.style.overflow).toBe('');
    expect(document.body.style.overflow).toBe('');
  });

  it('locks page scroll while open and releases it on close and on destroy', () => {
    const { fixture, host, openSheet } = setup();
    const html = document.documentElement;
    expect(html.style.overflow).toBe('');

    openSheet();
    expect(html.style.overflow).toBe('hidden');

    host.open.set(false);
    fixture.detectChanges();
    expect(html.style.overflow).toBe('');

    openSheet();
    expect(html.style.overflow).toBe('hidden');
    host.mounted.set(false);
    fixture.detectChanges();
    expect(html.style.overflow).toBe('');
  });

  it('uses the slide-over modifier by default and drops it for tabletMode="sheet"', () => {
    const fixture = TestBed.createComponent(BottomSheetComponent);
    fixture.componentRef.setInput('open', true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.bottom-sheet')?.classList.contains('bottom-sheet--slide-over')).toBe(true);

    fixture.componentRef.setInput('tabletMode', 'sheet');
    fixture.detectChanges();
    expect(el.querySelector('.bottom-sheet')?.classList.contains('bottom-sheet--slide-over')).toBe(false);
    fixture.destroy();
  });
});

import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { LightboxComponent } from './lightbox.component';
import { LightboxService } from '../../services/lightbox.service';

function render() {
  TestBed.configureTestingModule({ imports: [LightboxComponent] });
  const fixture = TestBed.createComponent(LightboxComponent);
  const lightbox = TestBed.inject(LightboxService);
  return { fixture, lightbox };
}

afterEach(() => TestBed.resetTestingModule());

describe('LightboxComponent', () => {
  it('renders nothing when no item is open (AC-27: the full <img> is not in the DOM)', () => {
    const { fixture } = render();
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img');
    expect(img).toBeNull();
  });

  it('renders the full-resolution image once the service opens one', () => {
    const { fixture, lightbox } = render();
    fixture.detectChanges();

    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toBe('https://cdn.test/full.webp');
    expect(img.alt).toBe('ปกเอกสาร');
  });

  it('clicking the backdrop closes the lightbox', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const backdrop = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]') as HTMLElement;
    backdrop.click();

    expect(lightbox.current()).toBeNull();
  });

  it('clicking the image itself does not close the lightbox', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    img.click();

    expect(lightbox.current()).not.toBeNull();
  });

  it('the close button closes the lightbox', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const closeButton = (fixture.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;
    closeButton.click();

    expect(lightbox.current()).toBeNull();
  });

  it('is a named modal dialog with a translated close label', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', '');
    fixture.detectChanges();

    const dialog = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Existing keys only (responsive-ui v1.4 §4.8): common.preview / common.close.
    expect(dialog.getAttribute('aria-label')).toBe('ดูตัวอย่าง');
    expect((fixture.nativeElement as HTMLElement).querySelector('button')?.getAttribute('aria-label')).toBe('ปิด');
    lightbox.close();
    fixture.detectChanges();
  });

  it('traps focus in the dialog, auto-capturing it on open (focus returns to the opener on close)', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    // jsdom has no layout, so CDK never finds a "visible" tabbable element to move focus to — the
    // real focus move / restore is verified in the browser; here: the trap is on, with auto-capture.
    const trap = fixture.debugElement.query(By.directive(CdkTrapFocus)).injector.get(CdkTrapFocus);
    expect(trap.enabled).toBe(true);
    expect(trap.autoCapture).toBe(true);
    lightbox.close();
    fixture.detectChanges();
  });

  it('keeps the focus-trap anchors inside the fixed root, so tabbing onto one cannot scroll the page behind (G-21)', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const root = host.querySelector('.lightbox-root') as HTMLElement;
    const dialog = host.querySelector('[role="dialog"]') as HTMLElement;
    expect(root.classList).toContain('fixed');
    expect(dialog.parentElement).toBe(root);

    const anchors = Array.from(host.querySelectorAll('.cdk-focus-trap-anchor'));
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) expect(anchor.parentElement).toBe(root);
    lightbox.close();
    fixture.detectChanges();
  });

  it('locks page scroll while open and releases it on close', () => {
    const { fixture, lightbox } = render();
    fixture.detectChanges();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe('hidden');

    lightbox.close();
    fixture.detectChanges();
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('pressing Escape on the backdrop closes the lightbox', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const backdrop = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]') as HTMLElement;
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(lightbox.current()).toBeNull();
  });
});

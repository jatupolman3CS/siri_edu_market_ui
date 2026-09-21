import { TestBed } from '@angular/core/testing';
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

  it('pressing Escape on the backdrop closes the lightbox', () => {
    const { fixture, lightbox } = render();
    lightbox.open('https://cdn.test/full.webp', 'ปกเอกสาร');
    fixture.detectChanges();

    const backdrop = (fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]') as HTMLElement;
    backdrop.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(lightbox.current()).toBeNull();
  });
});

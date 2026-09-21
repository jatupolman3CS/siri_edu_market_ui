import { TestBed } from '@angular/core/testing';
import { OptimizedImageComponent } from './optimized-image.component';
import { LightboxService } from '../../services/lightbox.service';
import { DEFAULT_LOGO_ASSET_PATH } from '../../directives/img-fallback.directive';

function render() {
  TestBed.configureTestingModule({ imports: [OptimizedImageComponent] });
  const fixture = TestBed.createComponent(OptimizedImageComponent);
  const lightbox = TestBed.inject(LightboxService);
  return { fixture, lightbox };
}

afterEach(() => TestBed.resetTestingModule());

describe('OptimizedImageComponent', () => {
  it('renders src on the <picture>/<source>/<img> when no thumbSrc is given', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('src', 'https://cdn.test/cover.jpg');
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    const source = (fixture.nativeElement as HTMLElement).querySelector('source') as HTMLSourceElement;
    const picture = (fixture.nativeElement as HTMLElement).querySelector('picture');

    expect(picture).not.toBeNull();
    expect(img.src).toBe('https://cdn.test/cover.jpg');
    expect(source.srcset).toBe('https://cdn.test/cover.jpg');
  });

  it('prefers thumbSrc over src for the visible image when both are given', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('src', 'https://cdn.test/cover.jpg');
    fixture.componentRef.setInput('thumbSrc', 'https://cdn.test/cover_thumb.webp');
    fixture.detectChanges();

    const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.test/cover_thumb.webp');
  });

  it('sets loading="lazy" by default and omits it when eager is true', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('src', 'https://cdn.test/cover.jpg');
    fixture.detectChanges();
    let img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('loading')).toBe('lazy');

    fixture.componentRef.setInput('eager', true);
    fixture.detectChanges();
    img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
    expect(img.getAttribute('loading')).toBeNull();
  });

  it('falls back to the default logo on a broken image (AC-28: fallback still works)', () => {
    const { fixture } = render();
    fixture.componentRef.setInput('src', 'https://cdn.test/broken.jpg');
    fixture.detectChanges();
    const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;

    img.dispatchEvent(new Event('error'));

    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });

  describe('lightbox', () => {
    it('does nothing on click when lightbox is false (the default)', () => {
      const { fixture, lightbox } = render();
      fixture.componentRef.setInput('src', 'https://cdn.test/cover.jpg');
      fixture.detectChanges();
      const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;

      img.click();

      expect(lightbox.current()).toBeNull();
    });

    it('opens the lightbox with fullSrc (falling back to src) only when lightbox is true and clicked (AC-27)', () => {
      const { fixture, lightbox } = render();
      fixture.componentRef.setInput('src', 'https://cdn.test/medium.webp');
      fixture.componentRef.setInput('fullSrc', 'https://cdn.test/full.webp');
      fixture.componentRef.setInput('alt', 'ปกเอกสาร');
      fixture.componentRef.setInput('lightbox', true);
      fixture.detectChanges();
      const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;

      // The full image must not have been fetched/rendered anywhere before the click.
      expect(lightbox.current()).toBeNull();

      img.click();

      expect(lightbox.current()).toEqual({ src: 'https://cdn.test/full.webp', alt: 'ปกเอกสาร' });
    });

    it('falls back to src for the lightbox when fullSrc is not given', () => {
      const { fixture, lightbox } = render();
      fixture.componentRef.setInput('src', 'https://cdn.test/medium.webp');
      fixture.componentRef.setInput('lightbox', true);
      fixture.detectChanges();
      const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;

      img.click();

      expect(lightbox.current()?.src).toBe('https://cdn.test/medium.webp');
    });
  });
});

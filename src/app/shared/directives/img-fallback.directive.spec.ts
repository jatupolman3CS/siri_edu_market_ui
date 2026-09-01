import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_LOGO_ASSET_PATH, ImgFallbackDirective } from './img-fallback.directive';

@Component({
  standalone: true,
  imports: [ImgFallbackDirective],
  template: `<img appImgFallback [src]="src()" alt="test" />`,
})
class HostComponent {
  readonly src = signal<string | null | undefined>('https://example.test/cover.jpg');
}

function render() {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const img = (fixture.nativeElement as HTMLElement).querySelector('img') as HTMLImageElement;
  return { fixture, img };
}

afterEach(() => TestBed.resetTestingModule());

describe('ImgFallbackDirective', () => {
  it('renders the given src as-is when it is a real URL', () => {
    const { img } = render();
    expect(img.src).toBe('https://example.test/cover.jpg');
  });

  it('shows the default logo immediately when src is an empty string', () => {
    const { fixture, img } = render();
    fixture.componentInstance.src.set('');
    fixture.detectChanges();
    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });

  it('shows the default logo immediately when src is null', () => {
    const { fixture, img } = render();
    fixture.componentInstance.src.set(null);
    fixture.detectChanges();
    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });

  it('shows the default logo immediately when src is undefined', () => {
    const { fixture, img } = render();
    fixture.componentInstance.src.set(undefined);
    fixture.detectChanges();
    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });

  it('swaps to the default logo when the image fails to load', () => {
    const { img } = render();
    img.dispatchEvent(new Event('error'));
    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });

  it('does not loop when the default logo itself fails to load', () => {
    const { img } = render();
    img.dispatchEvent(new Event('error'));
    const afterFirstError = img.src;
    expect(afterFirstError.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);

    // Simulates the default logo asset itself 404ing — the guard flag must stop a second swap.
    img.dispatchEvent(new Event('error'));
    expect(img.src).toBe(afterFirstError);
  });

  it('resets the guard when a fresh src is assigned after a fallback', () => {
    const { fixture, img } = render();
    fixture.componentInstance.src.set('');
    fixture.detectChanges();
    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);

    fixture.componentInstance.src.set('https://example.test/other.jpg');
    fixture.detectChanges();
    expect(img.src).toBe('https://example.test/other.jpg');

    // A later failure on the new src must still be able to fall back again.
    img.dispatchEvent(new Event('error'));
    expect(img.src.endsWith(DEFAULT_LOGO_ASSET_PATH)).toBe(true);
  });
});

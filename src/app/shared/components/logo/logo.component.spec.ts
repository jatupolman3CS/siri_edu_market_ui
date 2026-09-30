import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LogoComponent } from './logo.component';

function render(inputs: { link?: string; showText?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [LogoComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(LogoComponent);
  if (inputs.link !== undefined) fixture.componentRef.setInput('link', inputs.link);
  if (inputs.showText !== undefined) fixture.componentRef.setInput('showText', inputs.showText);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('LogoComponent', () => {
  it('links to "/" by default and to the given link otherwise', () => {
    expect((render().nativeElement as HTMLElement).querySelector('a')?.getAttribute('href')).toBe('/');
    TestBed.resetTestingModule();
    expect((render({ link: '/seller' }).nativeElement as HTMLElement).querySelector('a')?.getAttribute('href')).toBe('/seller');
  });

  it('renders the wordmark unless showText is false', () => {
    expect((render().nativeElement as HTMLElement).querySelector('.logo__wordmark')?.textContent).toContain('SIRIEDUMARKET');
    TestBed.resetTestingModule();
    expect((render({ showText: false }).nativeElement as HTMLElement).querySelector('.logo__wordmark')).toBeNull();
  });

  // responsive-ui v1.4 closing gate G1-2 (G-12): the 40px tile made the link 40 tall, and 40 wide when
  // the wordmark is hidden (< 360 in the buyer top bar). Touch gets 44x44; fine pointers keep 40px.
  it('gives the link a 44x44 minimum on coarse pointers only', () => {
    const link = (render().nativeElement as HTMLElement).querySelector('a') as HTMLElement;
    expect(link.className).toContain('[@media(pointer:coarse)]:min-h-11');
    expect(link.className).toContain('[@media(pointer:coarse)]:min-w-11');
    expect(link.className).not.toMatch(/(^|\s)min-h-11(\s|$)/);
    // The row it sits in may shrink it (F3/F84): the link must stay shrinkable.
    expect(link.className).toContain('min-w-0');
  });
});

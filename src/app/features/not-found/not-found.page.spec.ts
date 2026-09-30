import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundPage } from './not-found.page';

function render() {
  TestBed.configureTestingModule({
    imports: [NotFoundPage],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(NotFoundPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('NotFoundPage', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('offers the two ways out: home and the marketplace', () => {
    const el = render();
    const hrefs = Array.from(el.querySelectorAll('a.btn-pink, a.btn-ghost')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/', '/marketplace']);
  });

  it('keeps its page padding with the safe-area inset composed in (responsive-ui v1 U5-5)', () => {
    // The bare `.safe-*` helpers next to `px-4 py-8` used to zero the padding, so the CTAs
    // touched the screen edge at 375px. The inset now goes inside each padding value.
    const root = render().firstElementChild as HTMLElement;
    const classes = Array.from(root.classList);

    expect(classes).toEqual(
      expect.arrayContaining([
        'pt-[calc(2rem+var(--safe-top))]',
        'pb-[calc(2rem+var(--safe-bottom))]',
        'pl-[max(1rem,var(--safe-left))]',
        'pr-[max(1rem,var(--safe-right))]',
      ]),
    );
    expect(classes.filter((c) => /^safe-(?:top|bottom|x)$/.test(c))).toEqual([]);
  });
});

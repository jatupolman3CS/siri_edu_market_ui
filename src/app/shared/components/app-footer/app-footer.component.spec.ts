import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppFooterComponent } from './app-footer.component';

/**
 * QA bug #4: the footer's Facebook/Instagram/Line icons (and, same root cause, its
 * "ศูนย์ช่วยเหลือ"/privacy/terms links) were `href="#"` — dead links on every page since none of
 * those destinations exist in the app yet. They must not render as clickable dead links.
 */
function render() {
  TestBed.configureTestingModule({
    imports: [AppFooterComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(AppFooterComponent);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('AppFooterComponent — no dead `href="#"` links (bug #4)', () => {
  it('has no anchor pointing at "#"', () => {
    const el = render().nativeElement as HTMLElement;
    const hrefs = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));

    expect(hrefs).not.toContain('#');
  });

  it('still shows the ศูนย์ช่วยเหลือ/privacy/terms copy as plain (non-link) text', () => {
    const el = render().nativeElement as HTMLElement;
    const text = el.textContent ?? '';

    expect(text).toContain('ศูนย์ช่วยเหลือ');
    expect(text).toContain('นโยบายความเป็นส่วนตัว');
    expect(text).toContain('เงื่อนไขการใช้งาน');
  });

  it('keeps the real mailto contact link', () => {
    const el = render().nativeElement as HTMLElement;
    expect(el.querySelector('a[href="mailto:hello@siriedumarket.co"]')).toBeTruthy();
  });
});

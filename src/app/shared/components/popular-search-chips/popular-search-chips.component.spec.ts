import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PopularSearchChipsComponent } from './popular-search-chips.component';
import type { PopularSearchTerm } from '../../../core/models';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1/§4.3 — AC-25/AC-26.
 */
function render(terms: PopularSearchTerm[] = [], fallbackTerms: string[] = [], label = 'ฮิตตอนนี้:') {
  TestBed.configureTestingModule({
    imports: [PopularSearchChipsComponent],
    providers: [provideRouter([])],
  });
  const fixture = TestBed.createComponent(PopularSearchChipsComponent);
  fixture.componentRef.setInput('terms', terms);
  fixture.componentRef.setInput('fallbackTerms', fallbackTerms);
  fixture.componentRef.setInput('label', label);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('PopularSearchChipsComponent', () => {
  it('AC-25: renders exactly the real terms the API returned, each linking to /marketplace?q=<term>', () => {
    const terms: PopularSearchTerm[] = [
      { term: 'toeic', rank: 1, isRising: false },
      { term: 'pitch deck', rank: 2, isRising: false },
      { term: 'resume', rank: 3, isRising: false },
    ];
    const fixture = render(terms, ['สรุปคณิตม.ปลาย', 'Pitch Deck', 'TOEIC', 'Resume', 'งานวิจัย']);

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
    expect(links.length).toBe(3);
    expect(links.map((a) => a.textContent?.trim())).toEqual(
      expect.arrayContaining(['toeic', 'pitch deck', 'resume']),
    );
    const toeicLink = links.find((a) => a.textContent?.includes('toeic'))!;
    expect(toeicLink.getAttribute('href')).toBe('/marketplace?q=toeic');
  });

  it('marks isRising terms with the 🔥 badge and its title', () => {
    const terms: PopularSearchTerm[] = [{ term: 'ielts', rank: 1, isRising: true }];
    const fixture = render(terms);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('🔥');
    const badge = (fixture.nativeElement as HTMLElement).querySelector('[title="มาแรงในสัปดาห์นี้"]');
    expect(badge).toBeTruthy();
  });

  it('never renders text suggesting the chips were personalized (§4.3)', () => {
    const terms: PopularSearchTerm[] = [{ term: 'toeic', rank: 1, isRising: false }];
    const fixture = render(terms);

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('ความสนใจของคุณ');
    expect(text).not.toContain('เฉพาะคุณ');
  });

  it('AC-26: falls back to fallbackTerms() when terms() is empty (no data yet / failed) — never an empty chip row', () => {
    const fallback = ['สรุปคณิตม.ปลาย', 'Pitch Deck', 'TOEIC', 'Resume', 'งานวิจัย'];
    const fixture = render([], fallback);

    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
    expect(links.map((a) => a.textContent?.trim())).toEqual(fallback);
  });

  it('renders nothing when both terms() and fallbackTerms() are empty', () => {
    const fixture = render([], []);

    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('a');
    expect(links.length).toBe(0);
  });

  it('renders the given label prefix', () => {
    const fixture = render([{ term: 'toeic', rank: 1, isRising: false }], [], 'คนอื่นกำลังค้นหา:');

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('คนอื่นกำลังค้นหา:');
  });
});

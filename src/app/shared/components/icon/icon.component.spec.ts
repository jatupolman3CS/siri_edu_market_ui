import { TestBed } from '@angular/core/testing';
import { IconComponent } from './icon.component';

const HEART_PATH =
  'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78Z';

describe('IconComponent heart icons', () => {
  it.each([
    ['heart', null],
    ['heart-fill', 'currentColor'],
  ] as const)('renders the symmetric heart shape for %s', (name, fill) => {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();

    const path = fixture.nativeElement.querySelector('path') as SVGPathElement;
    expect(path.getAttribute('d')).toBe(HEART_PATH);
    expect(path.getAttribute('fill')).toBe(fill);
  });
});

describe('IconComponent speaker icons', () => {
  function render(name: 'volume-2' | 'volume-x'): SVGElement {
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', name);
    fixture.detectChanges();
    return fixture.nativeElement.querySelector('svg') as SVGElement;
  }

  it('renders the speaker with sound waves for volume-2 (sound on)', () => {
    const svg = render('volume-2');
    expect(svg.querySelectorAll('path')).toHaveLength(3);
  });

  it('renders the speaker with a cross for volume-x (sound off) — different from volume-2', () => {
    const on = render('volume-2');
    const off = render('volume-x');
    expect(off.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(off.innerHTML).not.toBe(on.innerHTML);
  });
});

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

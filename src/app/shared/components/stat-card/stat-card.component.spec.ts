import { TestBed } from '@angular/core/testing';
import { StatCardComponent } from './stat-card.component';

function render(inputs: Record<string, unknown>) {
  const fixture = TestBed.createComponent(StatCardComponent);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const label = el.querySelector('.card-tile > div:first-child > span') as HTMLElement;
  const value = el.querySelector('.card-tile-body') as HTMLElement;
  return { fixture, el, label, value };
}

describe('StatCardComponent', () => {
  it('lets the label wrap in full (no line clamp) and exposes it as a title', () => {
    const { label } = render({ label: 'Documents with recommendations', value: '0' });
    expect(label.textContent?.trim()).toBe('Documents with recommendations');
    expect(label.className).not.toContain('line-clamp');
    expect(label.className).toContain('[overflow-wrap:anywhere]');
    expect(label.getAttribute('title')).toBe('Documents with recommendations');
  });

  it('renders the value alone when no unit is given', () => {
    const { value } = render({ label: 'Revenue', value: '฿1.23M' });
    expect(value.textContent?.trim()).toBe('฿1.23M');
    expect(value.querySelector('.whitespace-nowrap')).toBeNull();
    expect(value.hasAttribute('title')).toBe(false);
  });

  it('keeps the number on one line and renders the unit after it', () => {
    const { value } = render({ label: 'Docs', value: '12', unit: 'documents' });
    const spans = value.querySelectorAll('span');
    expect(spans[0].textContent?.trim()).toBe('12');
    expect(spans[0].classList.contains('whitespace-nowrap')).toBe(true);
    expect(spans[1].textContent?.trim()).toBe('documents');
  });

  it('puts the full value in the tooltip when valueTitle is set', () => {
    const { value } = render({ label: 'Revenue', value: '฿1.23M', valueTitle: '฿1,234,568' });
    expect(value.getAttribute('title')).toBe('฿1,234,568');
  });

  it('shows the trend row only with a trend', () => {
    expect(render({ label: 'A', value: '1' }).el.textContent).not.toContain('+5%');
    expect(render({ label: 'A', value: '1', trend: '+5%', trendLabel: 'vs last month' }).el.textContent).toContain(
      'vs last month',
    );
  });
});

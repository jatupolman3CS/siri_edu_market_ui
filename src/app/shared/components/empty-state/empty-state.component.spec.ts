import { TestBed } from '@angular/core/testing';
import { EmptyStateComponent } from './empty-state.component';

function render(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [EmptyStateComponent] });
  const fixture = TestBed.createComponent(EmptyStateComponent);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => TestBed.resetTestingModule());

describe('EmptyStateComponent', () => {
  it('shows the emoji box when no illustration is given (existing callers unchanged)', () => {
    const el = render({ title: 'ว่าง', emoji: '🛒' });
    expect(el.querySelector('[data-testid="empty-state-emoji"]')?.textContent?.trim()).toBe('🛒');
    expect(el.querySelector('[data-testid="empty-state-illustration"]')).toBeNull();
    expect(el.querySelector('h3')?.textContent?.trim()).toBe('ว่าง');
  });

  it('renders the bundled illustration instead of the emoji when illustration is set', () => {
    const el = render({ title: 'ไม่พบ', emoji: '🔍', illustration: 'search' });
    const img = el.querySelector('[data-testid="empty-state-illustration"]') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/images/empty/search.svg');
    expect(el.querySelector('[data-testid="empty-state-emoji"]')).toBeNull();
  });

  it('renders the description only when provided', () => {
    expect(render({ title: 'a' }).querySelector('p')).toBeNull();
    TestBed.resetTestingModule();
    expect(render({ title: 'a', description: 'รายละเอียด' }).querySelector('p')?.textContent?.trim()).toBe('รายละเอียด');
  });
});

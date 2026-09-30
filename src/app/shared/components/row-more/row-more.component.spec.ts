import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { NzPopoverDirective } from 'ng-zorro-antd/popover';
import { RowMoreComponent, type RowMoreItem } from './row-more.component';

const ITEMS: RowMoreItem[] = [
  { label: 'อีเมล', value: 'a@b.co' },
  { label: 'ยอดขาย', value: 12 },
  { label: 'ศูนย์', value: 0 },
  { label: 'ว่าง', value: null },
  { label: 'ไม่มี', value: undefined },
  { label: 'สตริงว่าง', value: '' },
];

function setup(items: RowMoreItem[] = ITEMS) {
  TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
  const fixture = TestBed.createComponent(RowMoreComponent);
  fixture.componentRef.setInput('items', items);
  fixture.detectChanges();
  return fixture;
}

describe('RowMoreComponent', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => (node.innerHTML = ''));
  });

  it('lets the popover be pushed back on-screen when no placement fits', async () => {
    const fixture = setup();
    await fixture.whenStable();
    const directive = fixture.debugElement.query(By.directive(NzPopoverDirective)).injector.get(NzPopoverDirective);
    expect(directive.component?.cdkConnectedOverlayPush).toBe(true);
  });

  it('renders an accessible ⋯ button', () => {
    const fixture = setup();
    const button = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="row-more-button"]');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('ดูข้อมูลเพิ่มเติม');
    expect(button?.querySelector('svg')).not.toBeNull();
  });

  it('opens a popover listing label/value pairs and skips null/undefined/empty values', async () => {
    const fixture = setup();
    ((fixture.nativeElement as HTMLElement).querySelector('[data-testid="row-more-button"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const list = document.querySelector('[data-testid="row-more-list"]');
    expect(list).not.toBeNull();
    const labels = Array.from(list!.querySelectorAll('dt')).map((n) => n.textContent?.trim());
    const values = Array.from(list!.querySelectorAll('dd')).map((n) => n.textContent?.trim());
    expect(labels).toEqual(['อีเมล', 'ยอดขาย', 'ศูนย์']);
    expect(values).toEqual(['a@b.co', '12', '0']);
  });
});

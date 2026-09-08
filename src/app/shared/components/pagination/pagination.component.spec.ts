import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let component: PaginationComponent;
  let fixture: ComponentFixture<PaginationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PaginationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
  });

  it('calculates total pages correctly', () => {
    fixture.componentRef.setInput('total', 95);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.detectChanges();
    expect(component.computedTotalPages()).toBe(10);
  });

  it('generates page number array with ellipses when total pages > 7', () => {
    fixture.componentRef.setInput('total', 100);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('page', 5);
    fixture.detectChanges();
    const pages = component.pages();
    expect(pages).toContain(1);
    expect(pages).toContain('...');
    expect(pages).toContain(5);
    expect(pages).toContain(10);
  });

  it('emits pageChange on goToPage / prev / next', () => {
    let changedPage = 0;
    component.pageChange.subscribe((p) => (changedPage = p));

    fixture.componentRef.setInput('total', 50);
    fixture.componentRef.setInput('pageSize', 10);
    fixture.componentRef.setInput('page', 2);
    fixture.detectChanges();

    component.next();
    expect(changedPage).toBe(3);

    component.prev();
    expect(changedPage).toBe(1);

    component.goToPage(4);
    expect(changedPage).toBe(4);
  });

  it('emits pageSizeChange on onPageSizeChange', () => {
    let changedSize = 0;
    component.pageSizeChange.subscribe((s) => (changedSize = s));

    const event = {
      target: { value: '50' },
    } as unknown as Event;

    component.onPageSizeChange(event);
    expect(changedSize).toBe(50);
  });
});

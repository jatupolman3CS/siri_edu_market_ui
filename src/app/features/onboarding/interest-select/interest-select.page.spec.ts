import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { InterestSelectPage } from './interest-select.page';
import { AuthService, CatalogService, OnboardingService } from '../../../core/services';
import type { Category } from '../../../core/models';
import { idleActionState } from '../../../core/services/action-state';

describe('InterestSelectPage (AC-16)', () => {
  let fixture: ComponentFixture<InterestSelectPage>;
  let component: InterestSelectPage;
  let router: { navigateByUrl: ReturnType<typeof vi.fn> };
  let auth: { resolvePostAuthRedirect: ReturnType<typeof vi.fn> };
  let onboarding: {
    updateInterests: ReturnType<typeof vi.fn>;
    skip: ReturnType<typeof vi.fn>;
  };
  let catalog: {
    categories: ReturnType<typeof signal<Category[]>>;
    categoriesState: ReturnType<typeof signal<any>>;
    ensureCategories: ReturnType<typeof vi.fn>;
  };

  const mockCategories: Category[] = [
    { id: 'cat-math', name: 'คณิตศาสตร์', slug: 'math', icon: '📐', color: 'blue', description: 'คณิตศาสตร์', documentCount: 5 },
    { id: 'cat-sci', name: 'วิทยาศาสตร์', slug: 'sci', icon: '🔬', color: 'green', description: 'วิทยาศาสตร์', documentCount: 3 },
  ];

  beforeEach(async () => {
    router = { navigateByUrl: vi.fn().mockResolvedValue(true) };
    auth = { resolvePostAuthRedirect: vi.fn().mockReturnValue('/marketplace') };
    onboarding = {
      updateInterests: vi.fn().mockResolvedValue({ ok: true }),
      skip: vi.fn().mockResolvedValue({ ok: true }),
    };
    catalog = {
      categories: signal<Category[]>(mockCategories),
      categoriesState: signal(idleActionState()),
      ensureCategories: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [InterestSelectPage],
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: auth },
        { provide: OnboardingService, useValue: onboarding },
        { provide: CatalogService, useValue: catalog },
        { provide: NzMessageService, useValue: { error: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (k: string) => (k === 'returnUrl' ? '/marketplace' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InterestSelectPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('calls ensureCategories on init', () => {
    expect(catalog.ensureCategories).toHaveBeenCalledTimes(1);
  });

  it('toggles category selection on pill click', () => {
    expect(component.isSelected('cat-math')).toBe(false);

    component.toggleCategory('cat-math');
    expect(component.isSelected('cat-math')).toBe(true);
    expect(component.selectedCategoryIds()).toEqual(['cat-math']);

    component.toggleCategory('cat-sci');
    expect(component.selectedCategoryIds()).toEqual(['cat-math', 'cat-sci']);

    component.toggleCategory('cat-math');
    expect(component.isSelected('cat-math')).toBe(false);
    expect(component.selectedCategoryIds()).toEqual(['cat-sci']);
  });

  it('onSave calls updateInterests with selected categories and redirects', async () => {
    component.toggleCategory('cat-math');
    component.toggleCategory('cat-sci');

    await component.onSave();

    expect(onboarding.updateInterests).toHaveBeenCalledWith(['cat-math', 'cat-sci']);
    expect(auth.resolvePostAuthRedirect).toHaveBeenCalledWith('/marketplace');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/marketplace');
  });

  it('onSkip calls skip and redirects without updating interests', async () => {
    await component.onSkip();

    expect(onboarding.skip).toHaveBeenCalledTimes(1);
    expect(onboarding.updateInterests).not.toHaveBeenCalled();
    expect(auth.resolvePostAuthRedirect).toHaveBeenCalledWith('/marketplace');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/marketplace');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { RoleSelectPage } from './role-select.page';
import { OnboardingService } from '../../../core/services/onboarding.service';

describe('RoleSelectPage (AC-15)', () => {
  let fixture: ComponentFixture<RoleSelectPage>;
  let component: RoleSelectPage;
  let router: { navigate: ReturnType<typeof vi.fn> };
  let onboarding: { skip: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    router = { navigate: vi.fn() };
    onboarding = { skip: vi.fn().mockResolvedValue({ ok: true }) };

    await TestBed.configureTestingModule({
      imports: [RoleSelectPage],
      providers: [
        { provide: Router, useValue: router },
        { provide: OnboardingService, useValue: onboarding },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: {
                get: (k: string) => (k === 'returnUrl' ? '/cart' : null),
              },
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RoleSelectPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('navigates to /onboarding/interests when buyer card is selected', () => {
    component.onSelectBuyer();
    expect(router.navigate).toHaveBeenCalledWith(['/onboarding/interests'], {
      queryParams: { returnUrl: '/cart' },
    });
  });

  it('calls skip() and navigates to /become-seller when seller card is selected', async () => {
    await component.onSelectSeller();
    expect(onboarding.skip).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/become-seller']);
  });
});

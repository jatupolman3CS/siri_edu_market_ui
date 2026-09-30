import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BecomeSellerPage } from './become-seller.page';
import { AuthService } from '../../../core/services';
import {
  SellerApplicationService,
  type SellerAccessStatus,
} from '../../../core/services/seller-application.service';

/**
 * responsive-ui v1.4 R-17 (F88): `/become-seller` used to read a failed application lookup as
 * "never applied" and show a fresh form (an existing applicant could resubmit) with no retry. A
 * failure now hides the form behind an error with a retry that re-issues the same GET.
 */
function buildApplications(statuses: SellerAccessStatus[]) {
  const mine = signal<{ status: string; studioName: string; bio: string; specialties: string[] } | null>(null);
  const loading = signal(false);
  let call = 0;
  return {
    mine: mine.asReadonly(),
    loading: loading.asReadonly(),
    resolveAccessStatus: vi.fn(async () => statuses[Math.min(call++, statuses.length - 1)]),
    submit: vi.fn(async () => ({ ok: true })),
    setMine: (v: { status: string; studioName: string; bio: string; specialties: string[] } | null) => mine.set(v),
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
}

function render(applications: ReturnType<typeof buildApplications>) {
  TestBed.configureTestingModule({
    imports: [BecomeSellerPage],
    providers: [
      provideRouter([]),
      { provide: SellerApplicationService, useValue: applications },
      { provide: AuthService, useValue: { isSeller: () => false, isAdmin: () => false } },
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(BecomeSellerPage);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('BecomeSellerPage — data states (F88)', () => {
  it('a failed lookup hides the form and shows an error with a retry that re-issues the GET', async () => {
    const applications = buildApplications(['unavailable', 'none']);
    const fixture = render(applications);
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="become-seller-error"]')).not.toBeNull();
    expect(el.querySelector('form')).toBeNull();
    expect(applications.resolveAccessStatus).toHaveBeenCalledWith({ force: true });

    (el.querySelector('[data-testid="become-seller-retry"]') as HTMLButtonElement).click();
    await settle();
    fixture.detectChanges();

    expect(applications.resolveAccessStatus).toHaveBeenCalledTimes(2);
    expect(el.querySelector('[data-testid="become-seller-error"]')).toBeNull();
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('"never applied" shows the application form', async () => {
    const fixture = render(buildApplications(['none']));
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[data-testid="become-seller-error"]')).toBeNull();
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('prefills the form from an existing (rejected) application', async () => {
    const applications = buildApplications(['rejected']);
    applications.setMine({ status: 'rejected', studioName: 'ครูเอ', bio: 'สอนคณิต', specialties: ['คณิต', 'ฟิสิกส์'] });
    const fixture = render(applications);
    await settle();
    fixture.detectChanges();

    expect(fixture.componentInstance.studioName()).toBe('ครูเอ');
    expect(fixture.componentInstance.specialtiesText()).toBe('คณิต, ฟิสิกส์');
  });
});

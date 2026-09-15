import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AffiliateService } from './affiliate.service';
import type { AffiliateSummary } from '../models';

describe('AffiliateService', () => {
  let service: AffiliateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AffiliateService],
    });
    service = TestBed.inject(AffiliateService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('initializes with null summary and idle state', () => {
    expect(service.summary()).toBeNull();
    expect(service.state().status).toBe('idle');
  });

  it('refreshSummary completes with null when stubbed', async () => {
    await service.refreshSummary();
    expect(service.summary()).toBeNull();
    expect(service.state().status).toBe('idle');
  });

  it('setSummaryForTest updates summary signal', () => {
    const mockSummary: AffiliateSummary = {
      code: 'MYAFF99',
      shareUrl: 'http://localhost:4200/marketplace?aff=MYAFF99',
      commissionRatePercent: 10,
      isActive: true,
      totalClicks: 25,
      totalConversions: 5,
      commissionEarnedTotal: 500,
    };

    service.setSummaryForTest(mockSummary);
    expect(service.summary()).toEqual(mockSummary);
  });
});

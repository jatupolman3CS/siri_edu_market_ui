import { TestBed } from '@angular/core/testing';
import { ReferralService } from './referral.service';

describe('ReferralService', () => {
  let service: ReferralService;
  let realFetch: typeof globalThis.fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify(null), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof globalThis.fetch;

    TestBed.configureTestingModule({
      providers: [ReferralService],
    });
    service = TestBed.inject(ReferralService);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  it('initializes with null summary and idle state', () => {
    expect(service.summary()).toBeNull();
    expect(service.state().status).toBe('idle');
  });

  it('refreshSummary completes with null when API returns null', async () => {
    await service.refreshSummary();
    expect(service.summary()).toBeNull();
    expect(service.state().status).toBe('idle');
  });

  it('validateCode with empty string returns prompt error without calling API', async () => {
    const res = await service.validateCode('');
    expect(res.valid).toBe(false);
    expect(res.reasonText).toBe('กรุณากรอกโค้ดแนะนำเพื่อน');

    const resSpaces = await service.validateCode('   ');
    expect(resSpaces.valid).toBe(false);
    expect(resSpaces.reasonText).toBe('กรุณากรอกโค้ดแนะนำเพื่อน');
  });

  it('validateCode with code returns valid: false stub', async () => {
    const res = await service.validateCode('ABCDEFGH');
    expect(res.valid).toBe(false);
  });

  it('setSummaryForTest updates summary signal', () => {
    service.setSummaryForTest({
      code: 'TEST1234',
      shareUrl: 'http://localhost:4200/marketplace?ref=TEST1234',
      totalReferred: 2,
      unusedCreditCount: 1,
      unusedCreditTotal: 20,
    });

    expect(service.summary()).toEqual({
      code: 'TEST1234',
      shareUrl: 'http://localhost:4200/marketplace?ref=TEST1234',
      totalReferred: 2,
      unusedCreditCount: 1,
      unusedCreditTotal: 20,
    });
  });
});

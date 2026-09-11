import { TestBed } from '@angular/core/testing';
import { OnboardingService } from './onboarding.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { client } from '../api/client.gen';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let apiFail: { report: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiFail = { report: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        OnboardingService,
        { provide: ApiFailureReporter, useValue: apiFail },
      ],
    });
    service = TestBed.inject(OnboardingService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getStatus returns completed status and categories', async () => {
    vi.spyOn(client as any, 'get').mockResolvedValue({
      data: { isCompleted: true, interestCategoryIds: ['cat-1', 'cat-2'] },
    });

    const status = await service.getStatus();
    expect(status.isCompleted).toBe(true);
    expect(status.interestCategoryIds).toEqual(['cat-1', 'cat-2']);
  });

  it('getStatus reports error and returns false/empty on failure', async () => {
    vi.spyOn(client as any, 'get').mockRejectedValue(new Error('Network error'));

    const status = await service.getStatus();
    expect(apiFail.report).toHaveBeenCalledWith('ดึงข้อมูล Onboarding', expect.any(Error));
    expect(status.isCompleted).toBe(false);
    expect(status.interestCategoryIds).toEqual([]);
  });

  it('updateInterests sends categoryIds and returns ok: true', async () => {
    const putSpy = vi.spyOn(client as any, 'put').mockResolvedValue({
      data: { isCompleted: true, interestCategoryIds: ['cat-1'] },
    });

    const res = await service.updateInterests(['cat-1']);
    expect(putSpy).toHaveBeenCalledWith({
      url: '/api/me/onboarding/interests',
      body: { categoryIds: ['cat-1'] },
    });
    expect(res.ok).toBe(true);
  });

  it('updateInterests returns error when request fails', async () => {
    vi.spyOn(client as any, 'put').mockRejectedValue(new Error('Bad Request'));

    const res = await service.updateInterests(['invalid-cat']);
    expect(apiFail.report).toHaveBeenCalledWith('บันทึกหมวดหมู่ที่สนใจ', expect.any(Error));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Bad Request');
  });

  it('skip sends skip request and returns ok: true', async () => {
    const postSpy = vi.spyOn(client as any, 'post').mockResolvedValue({
      data: { isCompleted: true, interestCategoryIds: [] },
    });

    const res = await service.skip();
    expect(postSpy).toHaveBeenCalledWith({
      url: '/api/me/onboarding/skip',
    });
    expect(res.ok).toBe(true);
  });

  it('skip returns error when request fails', async () => {
    vi.spyOn(client as any, 'post').mockRejectedValue(new Error('Unauthorized'));

    const res = await service.skip();
    expect(apiFail.report).toHaveBeenCalledWith('ข้าม Onboarding', expect.any(Error));
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Unauthorized');
  });
});

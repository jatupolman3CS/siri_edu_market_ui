import { TestBed } from '@angular/core/testing';
import { FollowService } from './follow.service';
import { ApiFailureReporter } from './api-failure-reporter.service';

describe('FollowService', () => {
  let service: FollowService;
  let apiFailSpy: { report: ReturnType<typeof vi.fn> };
  let realFetch: typeof globalThis.fetch;
  let requests: { method: string; path: string }[];
  let responses: Map<string, { status: number; body?: unknown }>;

  function jsonResponse(body: unknown, status = 200): Response {
    if (status === 204) return new Response(null, { status });
    return new Response(JSON.stringify(body ?? {}), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  beforeEach(() => {
    requests = [];
    responses = new Map();
    realFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      const path = url.pathname;

      requests.push({ method: request.method, path });

      const stub = responses.get(`${request.method} ${path}`);
      if (!stub) {
        return jsonResponse({ title: 'Not Found', status: 404, statusCode: 404 }, 404);
      }

      return jsonResponse(stub.body, stub.status);
    }) as typeof globalThis.fetch;

    apiFailSpy = { report: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        FollowService,
        { provide: ApiFailureReporter, useValue: apiFailSpy },
      ],
    });

    service = TestBed.inject(FollowService);
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    TestBed.resetTestingModule();
  });

  it('should be initialized with empty following set', () => {
    expect(service.isFollowing('seller-1')).toBe(false);
    expect(service.count()).toBe(0);
  });

  it('should set following status synchronously via setFollowing', () => {
    service.setFollowing('seller-1', true);
    expect(service.isFollowing('seller-1')).toBe(true);
    expect(service.count()).toBe(1);

    service.setFollowing('seller-1', false);
    expect(service.isFollowing('seller-1')).toBe(false);
    expect(service.count()).toBe(0);
  });

  it('should toggle from unfollowed to followed successfully', async () => {
    responses.set('POST /api/sellers/seller-1/follow', { status: 200, body: {} });

    const result = await service.toggle('seller-1');

    expect(result).toBe(true);
    expect(service.isFollowing('seller-1')).toBe(true);
    expect(requests).toEqual([{ method: 'POST', path: '/api/sellers/seller-1/follow' }]);
  });

  it('should rollback state when follow toggle fails', async () => {
    responses.set('POST /api/sellers/seller-1/follow', {
      status: 500,
      body: { title: 'Server error', status: 500, statusCode: 500 },
    });

    const result = await service.toggle('seller-1');

    expect(result).toBe(false);
    expect(service.isFollowing('seller-1')).toBe(false);
    expect(apiFailSpy.report).toHaveBeenCalledWith('ติดตามร้าน', expect.anything());
  });

  it('should toggle from followed to unfollowed successfully', async () => {
    service.setFollowing('seller-1', true);
    responses.set('DELETE /api/sellers/seller-1/follow', { status: 204 });

    const result = await service.toggle('seller-1');

    expect(result).toBe(false);
    expect(service.isFollowing('seller-1')).toBe(false);
    expect(requests).toEqual([{ method: 'DELETE', path: '/api/sellers/seller-1/follow' }]);
  });

  it('should rollback state when unfollow toggle fails', async () => {
    service.setFollowing('seller-1', true);
    responses.set('DELETE /api/sellers/seller-1/follow', {
      status: 500,
      body: { title: 'Server error', status: 500, statusCode: 500 },
    });

    const result = await service.toggle('seller-1');

    expect(result).toBe(true);
    expect(service.isFollowing('seller-1')).toBe(true);
    expect(apiFailSpy.report).toHaveBeenCalledWith('เลิกติดตามร้าน', expect.anything());
  });

  it('should hydrate follow status from API when seller is followed', async () => {
    responses.set('GET /api/sellers/seller-1/follow', {
      status: 200,
      body: { isFollowing: true },
    });

    await service.hydrateFromApi('seller-1');

    expect(service.isFollowing('seller-1')).toBe(true);
    expect(requests).toEqual([{ method: 'GET', path: '/api/sellers/seller-1/follow' }]);
  });

  it('should hydrate follow status from API when seller is not followed', async () => {
    service.setFollowing('seller-1', true);
    responses.set('GET /api/sellers/seller-1/follow', {
      status: 200,
      body: { isFollowing: false },
    });

    await service.hydrateFromApi('seller-1');

    expect(service.isFollowing('seller-1')).toBe(false);
  });

  it('should ignore 401 when hydrating follow status for anonymous visitor', async () => {
    responses.set('GET /api/sellers/seller-1/follow', {
      status: 401,
      body: { title: 'Unauthorized', status: 401, statusCode: 401 },
    });

    await service.hydrateFromApi('seller-1');

    expect(service.isFollowing('seller-1')).toBe(false);
    expect(apiFailSpy.report).not.toHaveBeenCalled();
  });
});

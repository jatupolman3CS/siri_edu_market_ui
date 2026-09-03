import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MeService } from './me.service';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { AuthService } from './auth.service';

/**
 * QA fix (stale header identity): `auth.user()` used to be frozen at whatever the login
 * response or a restored `localStorage` session said, and nothing ever reconciled it against
 * the live, authoritative `GET /api/me/profile` result — so a session left over from an earlier
 * login in the same browser could keep the header showing the wrong account indefinitely, even
 * though every real API call already resolved correctly server-side from the JWT.
 *
 * `MeService.loadProfile()`/`updateProfile()` now call `AuthService.syncUserFromProfile()` on
 * every response, so the header self-heals to the actually-authenticated account.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function render(): { meService: MeService; syncUserFromProfile: ReturnType<typeof vi.fn> } {
  const syncUserFromProfile = vi.fn();

  TestBed.configureTestingModule({
    providers: [
      MeService,
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: AuthService, useValue: { syncUserFromProfile } },
    ],
  });

  return { meService: TestBed.inject(MeService), syncUserFromProfile };
}

beforeEach(() => {
  routes = new Map();
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname;
    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('MeService reconciles AuthService session identity', () => {
  it('loadProfile() syncs the live profile into AuthService', async () => {
    const profile = { id: 'u-1', name: 'Admin จริง', email: 'admin@siriedumarket.local', role: 'Admin' };
    stubRoute('GET', '/api/me/profile', profile);
    const { meService, syncUserFromProfile } = render();

    const result = await firstValueFrom(meService.loadProfile());

    expect(result.name).toBe('Admin จริง');
    expect(syncUserFromProfile).toHaveBeenCalledTimes(1);
    expect(syncUserFromProfile).toHaveBeenCalledWith(profile);
  });

  it('updateProfile() also syncs the saved profile into AuthService', async () => {
    const saved = { id: 'u-1', name: 'ชื่อใหม่', email: 'admin@siriedumarket.local', role: 'Admin' };
    stubRoute('PUT', '/api/me/profile', saved);
    const { meService, syncUserFromProfile } = render();

    await firstValueFrom(meService.updateProfile({ name: 'ชื่อใหม่' }));

    expect(syncUserFromProfile).toHaveBeenCalledWith(saved);
  });

  it('does not sync on a failed load', async () => {
    stubRoute('GET', '/api/me/profile', { title: 'nope', status: 500, statusCode: 500 }, 500);
    const { meService, syncUserFromProfile } = render();

    await expect(firstValueFrom(meService.loadProfile())).rejects.toBeTruthy();
    expect(syncUserFromProfile).not.toHaveBeenCalled();
  });
});

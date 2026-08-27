import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AccountPage } from './account.page';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';

/**
 * F-07 (N-03): buyers had no account page at all — `PUT /api/me/profile` was reachable only
 * from /seller/settings, behind the seller guard.
 *
 * These drive the real page through a stubbed fetch, so they exercise the shared
 * ProfileEditorComponent and NotificationSettingsComponent the same way the browser does:
 * existing values load, a save issues the write, and a failed save is not swallowed.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let requests: { method: string; path: string; body: string }[];
let reported: unknown[];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

const profile = {
  id: 'user-1',
  name: 'ครูเอ',
  email: 'a@example.com',
  avatarUrl: 'uploads/avatar.png',
  role: 'Buyer',
};

function stubProfileAndSettings(): void {
  stubRoute('GET', '/api/me/profile', profile);
  stubRoute('GET', '/api/notifications/settings', [
    { key: 'sale', label: 'มีคนซื้อเอกสาร', isEnabled: true },
    { key: 'review', label: 'มีรีวิวใหม่', isEnabled: false },
  ]);
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderPage() {
  TestBed.configureTestingModule({
    imports: [AccountPage],
    providers: [
      provideRouter([]),
      { provide: ApiFailureReporter, useValue: { report: (...args: unknown[]) => reported.push(args) } },
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(AccountPage);
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  reported = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname.replace('/SIRIEDUMARKET.Api', '');
    requests.push({ method: request.method, path, body: await request.clone().text() });

    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse({ title: 'no stub', status: 404, statusCode: 404 }, 404);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AccountPage', () => {
  it('loads the existing profile and notification settings', async () => {
    stubProfileAndSettings();
    const fixture = renderPage();
    await settle();
    fixture.detectChanges();

    expect(requests.some((r) => r.method === 'GET' && r.path === '/api/me/profile')).toBe(true);
    expect(
      requests.some((r) => r.method === 'GET' && r.path === '/api/notifications/settings'),
    ).toBe(true);

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="displayName"]',
    );
    expect(nameInput.value).toBe('ครูเอ');
  });

  it('saves the profile through PUT /api/me/profile', async () => {
    stubProfileAndSettings();
    stubRoute('PUT', '/api/me/profile', { ...profile, name: 'ครูบี' });
    const fixture = renderPage();
    await settle();
    fixture.detectChanges();

    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="displayName"]',
    );
    nameInput.value = 'ครูบี';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button.btn-pink').click();
    await settle();

    const put = requests.find((r) => r.method === 'PUT' && r.path === '/api/me/profile');
    expect(put).toBeDefined();
    expect(JSON.parse(put!.body).name).toBe('ครูบี');
  });

  it('does not swallow a failed save', async () => {
    stubProfileAndSettings();
    stubRoute('PUT', '/api/me/profile', { title: 'nope', status: 500, statusCode: 500 }, 500);
    const fixture = renderPage();
    await settle();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('button.btn-pink').click();
    await settle();
    fixture.detectChanges();

    // Reported to the user rather than discarded, and the button is usable again so the save
    // can be retried instead of leaving the page stuck on "saving".
    expect(reported.length).toBeGreaterThan(0);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.btn-pink');
    expect(button.disabled).toBe(false);
  });

  it('sends every notification key on a toggle, not only the changed one', async () => {
    // PUT /api/notifications/settings replaces the whole set, so sending just the toggled key
    // would silently reset the others.
    stubProfileAndSettings();
    stubRoute('PUT', '/api/notifications/settings', []);
    const fixture = renderPage();
    await settle();
    fixture.detectChanges();

    const checkbox: HTMLInputElement = fixture.nativeElement.querySelector(
      'app-notification-settings input[type="checkbox"]',
    );
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await settle();

    const put = requests.find(
      (r) => r.method === 'PUT' && r.path === '/api/notifications/settings',
    );
    expect(put).toBeDefined();
    expect(JSON.parse(put!.body).settings).toEqual({ sale: false, review: false });
  });

  it('links to the library, orders and wishlist', async () => {
    stubProfileAndSettings();
    const fixture = renderPage();
    await settle();
    fixture.detectChanges();

    const hrefs = Array.from(
      fixture.nativeElement.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href'));

    expect(hrefs).toContain('/library');
    expect(hrefs).toContain('/orders');
    expect(hrefs).toContain('/wishlist');
  });
});

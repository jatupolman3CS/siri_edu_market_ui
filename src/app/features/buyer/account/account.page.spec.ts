import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AccountPage } from './account.page';
import { ACCOUNT_SECTION_ROUTES } from './account.routes';
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

async function renderAt(url: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'account', component: AccountPage, children: ACCOUNT_SECTION_ROUTES }]),
      { provide: ApiFailureReporter, useValue: { report: (...args: unknown[]) => reported.push(args) } },
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  await settle();
  harness.detectChanges();
  return { harness, root: harness.routeNativeElement as HTMLElement };
}

beforeEach(() => {
  routes = new Map();
  requests = [];
  reported = [];
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
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

it('opens every sidebar entry as its own page under the same shell', async () => {
  stubProfileAndSettings();
  stubRoute('GET', '/api/me/payment-methods', []);
  const { harness } = await renderAt('/account');
  const router = TestBed.inject(Router);
  expect(router.url).toBe('/account/profile');

  const shell = harness.routeDebugElement!.componentInstance as AccountPage;
  for (const item of shell.sectionNav) {
    const root = harness.routeNativeElement!;
    const link = root.querySelector(`nav a[href="/account/${item.path}"]`) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(event);
    // Each section is a lazy loadComponent — a fixed tick count races the dynamic import when
    // several spec files share the run, so wait for the navigation itself to land.
    await vi.waitFor(() => expect(router.url).toBe(`/account/${item.path}`), { timeout: 3000 });
    await settle();
    harness.detectChanges();
    expect(event.defaultPrevented).toBe(true);
    expect(router.url).toBe(`/account/${item.path}`);
    // One section per page: the chosen one is rendered, the others are not.
    expect(root.querySelector(`#${item.path}`)).toBeTruthy();
    const others = shell.sectionNav.filter((o) => o.path !== item.path);
    for (const other of others) expect(root.querySelector(`#${other.path}`)).toBeNull();
    expect(link.getAttribute('aria-current')).toBe('page');
    expect(harness.routeDebugElement?.componentInstance).toBe(shell);
  }
});

describe('AccountPage', () => {
  it('loads the existing profile on /account/profile', async () => {
    stubProfileAndSettings();
    const { root } = await renderAt('/account/profile');

    expect(requests.some((r) => r.method === 'GET' && r.path === '/api/me/profile')).toBe(true);

    const nameInput = root.querySelector<HTMLInputElement>('input[name="displayName"]')!;
    expect(nameInput.value).toBe('ครูเอ');
  });

  it('saves the profile through PUT /api/me/profile', async () => {
    stubProfileAndSettings();
    stubRoute('PUT', '/api/me/profile', { ...profile, name: 'ครูบี' });
    const { harness, root } = await renderAt('/account/profile');

    const nameInput = root.querySelector<HTMLInputElement>('input[name="displayName"]')!;
    nameInput.value = 'ครูบี';
    nameInput.dispatchEvent(new Event('input'));
    harness.detectChanges();

    root.querySelector<HTMLButtonElement>('button.btn-pink')!.click();
    await settle();

    const put = requests.find((r) => r.method === 'PUT' && r.path === '/api/me/profile');
    expect(put).toBeDefined();
    expect(JSON.parse(put!.body).name).toBe('ครูบี');
  });

  it('does not swallow a failed save', async () => {
    stubProfileAndSettings();
    stubRoute('PUT', '/api/me/profile', { title: 'nope', status: 500, statusCode: 500 }, 500);
    const { harness, root } = await renderAt('/account/profile');

    root.querySelector<HTMLButtonElement>('button.btn-pink')!.click();
    await settle();
    harness.detectChanges();

    // Reported to the user rather than discarded, and the button is usable again so the save
    // can be retried instead of leaving the page stuck on "saving".
    expect(reported.length).toBeGreaterThan(0);
    const button = root.querySelector<HTMLButtonElement>('button.btn-pink')!;
    expect(button.disabled).toBe(false);
  });

  it('sends every notification key on a toggle, not only the changed one', async () => {
    // PUT /api/notifications/settings replaces the whole set, so sending just the toggled key
    // would silently reset the others.
    stubProfileAndSettings();
    stubRoute('PUT', '/api/notifications/settings', []);
    const { harness, root } = await renderAt('/account/notifications');

    const switchButton = root.querySelector<HTMLButtonElement>('app-notification-settings button.ant-switch')!;
    switchButton.click();
    await settle();

    const put = requests.find(
      (r) => r.method === 'PUT' && r.path === '/api/notifications/settings',
    );
    expect(put).toBeDefined();
    expect(JSON.parse(put!.body).settings).toEqual({ sale: false, review: false });
  });

  it('the sidebar links to membership, privacy and feedback; /account/shortcuts is gone', async () => {
    stubProfileAndSettings();
    const { root } = await renderAt('/account/shortcuts');
    expect(TestBed.inject(Router).url).toBe('/account/profile');

    const hrefs = Array.from(
      root.querySelectorAll('nav a[href]') as NodeListOf<HTMLAnchorElement>,
    ).map((a) => a.getAttribute('href'));

    expect(hrefs).toContain('/account/subscription');
    expect(hrefs).toContain('/account/privacy');
    expect(hrefs).toContain('/account/feedback');
    expect(hrefs).not.toContain('/account/shortcuts');
  });
});

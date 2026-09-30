import { Page, expect, type APIRequestContext } from '@playwright/test';
import { accountFor, missingCredentialsMessage, type E2eRole } from './auth-accounts';

export const API_BASE = 'http://localhost:5282';

export interface PageIssue {
  kind: 'console' | 'network' | 'content';
  detail: string;
}

/**
 * Attaches console/network listeners for the current page load. Call before navigating,
 * read `.issues` after — used to build the bug list instead of failing fast on the first
 * problem, so one page visit surfaces everything wrong with it.
 */
export function watchPage(page: Page) {
  const issues: PageIssue[] = [];

  page.on('console', (msg) => {
    // Chromium auto-logs every non-2xx response as a generic "Failed to load resource"
    // console error — that's expected noise for e.g. a 401 on a bad-password attempt or a
    // 404 for "no application yet". Real server errors are already caught via the
    // 'response' listener below (>=500); this only needs to catch genuine JS errors.
    if (msg.type() === 'error' && !/^Failed to load resource:/.test(msg.text())) {
      issues.push({ kind: 'console', detail: msg.text() });
    }
  });

  page.on('pageerror', (err) => {
    issues.push({ kind: 'console', detail: `uncaught exception: ${err.message}` });
  });

  page.on('response', (res) => {
    if (res.status() >= 500) {
      issues.push({ kind: 'network', detail: `${res.status()} ${res.request().method()} ${res.url()}` });
    }
  });

  return issues;
}

/** Generic "did this page actually render something real" check, used for every route. */
export async function assertPageHealthy(page: Page, issues: PageIssue[], routeLabel: string) {
  // Not 'networkidle': the Vite dev server keeps an HMR WebSocket open forever, so
  // networkidle never fires and every page would falsely "time out".
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {
    issues.push({ kind: 'content', detail: 'page load event never fired within 15s' });
  });
  // Give the Angular app a beat to render after the shell loads (signals/zoneless change
  // detection + the initial API calls that fill the page).
  await page.waitForTimeout(1200);

  const bodyText = await page.locator('body').innerText().catch(() => '');
  if (bodyText.trim().length < 20) {
    issues.push({ kind: 'content', detail: `page looks blank (only ${bodyText.trim().length} chars of text)` });
  }
  if (/\[object Object\]/.test(bodyText)) {
    issues.push({ kind: 'content', detail: 'literal "[object Object]" leaked into rendered text' });
  }
  if (/<br(?!\s*\/?>\s*$)/i.test(bodyText) || /<br>/.test(bodyText)) {
    // body.innerText never contains real markup, so any "<br" surviving here is unescaped tag text.
    issues.push({ kind: 'content', detail: 'literal "<br>" tag leaked into rendered text (unescaped HTML in interpolated string)' });
  }
  if (/undefined/.test(bodyText) && !/undefined/i.test(routeLabel)) {
    issues.push({ kind: 'content', detail: 'literal "undefined" text visible on page' });
  }
  if (/NaN/.test(bodyText)) {
    issues.push({ kind: 'content', detail: 'literal "NaN" text visible on page' });
  }

  return bodyText;
}

/** Fails the test with every issue collected for this page, formatted for the final bug list. */
export function reportIssues(routeLabel: string, issues: PageIssue[]) {
  if (issues.length === 0) return;
  const formatted = issues.map((i) => `  [${i.kind}] ${i.detail}`).join('\n');
  expect.soft(issues, `${routeLabel} has ${issues.length} issue(s):\n${formatted}`).toEqual([]);
}

export async function apiGet(page: Page, path: string) {
  const res = await page.request.get(`${API_BASE}${path}`);
  return res;
}

/**
 * The `request` fixture only carries cookies from storageState, not the JWT this app keeps in
 * localStorage — so authenticated API discovery calls (e.g. "find me a real order id to visit")
 * need their own bearer token via a real login call.
 */
export async function fetchBearerToken(
  request: APIRequestContext,
  role: E2eRole,
) {
  // Credentials come from E2E_<ROLE>_EMAIL / E2E_<ROLE>_PASSWORD (e2e/auth-accounts.ts).
  const account = accountFor(role);
  if (!account) throw new Error(missingCredentialsMessage(role));
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { email: account.email, password: account.password },
  });
  const body = await res.json();
  return body.accessToken as string;
}

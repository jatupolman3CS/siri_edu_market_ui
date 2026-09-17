import { Injectable, inject } from '@angular/core';
import { OauthClientsService } from './oauth-clients.service';

/** sessionStorage key holding the one pending LINE authorization request (§4.1). */
const LINE_OAUTH_STORAGE_KEY = 'siriedu_line_oauth';
/** §4.1: a pending request is single-use and expires after 10 minutes. */
const STATE_TTL_MS = 10 * 60 * 1000;
const AUTHORIZE_ENDPOINT = 'https://access.line.me/oauth2/v2.1/authorize';
/** §4.2 — Angular route, *not* an API endpoint. Must also be registered in the LINE console. */
const CALLBACK_PATH = '/auth/line/callback';
const SCOPE = 'openid profile email';

/**
 * What we handed to LINE when the redirect started, kept so the callback can verify the round
 * trip and replay the exact same `redirect_uri` during the token exchange.
 */
export interface LineOauthStateRecord {
  /** Random anti-CSRF value echoed back by LINE as the `state` query parameter. */
  state: string;
  /** Where the user wanted to go before being sent to LINE. */
  returnUrl: string;
  /** §4.2: LINE compares this byte-for-byte between authorize and token exchange. */
  redirectUri: string;
  /** Epoch milliseconds — used for the 10-minute expiry. */
  createdAt: number;
  /** Optional email provided by user for account linking when LINE does not provide email. */
  email?: string;
}

/**
 * external-login-and-mail-config v1 §4.1/§4.2 — the browser half of "เข้าสู่ระบบด้วย LINE".
 *
 * Unlike Google (GIS popup + authorization code handed straight back to JS), LINE Login is a
 * full-page redirect: this service starts it, and `features/auth/line-callback` finishes it.
 * The channel id always comes from {@link OauthClientsService} (i.e. from the server) — an empty
 * one means the server cannot complete the exchange, so no redirect is started at all.
 */
@Injectable({ providedIn: 'root' })
export class LineOauthService {
  private readonly oauthClients = inject(OauthClientsService);

  /** Absolute `redirect_uri` for this deployment — SPA origin + the callback route. */
  resolveRedirectUri(): string {
    if (typeof window === 'undefined') return '';
    const origin = window.location?.origin ?? '';
    return origin ? `${origin}${CALLBACK_PATH}` : '';
  }

  /**
   * §4.2. Built by hand rather than with `URLSearchParams` because the latter encodes spaces as
   * `+`, and the contract pins the scope separator to `%20`.
   */
  buildAuthorizeUrl(channelId: string, state: string, redirectUri: string): string {
    const query = [
      'response_type=code',
      `client_id=${encodeURIComponent(channelId)}`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `state=${encodeURIComponent(state)}`,
      `scope=${encodeURIComponent(SCOPE)}`,
    ].join('&');
    return `${AUTHORIZE_ENDPOINT}?${query}`;
  }

  /**
   * Stores a fresh pending request and navigates to LINE's consent page.
   * Returns `false` (without navigating) when LINE is unavailable on this server or there is no
   * browser origin to come back to.
   */
  startSignIn(returnUrl: string, email?: string): boolean {
    const channelId = this.oauthClients.lineLoginChannelId();
    if (!channelId) return false;

    const redirectUri = this.resolveRedirectUri();
    if (!redirectUri) return false;

    const state = this.createState();
    this.writeState({
      state,
      returnUrl: returnUrl || '/',
      redirectUri,
      createdAt: Date.now(),
      ...(email ? { email: email.trim() } : {}),
    });
    this.redirectTo(this.buildAuthorizeUrl(channelId, state, redirectUri));
    return true;
  }

  /**
   * Reads back the pending request for `state` and drops it — the record is single-use whatever
   * the outcome, so a replayed callback URL cannot start a second exchange. Returns `null` when
   * there is no record, the state does not match, or the record is older than 10 minutes.
   */
  consumeState(state: string): LineOauthStateRecord | null {
    const record = this.readState();
    this.clearState();
    if (!record || !state) return null;
    if (record.state !== state) return null;
    if (!Number.isFinite(record.createdAt)) return null;
    if (Date.now() - record.createdAt > STATE_TTL_MS) return null;
    return record;
  }

  /**
   * Thin wrapper around a full-page navigation, kept off `window` in callers so specs can
   * substitute a spy instead of triggering a real navigation in jsdom (same reason as
   * `LineNotificationService.redirectToLine`).
   */
  redirectTo(url: string): void {
    window.location.assign(url);
  }

  private createState(): string {
    const webCrypto = globalThis.crypto;
    if (webCrypto && typeof webCrypto.randomUUID === 'function') {
      return webCrypto.randomUUID();
    }
    // Non-secure contexts (plain http on a LAN address) have no `randomUUID`; the value only has
    // to be unguessable enough to bind one callback to one browser tab.
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  private writeState(record: LineOauthStateRecord): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(LINE_OAUTH_STORAGE_KEY, JSON.stringify(record));
    } catch {
      /* private mode / quota — the callback will report an invalid request, which is accurate */
    }
  }

  private readState(): LineOauthStateRecord | null {
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(LINE_OAUTH_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<LineOauthStateRecord>;
      if (
        typeof parsed?.state !== 'string' ||
        typeof parsed.redirectUri !== 'string' ||
        typeof parsed.createdAt !== 'number'
      ) {
        return null;
      }
      return {
        state: parsed.state,
        returnUrl: typeof parsed.returnUrl === 'string' ? parsed.returnUrl : '/',
        redirectUri: parsed.redirectUri,
        createdAt: parsed.createdAt,
        email: typeof parsed.email === 'string' ? parsed.email : undefined,
      };
    } catch {
      return null;
    }
  }

  private clearState(): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.removeItem(LINE_OAUTH_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}

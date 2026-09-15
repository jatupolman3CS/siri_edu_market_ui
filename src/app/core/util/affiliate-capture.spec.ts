import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AFFILIATE_STORAGE_KEY,
  captureAffiliateClick,
  getAffiliateClickToken,
} from './affiliate-capture';
import type { AffiliateClickResult } from '../models';

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.clear !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

describe('affiliate-capture', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset window.location.search
    window.history.replaceState({}, '', '/marketplace');
  });

  describe('getAffiliateClickToken', () => {
    it('returns null when storage is empty', () => {
      expect(getAffiliateClickToken()).toBeNull();
    });

    it('returns clickToken when item is valid and not expired', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      localStorage.setItem(
        AFFILIATE_STORAGE_KEY,
        JSON.stringify({
          code: 'AFF123',
          clickToken: 'tok-valid-1',
          expiresAt: future,
        }),
      );

      expect(getAffiliateClickToken()).toBe('tok-valid-1');
    });

    it('removes item and returns null when token is expired', () => {
      const past = new Date(Date.now() - 1000).toISOString();
      localStorage.setItem(
        AFFILIATE_STORAGE_KEY,
        JSON.stringify({
          code: 'AFF123',
          clickToken: 'tok-expired',
          expiresAt: past,
        }),
      );

      expect(getAffiliateClickToken()).toBeNull();
      expect(localStorage.getItem(AFFILIATE_STORAGE_KEY)).toBeNull();
    });

    it('removes item and returns null when data is malformed', () => {
      localStorage.setItem(AFFILIATE_STORAGE_KEY, 'invalid json');
      expect(getAffiliateClickToken()).toBeNull();

      localStorage.setItem(
        AFFILIATE_STORAGE_KEY,
        JSON.stringify({ code: 'AFF123' }),
      );
      expect(getAffiliateClickToken()).toBeNull();
      expect(localStorage.getItem(AFFILIATE_STORAGE_KEY)).toBeNull();
    });
  });

  describe('captureAffiliateClick', () => {
    it('does nothing when ?aff query param is absent', async () => {
      const clickApi = vi.fn();
      await captureAffiliateClick(clickApi);

      expect(clickApi).not.toHaveBeenCalled();
      expect(localStorage.getItem(AFFILIATE_STORAGE_KEY)).toBeNull();
    });

    it('does not call clickApi when a valid token already exists in localStorage', async () => {
      window.history.replaceState({}, '', '/marketplace?aff=AFF999');

      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      localStorage.setItem(
        AFFILIATE_STORAGE_KEY,
        JSON.stringify({
          code: 'AFF999',
          clickToken: 'existing-token',
          expiresAt: future,
        }),
      );

      const clickApi = vi.fn();
      await captureAffiliateClick(clickApi);

      expect(clickApi).not.toHaveBeenCalled();
      expect(getAffiliateClickToken()).toBe('existing-token');
    });

    it('calls clickApi and stores token when ?aff is present and no valid token exists', async () => {
      window.history.replaceState({}, '', '/marketplace?aff=NEWCODE');

      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const mockResult: AffiliateClickResult = {
        clickToken: 'tok-new-aff',
        expiresAt: future,
      };
      const clickApi = vi.fn().mockResolvedValue(mockResult);

      await captureAffiliateClick(clickApi);

      expect(clickApi).toHaveBeenCalledWith('NEWCODE');
      expect(getAffiliateClickToken()).toBe('tok-new-aff');

      const stored = JSON.parse(localStorage.getItem(AFFILIATE_STORAGE_KEY) || '{}');
      expect(stored.code).toBe('NEWCODE');
      expect(stored.clickToken).toBe('tok-new-aff');
    });

    it('does not write to storage if clickApi returns null', async () => {
      window.history.replaceState({}, '', '/marketplace?aff=FAILS');

      const clickApi = vi.fn().mockResolvedValue(null);
      await captureAffiliateClick(clickApi);

      expect(clickApi).toHaveBeenCalledWith('FAILS');
      expect(localStorage.getItem(AFFILIATE_STORAGE_KEY)).toBeNull();
    });
  });
});

import { Injectable, inject, signal } from '@angular/core';
import type { PlatformStats } from '../models';
import { mapPlatformStats } from '../api-mappers/mappers';
import { getApiMarketplaceStats } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from './action-state';

/**
 * real-data-stats v1 §4.1: single shared source for `GET /api/marketplace/stats` (§3.3) — every
 * page in §4.2–§4.7 reads `stats()` from this one service instead of calling the endpoint
 * itself, so a guest opening login/home doesn't trigger the request more than once.
 *
 * Round 2 (SDK wired): `loadStats()` calls the real `getApiMarketplaceStats()` and caches the
 * mapped result — a `_loaded` flag (not `stats() !== undefined`, since the backend can validly
 * report every count as `0`) makes repeat calls from other pages a no-op.
 */
@Injectable({ providedIn: 'root' })
export class PlatformStatsService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _stats = signal<PlatformStats | undefined>(undefined);
  private readonly _statsState = signal<ActionState>(idleActionState());
  private _loaded = false;

  readonly stats = this._stats.asReadonly();
  readonly statsState = this._statsState.asReadonly();

  /** No-op if already loaded (cache lives in this service, not tied to any route). */
  loadStats(): void {
    if (this._loaded) return;
    if (this._statsState().status === 'loading') return;
    void (async () => {
      this._statsState.set(loadingActionState());
      try {
        const result = await getApiMarketplaceStats();
        const data = unwrapSdkResult(result);
        this._stats.set(mapPlatformStats(data));
        this._loaded = true;
        this._statsState.set(idleActionState());
      } catch (e) {
        this.apiFail.report('errors.context.loadPlatformStats', e);
        this._statsState.set(errorActionState('โหลดสถิติแพลตฟอร์มไม่สำเร็จ'));
      }
    })();
  }
}

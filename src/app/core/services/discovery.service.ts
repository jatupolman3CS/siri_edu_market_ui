import { Injectable, inject, signal } from '@angular/core';
import type { DiscoveryBlock, PopularSearchTerm } from '../models';
import { ApiFailureReporter } from './api-failure-reporter.service';
import { idleActionState, loadingActionState, type ActionState } from './action-state';

/** §4.2 "caching ฝั่ง client": เรียกซ้ำไม่เกิน 1 ครั้งต่อ 5 นาที (เหมือน `PlatformStatsService`). */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1/§3.2/§4.2 — popular search
 * terms (ข้อ 13) + the "ยังไม่ได้ค้นหาอะไรเลย" discovery block (ข้อ 14). The 3rd piece of the
 * contract (ข้อ 16 — the `/recommended` relevance gate) stays inside `CatalogService`, which
 * already owns that existing endpoint (§3.3) — this service only ever adds the 2 brand-new ones.
 *
 * Round 1: `loadPopularTerms()`/`loadDiscovery()` throw `TODO(contract)` — `GET
 * /api/marketplace/popular-searches` and `GET /api/marketplace/discovery` don't exist in the
 * generated SDK yet. Both catch internally and fall back to an empty/idle state (§4.2 "error ทุก
 * เส้น → ApiFailureReporter + ตั้ง state เป็นค่าว่าง — pattern เดิมทุก service"), so callers never
 * need their own try/catch and every consuming page/component degrades gracefully (AC-26).
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _popularTerms = signal<PopularSearchTerm[]>([]);
  private readonly _popularPersonalized = signal(false);
  private readonly _popularTermsState = signal<ActionState>(idleActionState());

  private readonly _discovery = signal<DiscoveryBlock | null>(null);
  private readonly _discoveryState = signal<ActionState>(idleActionState());

  readonly popularTerms = this._popularTerms.asReadonly();
  readonly popularPersonalized = this._popularPersonalized.asReadonly();
  readonly popularTermsState = this._popularTermsState.asReadonly();
  readonly discovery = this._discovery.asReadonly();
  readonly discoveryState = this._discoveryState.asReadonly();

  private _popularTermsLastLoadedAt = 0;
  private _discoveryLastLoadedAt = 0;

  /** §3.1 `GET /api/marketplace/popular-searches` — home page "ฮิตตอนนี้:" chips (ข้อ 13). */
  async loadPopularTerms(take = 8): Promise<void> {
    if (this.isFresh(this._popularTermsLastLoadedAt) && this._popularTermsState().status !== 'error') return;
    if (this._popularTermsState().status === 'loading') return;
    this._popularTermsState.set(loadingActionState());
    try {
      // TODO(contract): awaiting SDK regen — GET /api/marketplace/popular-searches (§3.1)
      // request query: { take: clamp(take, 1, 20) }
      throw new Error('TODO(contract): awaiting SDK regen');
    } catch (e) {
      this._popularTerms.set([]);
      this._popularPersonalized.set(false);
      this._popularTermsState.set(idleActionState());
      this.apiFail.report('โหลดคำค้นยอดนิยม', e);
    } finally {
      this._popularTermsLastLoadedAt = Date.now();
    }
  }

  /** §3.2 `GET /api/marketplace/discovery` — `/marketplace`'s "ยังไม่ได้ค้นหาอะไรเลย" block (ข้อ 14). */
  async loadDiscovery(): Promise<void> {
    if (this.isFresh(this._discoveryLastLoadedAt) && this._discoveryState().status !== 'error') return;
    if (this._discoveryState().status === 'loading') return;
    this._discoveryState.set(loadingActionState());
    try {
      // TODO(contract): awaiting SDK regen — GET /api/marketplace/discovery (§3.2)
      throw new Error('TODO(contract): awaiting SDK regen');
    } catch (e) {
      this._discovery.set(null);
      this._discoveryState.set(idleActionState());
      this.apiFail.report('โหลดคำแนะนำสำหรับหน้าที่ยังไม่ได้ค้นหา', e);
    } finally {
      this._discoveryLastLoadedAt = Date.now();
    }
  }

  private isFresh(lastLoadedAt: number): boolean {
    return lastLoadedAt > 0 && Date.now() - lastLoadedAt < CACHE_TTL_MS;
  }
}

import { Injectable, inject, signal } from '@angular/core';
import {
  deleteApiSellersBySellerIdFollow,
  getApiSellersBySellerIdFollow,
  postApiSellersBySellerIdFollow,
} from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';

@Injectable({ providedIn: 'root' })
export class FollowService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _following = signal<Set<string>>(new Set());

  readonly following = this._following.asReadonly();

  isFollowing(sellerId: string): boolean {
    return this._following().has(sellerId);
  }

  toggle(sellerId: string): boolean {
    const wasFollowing = this._following().has(sellerId);
    const next = new Set(this._following());
    if (wasFollowing) {
      next.delete(sellerId);
      this._following.set(next);
      void (async () => {
        try {
          await deleteApiSellersBySellerIdFollow({ path: { sellerId } });
        } catch (e) {
          this.apiFail.report('เลิกติดตามร้าน', e);
        }
      })();
      return false;
    } else {
      next.add(sellerId);
      this._following.set(next);
      void (async () => {
        try {
          await postApiSellersBySellerIdFollow({ path: { sellerId } });
        } catch (e) {
          this.apiFail.report('ติดตามร้าน', e);
        }
      })();
      return true;
    }
  }

  count(): number {
    return this._following().size;
  }

  /** Sync follow chip with server (call when opening a storefront). */
  async hydrateFromApi(sellerId: string): Promise<void> {
    if (!sellerId) return;
    try {
      const result = await getApiSellersBySellerIdFollow({
        path: { sellerId },
      });
      const data = unwrapSdkResult(result);
      const next = new Set(this._following());
      if (data?.isFollowing) next.add(sellerId);
      else next.delete(sellerId);
      this._following.set(next);
    } catch (e) {
      this.apiFail.report('โหลดสถานะติดตาม', e);
    }
  }
}

import { Injectable, inject, signal } from '@angular/core';
import {
  deleteApiSellersBySellerIdFollow,
  getApiSellersBySellerIdFollow,
  postApiSellersBySellerIdFollow,
} from '../api';
import { unwrapSdkResult, extractErrorStatus } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';

@Injectable({ providedIn: 'root' })
export class FollowService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _following = signal<Set<string>>(new Set());

  readonly following = this._following.asReadonly();

  isFollowing(sellerId: string): boolean {
    if (!sellerId) return false;
    return this._following().has(sellerId);
  }

  setFollowing(sellerId: string, isFollowing: boolean): void {
    if (!sellerId) return;
    const next = new Set(this._following());
    if (isFollowing) {
      next.add(sellerId);
    } else {
      next.delete(sellerId);
    }
    this._following.set(next);
  }

  async toggle(sellerId: string): Promise<boolean> {
    if (!sellerId) return false;
    const wasFollowing = this._following().has(sellerId);
    const next = new Set(this._following());

    if (wasFollowing) {
      next.delete(sellerId);
      this._following.set(next);
      try {
        await deleteApiSellersBySellerIdFollow({ path: { sellerId }, throwOnError: true });
        return false;
      } catch (e) {
        // Rollback state on error
        const rollback = new Set(this._following());
        rollback.add(sellerId);
        this._following.set(rollback);
        this.apiFail.report('errors.context.unfollowSeller', e);
        return true;
      }
    } else {
      next.add(sellerId);
      this._following.set(next);
      try {
        await postApiSellersBySellerIdFollow({ path: { sellerId }, throwOnError: true });
        return true;
      } catch (e) {
        // Rollback state on error
        const rollback = new Set(this._following());
        rollback.delete(sellerId);
        this._following.set(rollback);
        this.apiFail.report('errors.context.followSeller', e);
        return false;
      }
    }
  }

  count(): number {
    return this._following().size;
  }

  /** Sync follow chip with server (call when opening a storefront or document). */
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
      // Don't pop up error toasts for unauthenticated visitors
      const status = extractErrorStatus(e);
      if (status !== 401) {
        this.apiFail.report('errors.context.loadFollowStatus', e);
      }
    }
  }
}

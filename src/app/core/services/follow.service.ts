import { Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'siriedu.follows';

@Injectable({ providedIn: 'root' })
export class FollowService {
  private readonly _following = signal<Set<string>>(this.loadInitial());

  readonly following = this._following.asReadonly();

  isFollowing(sellerId: string): boolean {
    return this._following().has(sellerId);
  }

  toggle(sellerId: string): boolean {
    const next = new Set(this._following());
    let following: boolean;
    if (next.has(sellerId)) {
      next.delete(sellerId);
      following = false;
    } else {
      next.add(sellerId);
      following = true;
    }
    this._following.set(next);
    this.persist();
    return following;
  }

  count(): number {
    return this._following().size;
  }

  private loadInitial(): Set<string> {
    if (typeof localStorage === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      return new Set(list);
    } catch {
      return new Set();
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.from(this._following())),
      );
    } catch {
      // ignore
    }
  }
}

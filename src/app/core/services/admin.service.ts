import { Injectable, computed, signal } from '@angular/core';
import { AdminTransaction } from '../models';
import { MOCK_TRANSACTIONS } from '../mock/library.mock';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly _txns = signal<AdminTransaction[]>(MOCK_TRANSACTIONS);

  readonly transactions = this._txns.asReadonly();

  readonly totalRevenue = computed(() =>
    this._txns()
      .filter((t) => t.status === 'fulfilled' || t.status === 'paid')
      .reduce((sum, t) => sum + t.amount, 0),
  );

  readonly totalFees = computed(() =>
    this._txns()
      .filter((t) => t.status === 'fulfilled' || t.status === 'paid')
      .reduce((sum, t) => sum + t.fee, 0),
  );

  readonly successCount = computed(
    () =>
      this._txns().filter(
        (t) => t.status === 'fulfilled' || t.status === 'paid',
      ).length,
  );

  readonly refundCount = computed(
    () => this._txns().filter((t) => t.status === 'refunded').length,
  );
}

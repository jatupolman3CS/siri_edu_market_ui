import { Injectable, inject, signal } from '@angular/core';
import { getApiSystemStatus } from '../api';
import type { SystemStatusResponse } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';

export type SystemStatusState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: SystemStatusResponse }
  | { status: 'error' };

@Injectable({ providedIn: 'root' })
export class SystemStatusService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _state = signal<SystemStatusState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  async refresh(): Promise<void> {
    this._state.set({ status: 'loading' });
    try {
      const result = await getApiSystemStatus();
      const data = unwrapSdkResult(result);
      this._state.set({ status: 'ready', data });
    } catch (e) {
      this.apiFail.report('errors.context.loadSystemStatus', e);
      this._state.set({ status: 'error' });
    }
  }
}


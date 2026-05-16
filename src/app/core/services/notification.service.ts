import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { getApiNotificationsSettings, putApiNotificationsSettings } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type {
  NotificationSettingResponse,
  UpdateNotificationSettingsRequest,
} from '../api/types.gen';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _settings = signal<NotificationSettingResponse[]>([]);

  readonly settings = this._settings.asReadonly();

  loadSettings(): void {
    void (async () => {
      try {
        const result = await getApiNotificationsSettings();
        const data = unwrapSdkResult(result);
        this._settings.set(data);
      } catch (e) {
        this.apiFail.report('โหลดการตั้งค่าแจ้งเตือน', e);
      }
    })();
  }

  updateSettings(
    request: UpdateNotificationSettingsRequest,
  ): Observable<NotificationSettingResponse[]> {
    return from(putApiNotificationsSettings({ body: request })).pipe(
      map(unwrapSdkResult),
      tap((s) => this._settings.set(s)),
      catchError((e) => {
        this.apiFail.report('บันทึกการตั้งค่าแจ้งเตือน', e);
        return throwError(() => e);
      }),
    );
  }
}

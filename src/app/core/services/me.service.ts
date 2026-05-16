import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { getApiMeProfile, putApiMeProfile } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { UpdateProfileRequest, UserProfileResponse } from '../api/types.gen';

@Injectable({ providedIn: 'root' })
export class MeService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _profile = signal<UserProfileResponse | null>(null);

  readonly profile = this._profile.asReadonly();

  loadProfile(): Observable<UserProfileResponse> {
    return from(getApiMeProfile()).pipe(
      map(unwrapSdkResult),
      tap((p) => this._profile.set(p)),
      catchError((e) => {
        this.apiFail.report('โหลดโปรไฟล์', e);
        return throwError(() => e);
      }),
    );
  }

  updateProfile(request: UpdateProfileRequest): Observable<UserProfileResponse> {
    return from(putApiMeProfile({ body: request })).pipe(
      map(unwrapSdkResult),
      tap((p) => this._profile.set(p)),
      catchError((e) => {
        this.apiFail.report('บันทึกโปรไฟล์', e);
        return throwError(() => e);
      }),
    );
  }
}

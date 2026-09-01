import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { getApiMeProfile, postApiFilesUpload, putApiMeProfile } from '../api';
import { unwrapSdkResult } from './api-result';
import { ApiFailureReporter } from './api-failure-reporter.service';
import type { UpdateProfileRequest, UploadResponse } from '../api/types.gen';
import type { UpdateProfileRequestWithKey, UserProfileResponseWithKey } from './api-result';

@Injectable({ providedIn: 'root' })
export class MeService {
  private readonly apiFail = inject(ApiFailureReporter);

  private readonly _profile = signal<UserProfileResponseWithKey | null>(null);

  readonly profile = this._profile.asReadonly();

  loadProfile(): Observable<UserProfileResponseWithKey> {
    return from(getApiMeProfile()).pipe(
      map(unwrapSdkResult),
      tap((p) => this._profile.set(p)),
      catchError((e) => {
        this.apiFail.report('โหลดโปรไฟล์', e);
        return throwError(() => e);
      }),
    );
  }

  /**
   * storage-key-persistence v1 §4: `avatarStorageKey` (not `avatarUrl`) is what gets persisted —
   * `UpdateProfileRequestWithKey` shims the field until the generated `UpdateProfileRequest`
   * carries it (TODO(contract) in `api-result.ts`).
   */
  updateProfile(request: UpdateProfileRequestWithKey): Observable<UserProfileResponseWithKey> {
    // TODO(contract): drop this cast once `avatarStorageKey` exists on the generated
    // `UpdateProfileRequest` (after backend regen) — see docs/contracts/storage-key-persistence.md
    const body = request as unknown as UpdateProfileRequest;
    return from(putApiMeProfile({ body })).pipe(
      map(unwrapSdkResult),
      tap((p) => this._profile.set(p)),
      catchError((e) => {
        this.apiFail.report('บันทึกโปรไฟล์', e);
        return throwError(() => e);
      }),
    );
  }

  /**
   * F-07: uploading your own avatar.
   *
   * The same `POST /api/files/upload` SellerService.uploadFile calls — that endpoint is
   * `[Authorize]`, not seller-only. It lives here as well because a buyer changing their
   * profile picture has no business reaching through a seller service to do it, and /account
   * must not become a second uploader implementation.
   */
  async uploadAvatar(file: File): Promise<UploadResponse> {
    try {
      const result = await postApiFilesUpload({ body: { file } });
      return unwrapSdkResult(result);
    } catch (e) {
      this.apiFail.report('อัปโหลดรูปโปรไฟล์', e);
      throw e;
    }
  }
}

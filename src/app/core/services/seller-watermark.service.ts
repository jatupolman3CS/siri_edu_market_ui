import { Injectable } from '@angular/core';
import {
  getApiSellerDocumentsByIdWatermarkConfig,
  postApiSellerDocumentsByIdWatermarkConfig,
} from '../api';
import type { SellerWatermarkConfigRequest, SellerWatermarkConfigResponse } from '../api';
import { unwrapSdkResult } from './api-result';

/**
 * seller-watermark-service-refactor: thin `core/services/` wrapper around the generated SDK for
 * `GET`/`POST /api/seller/documents/{id}/watermark-config` — replaces the hand-written
 * `core/api/seller-watermark.api.ts` (rule 7: `features/**` must call `core/services/`, never
 * `sdk.gen`/`client.gen` directly). Pure import-path/architecture refactor — field names and
 * behavior are unchanged from the file it replaces.
 */
@Injectable({ providedIn: 'root' })
export class SellerWatermarkService {
  /** `GET /api/seller/documents/{id}/watermark-config` — throws on failure (caller decides UX). */
  async getConfig(documentId: string): Promise<SellerWatermarkConfigResponse> {
    return unwrapSdkResult(
      await getApiSellerDocumentsByIdWatermarkConfig({ path: { id: documentId } }),
    );
  }

  /** `POST /api/seller/documents/{id}/watermark-config` — throws on failure (caller decides UX). */
  async saveConfig(
    documentId: string,
    body: SellerWatermarkConfigRequest,
  ): Promise<SellerWatermarkConfigResponse> {
    return unwrapSdkResult(
      await postApiSellerDocumentsByIdWatermarkConfig({ path: { id: documentId }, body }),
    );
  }
}

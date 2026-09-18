import { client } from './client.gen';
import type { RequestResult } from './client';

// Field names below are matched byte-for-byte against the backend DTOs (camelCase over the
// wire via ASP.NET Core's default JSON policy) — see
// SIRIEDUMARKET.Application/Seller/Contracts/SellerWatermarkConfigResponse.cs and
// SellerWatermarkConfigRequest.cs. Do not rename without re-checking those files.
export interface SellerWatermarkConfigResponse {
  documentId: string;
  title: string;
  format: string;
  watermarkEnabled: boolean;
  previewWatermarkSubtitle: string | null;
  previewWatermarkFontFamily: string | null;
  previewWatermarkPosition: string;
  previewWatermarkOpacity: number;
  previewWatermarkColor: string;
  previewWatermarkRotation: number | null;
  previewWatermarkFontSize: number | null;
  personalizedWatermarkPosition: string;
  personalizedWatermarkTemplate: string | null;
  previewImageUrls: string[];
  hasMainFile: boolean;
}

export interface SellerWatermarkConfigRequest {
  watermarkEnabled?: boolean;
  previewWatermarkSubtitle?: string;
  previewWatermarkFontFamily?: string;
  previewWatermarkPosition?: string;
  previewWatermarkOpacity?: number;
  previewWatermarkColor?: string;
  previewWatermarkRotation?: number;
  previewWatermarkFontSize?: number;
  personalizedWatermarkPosition?: string;
  personalizedWatermarkTemplate?: string;
}

export function getApiSellerDocumentWatermarkConfig(
  documentId: string,
): RequestResult<SellerWatermarkConfigResponse, unknown, false> {
  return client.get<SellerWatermarkConfigResponse>({
    url: `/api/seller/documents/${documentId}/watermark-config`,
  });
}

export function postApiSellerDocumentWatermarkConfig(
  documentId: string,
  body: SellerWatermarkConfigRequest,
): RequestResult<SellerWatermarkConfigResponse, unknown, false> {
  return client.post<SellerWatermarkConfigResponse>({
    url: `/api/seller/documents/${documentId}/watermark-config`,
    body,
  });
}

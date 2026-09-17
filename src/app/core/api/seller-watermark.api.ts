import { client } from './client.gen';
import type { RequestResult } from './client';

export interface SellerWatermarkConfigResponse {
  documentId: string;
  title: string;
  watermarkText: string;
  watermarkPosition: string;
  watermarkOpacity: number;
  watermarkColor: string;
  watermarkFontSize: number;
  watermarkRotationDegrees: number;
  downloadWatermarkPosition: string;
  downloadWatermarkTemplate: string;
  previewRasterUrls: string[];
  previewPageCount: number;
}

export interface SellerWatermarkConfigRequest {
  watermarkText?: string;
  watermarkPosition?: string;
  watermarkOpacity?: number;
  watermarkColor?: string;
  watermarkFontSize?: number;
  watermarkRotationDegrees?: number;
  downloadWatermarkPosition?: string;
  downloadWatermarkTemplate?: string;
}

export function getApiSellerDocumentWatermarkConfig(
  documentId: string,
): RequestResult<SellerWatermarkConfigResponse> {
  return client.get<SellerWatermarkConfigResponse>({
    url: `/api/seller/documents/${documentId}/watermark-config`,
  });
}

export function postApiSellerDocumentWatermarkConfig(
  documentId: string,
  body: SellerWatermarkConfigRequest,
): RequestResult<SellerWatermarkConfigResponse> {
  return client.post<SellerWatermarkConfigResponse>({
    url: `/api/seller/documents/${documentId}/watermark-config`,
    body,
  });
}

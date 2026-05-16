import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE_URL } from '../api-runtime';

export interface PdfDocumentUploadResponse {
  documentId: string;
  previewImageUrls: string[];
}

export interface SellerRasterPreviewResponse {
  previewImageUrls: string[];
  previewRelativePaths?: string[];
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);

  /** POST multipart/form-data; auth header added by interceptor. */
  uploadPdf(file: File): Promise<PdfDocumentUploadResponse> {
    const form = new FormData();
    form.append('file', file, file.name);
    const url = `${API_BASE_URL}/api/document/upload`;
    return firstValueFrom(this.http.post<PdfDocumentUploadResponse>(url, form));
  }

  /** POST seller-only: rasterize stored PDF to JPEG previews under wwwroot/Previews. */
  generateSellerRasterPreview(documentId: string): Promise<SellerRasterPreviewResponse> {
    const url = `${API_BASE_URL}/api/seller/documents/${encodeURIComponent(documentId)}/preview-raster`;
    return firstValueFrom(this.http.post<SellerRasterPreviewResponse>(url, {}));
  }
}

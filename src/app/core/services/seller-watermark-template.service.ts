import { Injectable } from '@angular/core';
import type { SellerWatermarkConfigRequest } from '../api';

export interface SellerWatermarkTemplate {
  enabled: boolean;
  previewWatermarkSubtitle: string;
  previewWatermarkFontFamily: string;
  config: SellerWatermarkConfigRequest;
}

export const DEFAULT_WATERMARK_TEMPLATE: SellerWatermarkTemplate = {
  enabled: true,
  previewWatermarkSubtitle: '',
  previewWatermarkFontFamily: 'Noto Sans Thai',
  config: {
    previewWatermarkSubtitle: 'SIRI EDUMARKET PREVIEW',
    previewWatermarkPosition: 'center-diagonal',
    previewWatermarkOpacity: 0.25,
    previewWatermarkColor: '#E11D48',
    previewWatermarkFontSize: 42,
    previewWatermarkRotation: -30,
    personalizedWatermarkPosition: 'footer',
    personalizedWatermarkTemplate:
      'เอกสารนี้ได้รับสิทธิ์การใช้งานโดย {email} เมื่อ {date} (รหัสตรวจสอบ: {token}) ห้ามทำซ้ำ ดัดแปลง หรือเผยแพร่ต่อ',
  },
};

const STORAGE_PREFIX = 'siriedumarket:seller-watermark-template:';

@Injectable({ providedIn: 'root' })
export class SellerWatermarkTemplateService {
  load(sellerId?: string | null): SellerWatermarkTemplate | null {
    try {
      const key = sellerId ? STORAGE_PREFIX + sellerId : STORAGE_PREFIX + 'current';
      let raw = localStorage.getItem(key);
      if (!raw && sellerId) {
        raw = localStorage.getItem(STORAGE_PREFIX + 'current');
      }
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== 'object' || !('config' in value)) return null;
      const template = value as SellerWatermarkTemplate;
      if (!template.config || typeof template.config.previewWatermarkPosition !== 'string') return null;
      return template;
    } catch {
      return null;
    }
  }

  loadOrDefault(sellerId?: string | null): SellerWatermarkTemplate {
    const loaded = this.load(sellerId);
    if (!loaded) return DEFAULT_WATERMARK_TEMPLATE;
    return {
      enabled: loaded.enabled ?? DEFAULT_WATERMARK_TEMPLATE.enabled,
      previewWatermarkSubtitle:
        loaded.previewWatermarkSubtitle ?? DEFAULT_WATERMARK_TEMPLATE.previewWatermarkSubtitle,
      previewWatermarkFontFamily:
        loaded.previewWatermarkFontFamily || DEFAULT_WATERMARK_TEMPLATE.previewWatermarkFontFamily,
      config: {
        ...DEFAULT_WATERMARK_TEMPLATE.config,
        ...(loaded.config || {}),
      },
    };
  }

  save(sellerId: string | null | undefined, template: SellerWatermarkTemplate): boolean {
    try {
      const payload = JSON.stringify(template);
      const key = sellerId ? STORAGE_PREFIX + sellerId : STORAGE_PREFIX + 'current';
      localStorage.setItem(key, payload);
      if (sellerId) {
        localStorage.setItem(STORAGE_PREFIX + 'current', payload);
      }
      return true;
    } catch {
      return false;
    }
  }
}

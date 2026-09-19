import { Injectable, inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { TranslationService } from '../i18n';

/**
 * แจ้งเตือนแบบรวมศูนย์เมื่อคำขอไป backend / OpenAPI client ล้มเหลว (รองรับ 2 ภาษา)
 */
@Injectable({ providedIn: 'root' })
export class ApiFailureReporter {
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService, { optional: true });

  private get fallbackText(): string {
    return this.translation?.currentLang() === 'en'
      ? 'Unable to connect to the server'
      : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';
  }

  /** context = ข้อความสั้นๆ หรือ translation key เช่น "โหลดตะกร้า" หรือ "common.errors.loadCart" */
  report(context: string, error?: unknown): void {
    const detail = this.formatDetail(error);
    const localizedContext = this.translation?.t(context) || context;
    if (typeof this.message?.error === 'function') {
      this.message.error(detail ? `${localizedContext} — ${detail}` : localizedContext);
    }
  }

  formatDetail(error: unknown): string {
    if (error == null) return this.fallbackText;
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || this.fallbackText;

    if (typeof error !== 'object') return this.fallbackText;

    const o = error as Record<string, unknown>;

    // ProblemDetails: errors as { field: [msg, ...] }
    const errors = o['errors'];
    if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
      const flat: string[] = [];
      for (const value of Object.values(errors)) {
        if (Array.isArray(value)) {
          for (const v of value) if (typeof v === 'string' && v) flat.push(v);
        } else if (typeof value === 'string') {
          flat.push(value);
        }
      }
      if (flat.length) return flat.join(' • ');
    }

    // Legacy: errors as array
    if (Array.isArray(errors) && errors.length) {
      const first = errors[0] as Record<string, unknown> | string;
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object') {
        const desc = first['description'];
        if (typeof desc === 'string') return desc;
        const msg = first['message'];
        if (typeof msg === 'string') return msg;
      }
    }

    // Check machine-readable error code mapping
    const code = o['code'];
    if (typeof code === 'string' && code && this.translation) {
      const localizedCodeMsg = this.translation.t(`errors.${code}`);
      if (localizedCodeMsg && localizedCodeMsg !== `errors.${code}`) {
        return localizedCodeMsg;
      }
    }

    const detail = o['detail'];
    if (typeof detail === 'string' && detail) return detail;
    const title = o['title'];
    if (typeof title === 'string' && title) return title;
    const message = o['message'];
    if (typeof message === 'string' && message) return message;

    const status = (o['status'] ?? o['statusCode']) as number | undefined;
    if (typeof status === 'number') return `HTTP ${status}`;

    return this.fallbackText;
  }
}

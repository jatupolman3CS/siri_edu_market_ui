import { Injectable, inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';

const FALLBACK = 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ';

/**
 * แจ้งเตือนแบบรวมศูนย์เมื่อคำขอไป backend / OpenAPI client ล้มเหลว
 *
 * AUD-013: รองรับ shape ProblemDetails (ASP.NET Core) แบบ camelCase รวมถึง
 *  - `detail` / `title` / `message`
 *  - `errors: { field: [msg, ...] }` (ModelState validation)
 *  - `errors: [...]` (legacy array form)
 *  - HTTP `status` / `statusCode` (เพิ่ม prefix [HTTP code] เพื่อ debug ง่าย)
 */
@Injectable({ providedIn: 'root' })
export class ApiFailureReporter {
  private readonly message = inject(NzMessageService);

  /** context = ข้อความสั้นๆ ภาษาไทย เช่น "โหลดตะกร้า" */
  report(context: string, error?: unknown): void {
    const detail = this.formatDetail(error);
    if (typeof this.message?.error === 'function') {
      this.message.error(detail ? `${context} — ${detail}` : context);
    }
  }

  formatDetail(error: unknown): string {
    if (error == null) return FALLBACK;
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message || FALLBACK;

    if (typeof error !== 'object') return FALLBACK;

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

    const detail = o['detail'];
    if (typeof detail === 'string' && detail) return detail;
    const title = o['title'];
    if (typeof title === 'string' && title) return title;
    const message = o['message'];
    if (typeof message === 'string' && message) return message;

    const status = (o['status'] ?? o['statusCode']) as number | undefined;
    if (typeof status === 'number') return `HTTP ${status}`;

    return FALLBACK;
  }
}

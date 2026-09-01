import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';
import { PlatformStatsService } from '../../../core/services';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterLink, LogoComponent, GlobalLoaderComponent, CompactPipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss',
})
export class AuthLayoutComponent {
  // real-data-stats v1 §4.3: shared across all 5 auth pages (login/register/forgot-password/
  // reset-password/verify-email) — this layout is the single wire point.
  readonly platformStats = inject(PlatformStatsService);

  constructor() {
    // No-op if another page already loaded this (cached in the service itself).
    this.platformStats.loadStats();
  }

  // Q-06: a real newline rather than a literal `<br>` — the template binds this with plain
  // `{{ }}` interpolation (escaped, not `[innerHTML]`), so an embedded `<br>` rendered as raw
  // text instead of a line break. `white-space: pre-line` on the template turns `\n` into one.
  readonly artTitle = input<string>('แพลตฟอร์มของคนรัก\nการเรียนรู้ 💗');
  readonly artDescription = input<string>(
    'ไม่ว่าจะเป็นนักเรียน นักเขียน หรือดีไซเนอร์ ที่นี่คือบ้านของเอกสารคุณภาพ',
  );
  readonly artBullets = input<{ icon: string; label: string }[]>([
    { icon: '🎁', label: 'ดาวน์โหลดเอกสารฟรีกว่า 200 รายการ' },
    { icon: '💝', label: 'บันทึกรายการโปรดและตามผู้ขายที่ใช่' },
    { icon: '🛡️', label: 'ลายน้ำคุ้มครองทุกไฟล์ดาวน์โหลด' },
    { icon: '⚡', label: 'ดาวน์โหลดทันทีหลังชำระเงิน' },
  ]);
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LogoComponent } from '../../../shared/components/logo/logo.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterLink, LogoComponent, GlobalLoaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss',
})
export class AuthLayoutComponent {
  readonly artTitle = input<string>('แพลตฟอร์มของคนรัก<br>การเรียนรู้ 💗');
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

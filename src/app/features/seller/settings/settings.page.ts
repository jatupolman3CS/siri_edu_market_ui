import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-seller-settings',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SellerSettingsPage {
  readonly notifications = [
    { key: 'sale', label: 'มียอดขายใหม่', note: 'แจ้งเตือนเมื่อมีคนซื้อเอกสารของคุณ', checked: true },
    { key: 'review', label: 'มีรีวิวใหม่', note: 'รีวิวจากผู้ที่ซื้อแล้ว', checked: true },
    { key: 'payout', label: 'รายได้พร้อมโอน', note: 'เมื่อยอดถึงระดับที่กำหนด', checked: true },
    { key: 'tips', label: 'เคล็ดลับการขาย', note: 'ทิปและข่าวสารจาก SIRIEDUMARKET', checked: false },
  ];
}

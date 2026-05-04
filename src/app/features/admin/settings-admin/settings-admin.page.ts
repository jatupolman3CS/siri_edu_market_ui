import { ChangeDetectionStrategy, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-admin.page.html',
  styleUrl: './settings-admin.page.scss',
})
export class AdminSettingsPage {
  readonly gateways = [
    { name: 'Omise', icon: '💳', note: 'รับบัตรเครดิต Visa / Master / JCB' },
    { name: 'GB Prime Pay', icon: '🏦', note: 'PromptPay QR และ Internet Banking' },
    { name: 'TrueMoney Wallet', icon: '👛', note: 'หักจาก e-Wallet' },
  ];
}

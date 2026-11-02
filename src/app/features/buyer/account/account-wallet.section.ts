import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WalletService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TranslatePipe } from '../../../core/i18n';

/**
 * buyer-wallet v1 §4.1: wallet summary card — the /account/wallet page. Moved out of
 * account.page.html when each sidebar entry became its own child route.
 */
@Component({
  selector: 'app-account-wallet-section',
  standalone: true,
  imports: [RouterLink, IconComponent, ThbPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account-wallet.section.html',
})
export class AccountWalletSection {
  readonly wallet = inject(WalletService);

  constructor() {
    void this.wallet.refreshSummary();
  }
}

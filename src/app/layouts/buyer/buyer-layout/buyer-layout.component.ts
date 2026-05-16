import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from '../../../shared/components/app-header/app-header.component';
import { AppFooterComponent } from '../../../shared/components/app-footer/app-footer.component';
import { CartDrawerComponent } from '../../../shared/components/cart-drawer/cart-drawer.component';
import { QuickViewModalComponent } from '../../../shared/components/quick-view-modal/quick-view-modal.component';
import { GlobalLoaderComponent } from '../../../shared/components/global-loader/global-loader.component';

@Component({
  selector: 'app-buyer-layout',
  standalone: true,
  imports: [
    RouterOutlet,
    AppHeaderComponent,
    AppFooterComponent,
    CartDrawerComponent,
    QuickViewModalComponent,
    GlobalLoaderComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './buyer-layout.component.html',
  styleUrl: './buyer-layout.component.scss',
})
export class BuyerLayoutComponent {}

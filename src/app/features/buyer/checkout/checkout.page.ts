import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  NgZone,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService, CartService, OrderService } from '../../../core/services';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { getApiPaymentsOmisePublicConfig } from '../../../core/api';
import { unwrapSdkResult } from '../../../core/services/api-result';
import { loadOmiseScript } from '../../../core/util/load-omise-script';

type PayMethod = 'promptpay' | 'credit_card' | 'truemoney';

@Component({
  selector: 'app-buyer-checkout',
  standalone: true,
  imports: [RouterLink, FormsModule, ThbPipe, IconComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
})
export class BuyerCheckoutPage {
  readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly orders = inject(OrderService);
  private readonly message = inject(NzMessageService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);

  readonly payMethod = signal<PayMethod>('promptpay');
  readonly checkoutState = this.orders.checkoutState;

  readonly cardName = signal('');
  readonly cardNumber = signal('');
  readonly cardExpMonth = signal(12);
  readonly cardExpYear = signal(2030);
  readonly cardCvv = signal('');
  readonly trueMoneyPhone = signal('');

  patchExpMonth(raw: string | number): void {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n)) return;
    this.cardExpMonth.set(Math.min(12, Math.max(1, n)));
  }

  patchExpYear(raw: string | number): void {
    const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    if (!Number.isFinite(n)) return;
    this.cardExpYear.set(Math.min(2099, Math.max(2024, n)));
  }

  readonly methods: { value: PayMethod; label: string; icon: string; note: string }[] = [
    { value: 'promptpay', label: 'PromptPay QR', icon: '📲', note: 'สแกนจ่ายทันที' },
    { value: 'credit_card', label: 'บัตรเครดิต', icon: '💳', note: 'Visa / Master / JCB' },
    { value: 'truemoney', label: 'TrueMoney', icon: '👛', note: 'หักจาก e-Wallet' },
  ];

  async confirmPayment(): Promise<void> {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: '/checkout' } });
      return;
    }

    let omiseCardToken: string | undefined;
    let trueMoneyPhoneNumber: string | undefined;

    try {
      if (this.payMethod() === 'credit_card') {
        omiseCardToken = await this.createOmiseCardToken();
      } else if (this.payMethod() === 'truemoney') {
        const raw = this.trueMoneyPhone().trim();
        const digits = raw.replace(/\D/g, '');
        if (digits.length < 9) {
          this.message.warning('กรุณากรอกเบอร์มือถือที่ผูก TrueMoney');
          return;
        }
        let n = digits;
        if (n.length === 9 && n[0] === '8') n = '0' + n;
        if (n.length !== 10 || n[0] !== '0') {
          this.message.warning('รูปแบบเบอร์มือถือไม่ถูกต้อง');
          return;
        }
        trueMoneyPhoneNumber = n;
      }

      const outcome = await this.orders.create({
        paymentMethod: this.payMethod(),
        omiseCardToken,
        trueMoneyPhoneNumber,
      });

      this.cdr.markForCheck();

      if (outcome.ok) {
        if (!outcome.order.id?.trim()) {
          this.message.error('สร้างคำสั่งซื้อแล้วแต่ไม่ได้รับรหัสออเดอร์ — โปรดตรวจที่ประวัติคำสั่งซื้อ');
          this.orders.resetCheckout();
          this.cdr.markForCheck();
          return;
        }

        this.cart.clear();
        this.cdr.markForCheck();

        const urlTree =
          outcome.order.status === 'paid'
            ? this.router.createUrlTree(['/orders'], { queryParams: { success: 1 } })
            : this.router.createUrlTree(['/orders', outcome.order.id], { queryParams: { pay: '1' } });

        const navigated = await this.ngZone.run(() => this.router.navigateByUrl(urlTree));
        if (!navigated) {
          this.message.warning(
            'ไม่สามารถเปลี่ยนหน้าอัตโนมัติได้ — เปิดเมนู «ประวัติคำสั่งซื้อ» เพื่อดำเนินการต่อ',
          );
        }
        this.cdr.markForCheck();
        return;
      }

      // BUG-09: an earlier unpaid order still holds these documents. Send the buyer to their
      // order history to finish paying it or cancel it, instead of a dead-end toast.
      if (outcome.pendingOrder) {
        this.message.warning(outcome.message ?? 'คุณมีคำสั่งซื้อที่ยังไม่ได้ชำระเงินอยู่');
        void this.ngZone.run(() => this.router.navigateByUrl('/orders'));
        this.cdr.markForCheck();
        return;
      }

      if (outcome.alreadyOwned) {
        this.message.warning('มีบางรายการที่คุณเป็นเจ้าของอยู่แล้ว — ไปที่คลังของฉัน');
        void this.ngZone.run(() => this.router.navigateByUrl('/library'));
        this.cdr.markForCheck();
        return;
      }

      // Toast มาจาก OrderService → ApiFailureReporter แล้ว — เคลียร์ state ปุ่มให้ลองใหม่
      this.orders.resetCheckout();
      this.cdr.markForCheck();
    } catch (e) {
      this.orders.resetCheckout();
      const msg = e instanceof Error ? e.message : 'ชำระเงินไม่สำเร็จ';
      this.message.error(msg);
      this.cdr.markForCheck();
    }
  }

  private async createOmiseCardToken(): Promise<string> {
    if (!this.cardName().trim() || !this.cardNumber().trim() || !this.cardCvv().trim()) {
      throw new Error('กรุณากรอกข้อมูลบัตรให้ครบ');
    }

    await loadOmiseScript();
    const cfg = unwrapSdkResult(await getApiPaymentsOmisePublicConfig({}));
    const pk = cfg.publicKey?.trim();
    if (!pk) {
      throw new Error('ยังไม่ตั้งค่า Omise public key ที่เซิร์ฟเวอร์');
    }

    const Omise = window.Omise;
    if (!Omise) {
      throw new Error('โหลด Omise.js ไม่สำเร็จ');
    }

    Omise.setPublicKey(pk);

    return await new Promise<string>((resolve, reject) => {
      Omise.createToken(
        'card',
        {
          name: this.cardName().trim(),
          number: this.cardNumber().replace(/\D/g, ''),
          expiration_month: this.cardExpMonth(),
          expiration_year: this.cardExpYear(),
          security_code: this.cardCvv().replace(/\D/g, ''),
        },
        (status, response) => {
          if (status === 200 && response.id) {
            resolve(response.id);
            return;
          }
          reject(new Error(response.message ?? 'ไม่สามารถสร้างบัตร token ได้'));
        },
      );
    });
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, OrderService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import type { Order } from '../../../core/models';

@Component({
  selector: 'app-buyer-order-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    ThbPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-3xl mx-auto px-4 lg:px-6 py-8">
      @if (loading()) {
        <app-empty-state emoji="⏳" title="กำลังโหลด…" description="รอสักครู่นะคะ" />
      } @else if (!order()) {
        <app-empty-state
          emoji="😕"
          title="ไม่พบคำสั่งซื้อ"
          description="อาจถูกลบหรือคุณไม่มีสิทธิ์เข้าถึง"
        >
          <a routerLink="/orders" class="btn-pink mt-4">กลับไปหน้าคำสั่งซื้อ</a>
        </app-empty-state>
      } @else {
        @if (order(); as o) {
          <a routerLink="/orders" class="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-pink-600 mb-6">
            <app-icon name="arrow-left" [size]="14" />
            กลับไปหน้าคำสั่งซื้อ
          </a>

          <app-page-hero
            [eyebrow]="'คำสั่งซื้อ ' + o.orderNumber"
            title="รายละเอียดคำสั่งซื้อ"
            [description]="'สั่งซื้อเมื่อ ' + (o.createdAt | timeAgo)"
          />

          <!-- Status & Summary -->
          <div class="card-soft p-6 mb-6">
            <div class="flex flex-wrap items-center gap-4 mb-4">
              <span [class]="statusClass(o.status)" class="pill text-sm">
                {{ statusLabel(o.status) }}
              </span>
              <span class="text-sm text-ink-muted">
                ชำระผ่าน {{ paymentLabel(o.paymentMethod) }}
              </span>
            </div>

            @if (o.status === 'awaiting_payment' && o.paymentHints) {
              <div class="mb-6 p-5 rounded-2xl border border-amber-200 bg-amber-50/80">
                <h3 class="text-base font-bold text-ink mb-2">รอชำระเงิน</h3>
                <p class="text-xs text-ink-muted mb-4">
                  กรุณาชำระตามวิธีที่เลือก ระบบจะอัปเดตสถานะอัตโนมัติเมื่อ Omise ยืนยันการชำระเงิน
                </p>
                @if (o.paymentHints.promptPayQrImageUrl) {
                  <div class="flex flex-col items-center gap-3">
                    <img
                      [src]="o.paymentHints.promptPayQrImageUrl"
                      alt="PromptPay QR"
                      class="max-w-[220px] rounded-xl border border-line bg-white p-2"
                    />
                    <span class="text-xs text-ink-muted">สแกนด้วยแอปธนาคารของคุณ</span>
                  </div>
                }
                @if (o.paymentHints.trueMoneyAuthorizeUri) {
                  <a
                    [href]="o.paymentHints.trueMoneyAuthorizeUri"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn-pink inline-flex items-center gap-2 !py-2.5"
                  >
                    เปิด TrueMoney เพื่อชำระเงิน
                    <app-icon name="arrow-right" [size]="14" />
                  </a>
                }
                @if (o.paymentHints.awaitingWebhook) {
                  <p class="text-[11px] text-ink-muted mt-3">กำลังตรวจสอบสถานะการชำระเงิน…</p>
                }
              </div>
            }

            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt class="text-ink-muted">ยอดรวม</dt>
                <dd class="text-2xl font-bold text-ink mt-1">{{ o.total | thb }}</dd>
              </div>
              <div>
                <dt class="text-ink-muted">จำนวนรายการ</dt>
                <dd class="text-2xl font-bold text-ink mt-1">{{ o.items.length }} ไอเทม</dd>
              </div>
            </dl>
          </div>

          <!-- Items -->
          <div class="card-soft overflow-hidden">
            <header class="px-6 py-4 bg-pink-50 border-b border-pink-100">
              <h3 class="font-bold text-ink">รายการสินค้า</h3>
            </header>
            <ul class="divide-y divide-line">
              @for (item of o.items; track item.document.id) {
                <li class="flex items-center gap-4 p-4">
                  <img
                    [src]="item.document.cover"
                    [alt]="item.document.title"
                    class="w-16 h-20 object-cover rounded-xl flex-shrink-0"
                  />
                  <div class="flex-1 min-w-0">
                    <div class="text-xs text-ink-muted">{{ item.document.seller.studioName }}</div>
                    <div class="font-bold text-ink line-clamp-2">{{ item.document.title }}</div>
                    <div class="text-xs text-ink-muted mt-1 uppercase">
                      {{ item.document.format }} · {{ item.document.pages }} หน้า
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="font-bold text-ink">{{ item.document.price | thb }}</div>
                    <a
                      [routerLink]="['/document', item.document.id]"
                      class="text-xs text-pink-600 hover:underline mt-1 inline-block"
                    >
                      ดูสินค้า
                    </a>
                  </div>
                </li>
              }
            </ul>
          </div>

          <!-- Actions -->
          <div class="flex flex-wrap gap-3 mt-6">
            <a routerLink="/library" class="btn-pink">
              <app-icon name="download" [size]="14" />
              ไปคลังเอกสาร
            </a>
            <button class="btn-ghost" (click)="printReceipt()">
              <app-icon name="doc" [size]="14" />
              ดูใบเสร็จ
            </button>
          </div>
        }
      }
    </div>
  `,
  styles: [],
})
export class BuyerOrderDetailPage {
  private readonly orderService = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly order = this.orderService.detail;

  constructor() {
    if (!this.auth.isAuthenticated()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      void this.orderService.loadDetail(id).finally(() => this.loading.set(false));
    } else {
      this.loading.set(false);
    }

    effect((onCleanup) => {
      const o = this.order();
      if (!o?.id || o.status !== 'awaiting_payment') {
        return;
      }
      const orderId = o.id;
      const handle = window.setInterval(() => {
        void this.orderService.loadDetail(orderId);
      }, 3000);
      onCleanup(() => window.clearInterval(handle));
    });
  }

  statusLabel(s: string): string {
    return {
      awaiting_payment: 'รอชำระเงิน',
      paid: 'ชำระแล้ว',
      fulfilled: 'สำเร็จ',
      refunded: 'คืนเงินแล้ว',
      cancelled: 'ยกเลิก',
    }[s] ?? s;
  }

  statusClass(s: string): string {
    return {
      awaiting_payment: 'bg-amber-100 text-amber-700',
      paid: 'bg-blue-100 text-blue-700',
      fulfilled: 'bg-emerald-100 text-emerald-700',
      refunded: 'bg-rose-100 text-rose-700',
      cancelled: 'bg-gray-100 text-gray-600',
    }[s] ?? 'bg-pink-100 text-pink-700';
  }

  paymentLabel(p: string): string {
    return {
      promptpay: 'PromptPay',
      credit_card: 'บัตรเครดิต',
      truemoney: 'TrueMoney',
    }[p] ?? p;
  }

  printReceipt(): void {
    window.print();
  }
}

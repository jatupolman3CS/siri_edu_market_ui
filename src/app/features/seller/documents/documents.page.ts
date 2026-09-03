import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { placeholderCoverUrl } from '../../../core/brand-assets';
import { DocumentItem } from '../../../core/models';
import { SellerService } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ImgFallbackDirective } from '../../../shared/directives/img-fallback.directive';

@Component({
  selector: 'app-seller-documents',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    EmptyStateComponent,
    IconComponent,
    NzModalModule,
    ThbPipe,
    CompactPipe,
    TimeAgoPipe,
    ImgFallbackDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.scss',
})
export class SellerDocumentsPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly router = inject(Router);

  readonly search = signal<string>('');
  readonly status = signal<'all' | 'approved' | 'pending' | 'rejected' | 'draft'>(
    'all',
  );
  readonly coverFallback = placeholderCoverUrl();

  readonly statuses = [
    { value: 'all' as const, label: 'ทั้งหมด' },
    { value: 'draft' as const, label: 'ฉบับร่าง' },
    { value: 'approved' as const, label: 'เผยแพร่แล้ว' },
    { value: 'pending' as const, label: 'รออนุมัติ' },
    { value: 'rejected' as const, label: 'ไม่ผ่าน' },
  ];

  constructor() {
    void this.seller.refreshDocuments();

    let timer: ReturnType<typeof setTimeout> | null = null;
    effect(() => {
      const q = this.search();
      const s = this.status();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        this.seller.setDocumentsQuery({ status: s, search: q });
      }, 250);
    });
  }

  filteredDocs() {
    return this.seller.myDocuments();
  }

  statusLabel(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return 'เผยแพร่';
      case 'pending':
        return 'รออนุมัติ';
      case 'rejected':
        return 'ไม่ผ่าน';
      case 'draft':
        return 'ฉบับร่าง';
      default:
        return status || '—';
    }
  }

  statusPillClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'approved':
        return 'pill-green';
      case 'pending':
        return 'pill-amber';
      case 'rejected':
        return 'pill-rose';
      case 'draft':
        return 'pill-soft';
      default:
        return 'pill-soft';
    }
  }

  view(doc: DocumentItem): void {
    const st = (doc.status || '').toLowerCase();
    if (st === 'approved') {
      this.router.navigate(['/document', doc.id]);
      return;
    }
    this.router.navigate(['/seller/upload'], { queryParams: { id: doc.id } });
  }

  onCoverError(ev: Event): void {
    const el = ev.target as HTMLImageElement | null;
    if (el) el.src = this.coverFallback;
  }

  edit(id: string): void {
    this.router.navigate(['/seller/upload'], { queryParams: { id } });
  }

  confirmRemove(id: string, title: string): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันการลบเอกสาร',
      nzContent: `ต้องการลบ "${title}" ใช่ไหม?`,
      nzOkText: 'ลบ',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: async () => {
        await this.seller.remove(id);
        this.message.success(`ลบ "${title}" เรียบร้อย`);
      },
    });
  }
}

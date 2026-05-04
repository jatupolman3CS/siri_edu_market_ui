import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-seller-documents',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    IconComponent,
    ThbPipe,
    CompactPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './documents.page.html',
  styleUrl: './documents.page.scss',
})
export class SellerDocumentsPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);

  readonly search = signal<string>('');
  readonly status = signal<'all' | 'approved' | 'pending'>('all');

  readonly statuses = [
    { value: 'all' as const, label: 'ทั้งหมด' },
    { value: 'approved' as const, label: 'เผยแพร่แล้ว' },
    { value: 'pending' as const, label: 'รออนุมัติ' },
  ];

  filteredDocs() {
    let docs = this.seller.myDocuments();
    if (this.status() !== 'all') {
      docs = docs.filter((d) => d.status === this.status());
    }
    if (this.search().trim()) {
      const q = this.search().toLowerCase();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q));
    }
    return docs;
  }

  confirmRemove(id: string, title: string): void {
    this.seller.remove(id);
    this.message.success(`ลบ "${title}" เรียบร้อย`);
  }
}

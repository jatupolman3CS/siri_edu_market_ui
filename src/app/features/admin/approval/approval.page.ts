import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CatalogService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

@Component({
  selector: 'app-admin-approval',
  standalone: true,
  imports: [IconComponent, EmptyStateComponent, TimeAgoPipe, ThbPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './approval.page.html',
  styleUrl: './approval.page.scss',
})
export class AdminApprovalPage {
  readonly catalog = inject(CatalogService);
  private readonly message = inject(NzMessageService);

  readonly selectedId = signal<string>('');

  readonly selected = computed(() => {
    const list = this.catalog.pending();
    if (!list.length) return null;
    const id = this.selectedId() || list[0].id;
    return list.find((d) => d.id === id) ?? list[0];
  });

  readonly checks = [
    { label: 'เอกสารตรงกับคำอธิบาย', note: 'AI ตรวจสอบความสอดคล้องของเนื้อหา', ok: true },
    { label: 'ไม่ละเมิดลิขสิทธิ์', note: 'ผ่านการตรวจ Plagiarism: 96% เป็นเนื้อหาต้นฉบับ', ok: true },
    { label: 'มีลายน้ำในไฟล์ตัวอย่าง', note: 'พบ Watermark Pattern ครบทุกหน้า', ok: true },
    { label: 'ภาพหน้าปกเหมาะสม', note: 'ภาพไม่มี nudity / violence', ok: true },
    { label: 'ราคาตรงกับเนื้อหา', note: 'อาจตรวจสอบเพิ่มเติม — เนื้อหาคุณภาพดี ราคาเฉลี่ยในหมวดสูงกว่านี้', ok: false },
  ];

  approve(id: string, title: string): void {
    this.catalog.approve(id);
    this.message.success(`อนุมัติ "${title}" เรียบร้อย`);
    this.selectedId.set('');
  }

  reject(id: string, title: string): void {
    this.catalog.reject(id);
    this.message.warning(`ปฏิเสธ "${title}" และแจ้งผู้ขายแล้ว`);
    this.selectedId.set('');
  }
}

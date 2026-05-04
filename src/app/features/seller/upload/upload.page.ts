import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { CatalogService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

@Component({
  selector: 'app-seller-upload',
  standalone: true,
  imports: [RouterLink, FormsModule, IconComponent, ThbPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './upload.page.html',
  styleUrl: './upload.page.scss',
})
export class SellerUploadPage {
  readonly catalog = inject(CatalogService);
  private readonly message = inject(NzMessageService);
  private readonly router = inject(Router);

  readonly steps = [
    { no: 1, label: 'อัปโหลด' },
    { no: 2, label: 'รายละเอียด' },
    { no: 3, label: 'ตั้งราคา' },
    { no: 4, label: 'ตรวจสอบ' },
  ];

  readonly formats = ['PDF', 'DOCX', 'PPTX', 'XLSX', 'ZIP'];

  readonly step = signal<number>(1);
  readonly file = signal<File | null>(null);
  readonly watermark = signal<boolean>(true);
  readonly previewPages = signal<number>(5);

  readonly title = signal<string>('');
  readonly shortDescription = signal<string>('');
  readonly longDescription = signal<string>('');
  readonly categoryId = signal<string>('');
  readonly language = signal<'th' | 'en'>('th');
  readonly tags = signal<string[]>([]);
  readonly newTag = signal<string>('');

  readonly price = signal<number>(199);
  readonly originalPrice = signal<number>(0);

  readonly categoryLabel = computed(() => {
    const c = this.catalog.getCategoryById(this.categoryId());
    return c ? `${c.icon} ${c.name}` : '—';
  });

  readonly fee = computed(() => Math.round(this.price() * 0.1));
  readonly earnings = computed(() => this.price() - this.fee());

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.file.set(input.files[0]);
      this.message.success('อัปโหลดไฟล์สำเร็จ');
    }
  }

  next(): void {
    this.step.update((s) => Math.min(4, s + 1));
  }
  prev(): void {
    this.step.update((s) => Math.max(1, s - 1));
  }

  addTag(): void {
    const t = this.newTag().trim();
    if (t && !this.tags().includes(t)) {
      this.tags.update((list) => [...list, t]);
    }
    this.newTag.set('');
  }
  removeTag(t: string): void {
    this.tags.update((list) => list.filter((x) => x !== t));
  }

  aiSuggest(kind: 'short' | 'long'): void {
    if (kind === 'short') {
      this.shortDescription.set(
        'สรุปเนื้อหาคุณภาพ ใช้ทบทวนได้ทันที พร้อมตัวอย่างแบบฝึกหัด',
      );
    } else {
      this.longDescription.set(
        'เอกสารฉบับนี้รวบรวมเนื้อหาที่จำเป็นและคัดเฉพาะส่วนที่ออกสอบบ่อยที่สุด พร้อมตัวอย่างประกอบและแบบฝึกหัด ช่วยให้ผู้อ่านเข้าใจเนื้อหาในเวลาอันรวดเร็ว เหมาะสำหรับนักเรียนและผู้ที่เตรียมสอบทุกระดับชั้น',
      );
    }
    this.message.success('AI ช่วยเขียนเสร็จแล้ว ลองปรับให้เป็นสไตล์คุณดูครับ');
  }

  submit(): void {
    this.message.success('ส่งเข้าพิจารณาเรียบร้อย — ทีมงานจะตอบกลับภายใน 24 ชม.');
    this.router.navigate(['/seller/documents']);
  }
}

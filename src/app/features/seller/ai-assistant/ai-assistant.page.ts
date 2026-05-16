import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-seller-ai',
  standalone: true,
  imports: [FormsModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-assistant.page.html',
  styleUrl: './ai-assistant.page.scss',
})
export class SellerAiAssistantPage {
  readonly seller = inject(SellerService);
  private readonly message = inject(NzMessageService);

  readonly tools = [
    { id: 'summary', icon: '📝', title: 'สรุปเนื้อหา 3 ข้อ', desc: 'AI สกัดสาระสำคัญ 3 ข้อจากเอกสาร แสดงในหน้ารายละเอียด' },
    { id: 'description', icon: '✍️', title: 'เขียนคำอธิบาย', desc: 'สร้างคำอธิบายสินค้าให้น่าสนใจ ดึงดูดผู้ซื้อ' },
    { id: 'tags', icon: '🏷️', title: 'แนะนำแท็ก & ราคา', desc: 'AI แนะนำแท็กและช่วงราคาที่เหมาะสมตามตลาด' },
  ];

  readonly tones = ['เป็นมิตร', 'มืออาชีพ', 'สนุกสนาน', 'จริงจัง'];

  readonly active = signal<string>('summary');
  readonly selectedDoc = signal<string>('');
  readonly content = signal<string>('');
  readonly tone = signal<string>('เป็นมิตร');
  readonly loading = signal<boolean>(false);
  readonly result = signal<string>('');

  constructor() {
    effect(() => {
      const hasSelection = !!this.selectedDoc();
      const first = this.seller.myDocuments()[0]?.id ?? '';
      if (!hasSelection && first) this.selectedDoc.set(first);
    });
  }

  generate(): void {
    void (async () => {
      const id = this.selectedDoc();
      if (!id) {
        // Load documents only when needed (avoid initial-load API call).
        if (this.seller.myDocuments().length === 0) {
          await this.seller.refreshDocuments();
        }
        const after = this.seller.myDocuments()[0]?.id ?? '';
        if (after) this.selectedDoc.set(after);

        this.message.error('กรุณาเลือกเอกสารก่อน');
        return;
      }
      this.loading.set(true);
      this.result.set('');
      try {
        const tool = this.active();
        const res = await this.seller.aiGenerate(id, tool);

        if (tool === 'tags') {
          const tags = (res.tags ?? []).filter(Boolean);
          const lines: string[] = [];
          if (tags.length) lines.push(`🏷️ แท็กแนะนำ:\n${tags.map((t) => `#${t}`).join(' ')}`);
          if (res.suggestedPrice != null) lines.push(`\n💰 ราคาที่แนะนำ: ฿${res.suggestedPrice}`);
          this.result.set(lines.join('\n').trim() || res.result || 'AI สร้างผลลัพธ์แล้ว');
        } else {
          this.result.set(res.result || 'AI สร้างผลลัพธ์แล้ว');
        }
      } catch {
        // SellerService already reported
      } finally {
        this.loading.set(false);
      }
    })();
  }

  copy(): void {
    navigator.clipboard?.writeText(this.result());
  }
}

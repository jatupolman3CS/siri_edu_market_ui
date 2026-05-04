import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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

  generate(): void {
    this.loading.set(true);
    this.result.set('');
    setTimeout(() => {
      this.loading.set(false);
      this.result.set(this.fakeResponse());
    }, 1400);
  }

  private fakeResponse(): string {
    switch (this.active()) {
      case 'summary':
        return `1. ครอบคลุมเนื้อหาคณิตศาสตร์ม.ปลาย 6 บทใหญ่ พร้อมตัวอย่างโจทย์ที่ออกสอบบ่อย

2. มีโจทย์ฝึก 120 ข้อ จัดเรียงตามระดับความยาก พร้อมเฉลยละเอียดทุกข้อ

3. รูปแบบเล่มออกแบบให้อ่านง่าย ตัวอักษรชัดเจน เหมาะสำหรับใช้ทบทวนก่อนสอบ A-Level / TGAT`;
      case 'description':
        return `📚 อยากเตรียมสอบให้พร้อมโดยไม่เสียเวลา? เอกสารชุดนี้รวมเนื้อหาที่ครูติวเตอร์มืออาชีพคัดมาให้แล้วทั้งหมด ครอบคลุมทุกบทที่ออกสอบบ่อย พร้อมแบบฝึกหัด 120 ข้อพร้อมเฉลย

✨ จุดเด่น:
- ใช้สีสันและภาพช่วยจำ — เห็นปั๊บเข้าใจปุ๊บ
- โจทย์ครอบคลุมตั้งแต่ระดับพื้นฐานจนถึงสนามสอบจริง
- ฟอนต์อ่านสบาย พิมพ์ลงกระดาษ A4 ก็สวย

ใช้สำหรับ: เตรียมสอบ A-Level, TGAT, มหิดล, จุฬา ฯลฯ`;
      case 'tags':
      default:
        return `🏷️ แท็กแนะนำ:
#คณิตม.ปลาย #ติวเข้ม #A-Level #TGAT #สรุปเนื้อหา #เตรียมสอบ #คณิตศาสตร์

💰 ช่วงราคาที่แนะนำ: ฿179–฿259
- ราคาเฉลี่ยในหมวดเดียวกัน: ฿199
- คู่แข่งช่วง 4.5★ ขึ้นไป: ฿229
- เริ่มต้นที่ ฿179 เพื่อเก็บรีวิว 5★ ก่อน แล้วค่อยปรับขึ้นเป็น ฿229`;
    }
  }

  copy(): void {
    navigator.clipboard?.writeText(this.result());
  }
}

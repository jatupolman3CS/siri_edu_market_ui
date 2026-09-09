import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { EXAM_COUNTDOWN_EXAM_TYPES, type ExamCountdownExamType } from '../../../core/models';
import { ExamCountdownService } from '../../../core/services';
import { IconComponent } from '../icon/icon.component';

/** 'yyyy-MM-dd' of the browser's local today — used as `<input type="date" [min]>` (§4). */
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * exam-countdown-mode v1 (docs/contracts/exam-countdown-mode.md §4) — the one set/edit/clear form,
 * reused both embedded on `/account` (always visible, id="exam-countdown" for `sectionNav`) and
 * inline on the homepage when the buyer clicks "ตั้งวันสอบ"/"แก้ไขวันสอบ"/"ตั้งวันสอบใหม่"
 * (`home.page.ts` toggles a local signal to mount/unmount this component).
 *
 * States:
 *  - `examCountdown.setting() === null` OR `editing()` → the actual form (select + date input).
 *  - `examCountdown.setting() !== null` and not `editing()` → a compact read-only status view +
 *    "แก้ไขวันสอบ" (→ `editing.set(true)`, prefilled) and "ล้างค่า" (confirm modal first, §0 ข้อ 10).
 *
 * Calls `loadSetting()` once on construction so the component is self-contained regardless of
 * which page mounts it (mirrors `ReferralCardComponent`/`PayoutAccountFormComponent`) — on the
 * homepage this duplicates the page's own `loadSetting()` call, which is harmless (idempotent GET).
 */
@Component({
  selector: 'app-exam-countdown-form',
  standalone: true,
  imports: [FormsModule, NzModalModule, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exam-countdown-form.component.html',
  styleUrl: './exam-countdown-form.component.scss',
})
export class ExamCountdownFormComponent {
  readonly examCountdown = inject(ExamCountdownService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);

  readonly examTypes = EXAM_COUNTDOWN_EXAM_TYPES;
  readonly todayIso = todayIso();

  readonly editing = signal(false);
  readonly formExamType = signal<ExamCountdownExamType | ''>('');
  readonly formExamDate = signal('');
  readonly saveError = signal<string | null>(null);

  /** True while a save is in flight — guards the "บันทึก" button against double-submits. */
  readonly saving = computed(() => this.examCountdown.state().status === 'loading');

  readonly showForm = computed(() => !this.examCountdown.setting() || this.editing());

  /** Emits after a successful save or a confirmed clear — the homepage uses this to collapse the inline form. */
  readonly saved = output<void>();

  constructor() {
    void this.examCountdown.loadSetting();
  }

  startEdit(): void {
    const current = this.examCountdown.setting();
    this.formExamType.set(current?.examType ?? '');
    this.formExamDate.set(current?.examDate ?? '');
    this.saveError.set(null);
    this.editing.set(true);
  }

  async submit(): Promise<void> {
    this.saveError.set(null);
    const examType = this.formExamType();
    const examDate = this.formExamDate();
    if (!examType || !examDate) {
      this.saveError.set('กรุณาเลือกประเภทสอบและวันสอบ');
      return;
    }

    const result = await this.examCountdown.saveSetting(examType, examDate);
    if (result.ok) {
      this.message.success('บันทึกโหมดใกล้สอบเรียบร้อย');
      this.editing.set(false);
      this.saved.emit();
      return;
    }
    this.saveError.set(result.error ?? 'บันทึกโหมดใกล้สอบไม่สำเร็จ');
  }

  confirmClear(): void {
    this.modal.confirm({
      nzTitle: 'ล้างการตั้งค่าโหมดใกล้สอบ?',
      nzContent: 'ต้องตั้งวันสอบใหม่ทั้งหมดถ้าต้องการใช้โหมดนี้อีกครั้ง',
      nzOkText: 'ล้างค่า',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.doClear(),
    });
  }

  private async doClear(): Promise<void> {
    await this.examCountdown.clearSetting();
    this.message.success('ล้างค่าโหมดใกล้สอบแล้ว');
    this.editing.set(false);
    this.formExamType.set('');
    this.formExamDate.set('');
    this.saved.emit();
  }
}

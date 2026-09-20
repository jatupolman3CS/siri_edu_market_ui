import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { EXAM_COUNTDOWN_EXAM_TYPES, type ExamCountdownExamType } from '../../../core/models';
import { ExamCountdownService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

/** 'yyyy-MM-dd' of the browser's local today — used as `<input type="date" [min]>` (§4). */
function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

@Component({
  selector: 'app-exam-countdown-form',
  standalone: true,
  imports: [FormsModule, NzModalModule, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exam-countdown-form.component.html',
  styleUrl: './exam-countdown-form.component.scss',
})
export class ExamCountdownFormComponent {
  readonly examCountdown = inject(ExamCountdownService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  readonly translation = inject(TranslationService);

  readonly examTypes = EXAM_COUNTDOWN_EXAM_TYPES;
  readonly todayIso = todayIso();

  readonly editing = signal(false);
  readonly formExamType = signal<ExamCountdownExamType | ''>('');
  readonly formExamDate = signal('');
  readonly saveError = signal<string | null>(null);

  readonly saving = computed(() => this.examCountdown.state().status === 'loading');
  readonly showForm = computed(() => !this.examCountdown.setting() || this.editing());
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
      this.saveError.set(this.translation.t('shared.examCountdown.validationRequired'));
      return;
    }

    const result = await this.examCountdown.saveSetting(examType, examDate);
    if (result.ok) {
      this.message.success(this.translation.t('shared.examCountdown.savedSuccess'));
      this.editing.set(false);
      this.saved.emit();
      return;
    }
    this.saveError.set(result.error ?? this.translation.t('shared.examCountdown.savedFailed'));
  }

  confirmClear(): void {
    this.modal.confirm({
      nzTitle: this.translation.t('shared.examCountdown.confirmTitle'),
      nzContent: this.translation.t('shared.examCountdown.confirmContent'),
      nzOkText: this.translation.t('shared.examCountdown.clear'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel'),
      nzOnOk: () => this.doClear(),
    });
  }

  private async doClear(): Promise<void> {
    await this.examCountdown.clearSetting();
    this.message.success(this.translation.t('shared.examCountdown.clearedSuccess'));
    this.editing.set(false);
    this.formExamType.set('');
    this.formExamDate.set('');
    this.saved.emit();
  }
}

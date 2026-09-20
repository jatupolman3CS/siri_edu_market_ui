import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { ExamHubService, type UpdateExamHubPageInput } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import type { ExamHubType } from '../../../core/models';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * exam-hub-landing-pages v1 (docs/contracts/exam-hub-landing-pages.md §4, §6)
 * Admin CMS management for 4 fixed Exam Hub pages.
 */
@Component({
  selector: 'app-exam-hub-admin-page',
  standalone: true,
  imports: [FormsModule, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './exam-hub-admin.page.html',
  styleUrl: './exam-hub-admin.page.scss',
})
export class ExamHubAdminPage implements OnInit {
  readonly examHub = inject(ExamHubService);
  private readonly message = inject(NzMessageService);
  private readonly translation = inject(TranslationService);

  readonly selectedExamType = signal<ExamHubType>('tcas');
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly examTypes: { value: ExamHubType; label: string }[] = [
    { value: 'tcas', label: 'TCAS' },
    { value: 'tgat-tpat', label: 'TGAT/TPAT' },
    { value: 'a-level', label: 'A-Level' },
    { value: 'onet', label: 'O-NET' },
  ];

  readonly form = signal<UpdateExamHubPageInput>({
    title: '',
    metaDescription: '',
    introText: '',
    examDateInfo: '',
    scoreCriteriaInfo: '',
    trendInfo: '',
  });

  async ngOnInit(): Promise<void> {
    await this.loadCurrentPage();
  }

  async onExamTypeChange(type: ExamHubType): Promise<void> {
    this.selectedExamType.set(type);
    await this.loadCurrentPage();
  }

  async loadCurrentPage(): Promise<void> {
    this.loading.set(true);
    try {
      await this.examHub.loadPage(this.selectedExamType());
      const p = this.examHub.page();
      if (p) {
        this.form.set({
          title: p.title ?? '',
          metaDescription: p.metaDescription ?? '',
          introText: p.introText ?? '',
          examDateInfo: p.examDateInfo ?? '',
          scoreCriteriaInfo: p.scoreCriteriaInfo ?? '',
          trendInfo: p.trendInfo ?? '',
        });
      }
    } finally {
      this.loading.set(false);
    }
  }

  patch(key: keyof UpdateExamHubPageInput, value: string): void {
    this.form.update((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      await this.examHub.updatePage(this.selectedExamType(), this.form());
      this.message.success(this.translation.t('examHub.saveSuccess'));
    } catch {
      this.message.error(this.translation.t('examHub.saveFailed'));
    } finally {
      this.saving.set(false);
    }
  }
}

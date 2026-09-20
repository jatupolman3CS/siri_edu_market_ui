import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AuthService, CatalogService } from '../../../core/services';
import { TranslationService } from '../../../core/i18n/translation.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-report-document',
  standalone: true,
  imports: [FormsModule, NzModalModule, IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-document.component.html',
})
export class ReportDocumentComponent {
  private readonly catalog = inject(CatalogService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);
  readonly translation = inject(TranslationService);

  readonly documentId = input.required<string>();

  readonly open = signal(false);
  readonly sending = signal(false);
  readonly sent = signal(false);

  category = 'copyright';
  details = '';

  readonly categories = computed(() => [
    { value: 'copyright', label: this.translation.t('shared.reportDocument.categories.copyright') },
    { value: 'inappropriate', label: this.translation.t('shared.reportDocument.categories.inappropriate') },
    { value: 'inaccurate', label: this.translation.t('shared.reportDocument.categories.inaccurate') },
    { value: 'other', label: this.translation.t('shared.reportDocument.categories.other') },
  ]);

  start(): void {
    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/document/${this.documentId()}` },
      });
      return;
    }
    this.category = 'copyright';
    this.details = '';
    this.open.set(true);
  }

  cancel(): void {
    this.open.set(false);
  }

  async submit(): Promise<void> {
    const details = this.details.trim();
    if (details.length === 0) {
      this.message.warning(this.translation.t('shared.reportDocument.describeRequired'));
      return;
    }
    if (this.sending()) return;

    this.sending.set(true);
    try {
      await this.catalog.reportDocument(this.documentId(), this.category, details);
      this.open.set(false);
      this.sent.set(true);
      this.message.success(this.translation.t('shared.reportDocument.submittedSuccess'));
    } catch (e) {
      const status = (e as { status?: number; statusCode?: number } | null)?.status
        ?? (e as { statusCode?: number } | null)?.statusCode;
      if (status === 409) {
        this.open.set(false);
        this.sent.set(true);
        this.message.info(this.translation.t('shared.reportDocument.alreadyReportedInfo'));
      } else {
        this.message.error(this.translation.t('shared.reportDocument.submitFailed'));
      }
    } finally {
      this.sending.set(false);
    }
  }
}

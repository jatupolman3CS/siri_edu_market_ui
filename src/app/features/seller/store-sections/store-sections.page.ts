import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import type { StoreSectionResponse } from '../../../core/api';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { SellerService } from '../../../core/services';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';

/**
 * GAP-07: arranging the storefront. STORE_SECTION and STORE_SECTION_ITEM were seeded but
 * had no API, so every seller's storefront looked identical and the section list on the
 * public profile was always empty.
 */
@Component({
  selector: 'app-seller-store-sections',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, EmptyStateComponent, IconComponent, NzModalModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './store-sections.page.html',
})
export class SellerStoreSectionsPage {
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly translation = inject(TranslationService);
  readonly seller = inject(SellerService);

  readonly sections = signal<StoreSectionResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);

  /** Section being edited; null while creating a new one. */
  readonly editingId = signal<string | null>(null);
  readonly formOpen = signal<boolean>(false);
  readonly name = signal<string>('');
  readonly sortOrder = signal<number>(0);
  readonly selectedDocumentIds = signal<string[]>([]);

  /** The seller's own documents, used to choose what to pin. */
  readonly documents = computed(() => this.seller.myDocuments());

  constructor() {
    void this.reload();
    void this.seller.refreshDocuments();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.sections.set(await this.seller.listStoreSections());
    } catch (e) {
      this.apiFail.report(this.translation.t('seller.sectionsMgmt.errLoad'), e);
      this.sections.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  startCreate(): void {
    this.editingId.set(null);
    this.name.set('');
    this.sortOrder.set(this.sections().length);
    this.selectedDocumentIds.set([]);
    this.formOpen.set(true);
  }

  startEdit(section: StoreSectionResponse): void {
    this.editingId.set(section.id ?? null);
    this.name.set(section.name ?? '');
    this.sortOrder.set(section.sortOrder ?? 0);
    this.selectedDocumentIds.set([...(section.documentIds ?? [])]);
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.name.set('');
    this.selectedDocumentIds.set([]);
  }

  isSelected(documentId: string): boolean {
    return this.selectedDocumentIds().includes(documentId);
  }

  toggleDocument(documentId: string): void {
    this.selectedDocumentIds.update((ids) =>
      ids.includes(documentId) ? ids.filter((id) => id !== documentId) : [...ids, documentId],
    );
  }

  /** Title lookup so a saved section can list what is pinned to it. */
  documentTitle(documentId: string): string {
    return this.documents().find((d) => d.id === documentId)?.title ?? documentId;
  }

  async save(): Promise<void> {
    const name = this.name().trim();
    if (!name) {
      this.message.warning(this.translation.t('seller.sectionsMgmt.missingName'));
      return;
    }
    if (this.saving()) return;

    this.saving.set(true);
    try {
      const body = {
        name,
        sortOrder: this.sortOrder(),
        documentIds: this.selectedDocumentIds(),
      };

      await this.seller.saveStoreSection(this.editingId(), body);

      this.message.success(this.translation.t('seller.sectionsMgmt.saveSuccess'));
      this.cancel();
      await this.reload();
    } catch (e) {
      this.apiFail.report(this.translation.t('seller.sectionsMgmt.errSave'), e);
    } finally {
      this.saving.set(false);
    }
  }

  confirmRemove(section: StoreSectionResponse): void {
    if (this.saving() || !section.id) return;
    this.modal.confirm({
      nzTitle: this.translation.t('seller.sectionsMgmt.confirmDeleteTitle'),
      nzContent: this.translation.t('seller.sectionsMgmt.confirmDeleteContent', { name: section.name ?? '' }),
      nzOkText: this.translation.t('common.delete'),
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel'),
      nzOnOk: () => this.remove(section.id!),
    });
  }

  private async remove(sectionId: string): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await this.seller.deleteStoreSection(sectionId);
      this.message.success(this.translation.t('seller.sectionsMgmt.deleteSuccess'));
      await this.reload();
    } catch (e) {
      this.apiFail.report(this.translation.t('seller.sectionsMgmt.errDelete'), e);
    } finally {
      this.saving.set(false);
    }
  }
}

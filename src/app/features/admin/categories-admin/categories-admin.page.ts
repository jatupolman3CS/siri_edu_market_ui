import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { AdminService, CatalogService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from '../../../core/services/action-state';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import type { Category, SubcategoryAdmin } from '../../../core/models';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/** Subcategory being deleted while `subcategoryState()` is holding a 409 — see confirmDeleteSubcategory. */
interface DeleteConflict {
  categoryId: string;
  subcategory: SubcategoryAdmin;
}

/**
 * subscription-membership v2 §3.1: the monthly price is optional — an empty box means "this
 * category is not open for subscription yet" and is sent as an explicit `null`; anything else must
 * parse to a non-negative number.
 *
 * F-01 note: the previous `prompt()` flow had a third state — Cancel returned `null` and the field
 * was dropped from the request entirely, intended to read as "leave the current price alone". The
 * modal has no per-field cancel (cancelling closes the whole form without sending anything), so
 * the price is now always sent explicitly. That also matches what the API really does: the update
 * endpoint assigns `SubscriptionMonthlyPrice` unconditionally, so an omitted field used to *clear*
 * the price rather than preserve it.
 */
function parseSubscriptionPriceInput(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return { ok: false };
  return { ok: true, value: parsed };
}

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [
    FormsModule,
    NzModalModule,
    NzSwitchModule,
    IconComponent,
    PaginationComponent,
    CompactPipe,
    ThbPipe,
    TranslatePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories-admin.page.html',
  styleUrl: './categories-admin.page.scss',
})
export class AdminCategoriesPage {
  readonly admin = inject(AdminService);
  private readonly catalog = inject(CatalogService);
  private readonly message = inject(NzMessageService);
  private readonly modal = inject(NzModalService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly translation = inject(TranslationService);

  readonly page = signal(1);
  readonly pageSize = signal(10);

  readonly pagedCategories = computed(() => {
    const list = this.admin.adminCategories();
    const start = (this.page() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  onPageChange(next: number): void {
    this.page.set(next);
  }

  onPageSizeChange(newSize: number): void {
    this.pageSize.set(newSize);
    this.page.set(1);
  }

  constructor() {
    void this.admin.refreshAdminCategories();
  }

  // ========== Category create/edit form (F-01) ==========
  // One `nz-modal` form drives both create and edit, mirroring the subcategory form further down
  // this file and the announcements admin page. It replaces the old `window.prompt()` chain — the
  // request payloads built below are exactly the ones that flow produced, only the input surface
  // changed.

  readonly categoryFormOpen = signal<boolean>(false);
  /**
   * Category being edited, or `null` for create mode. Also the source of the fields the form does
   * not expose (icon / color / description), which the update payload has always echoed back.
   */
  readonly editingCategory = signal<Category | null>(null);
  readonly catSaving = signal<boolean>(false);
  readonly catName = signal<string>('');
  readonly catSlug = signal<string>('');
  /** Raw text, so an empty box ("close for subscription") stays distinguishable from "0". */
  readonly catPrice = signal<string>('');

  readonly catNameError = computed(() =>
    this.catName().trim() ? '' : this.translation.t('admin.categories.nameRequired'),
  );
  readonly catPriceError = computed(() =>
    parseSubscriptionPriceInput(this.catPrice()).ok
      ? ''
      : this.translation.t('admin.categories.priceInvalid'),
  );
  readonly categoryFormValid = computed(() => !this.catNameError() && !this.catPriceError());

  openCreateCategory(): void {
    this.editingCategory.set(null);
    this.catName.set('');
    this.catSlug.set('');
    this.catPrice.set('');
    this.categoryFormOpen.set(true);
  }

  openEditCategory(c: Category): void {
    this.editingCategory.set(c);
    this.catName.set(c.name);
    this.catSlug.set(c.slug);
    this.catPrice.set(c.subscriptionMonthlyPrice != null ? String(c.subscriptionMonthlyPrice) : '');
    this.categoryFormOpen.set(true);
  }

  /**
   * Cancel / dismiss — closes the form and does nothing else: no request, no toast, no reload.
   * This is the `prompt()`-returned-`null` behaviour the old flow had on Cancel, now applied to
   * the form as a whole (a modal has no per-field cancel).
   */
  closeCategoryForm(): void {
    this.categoryFormOpen.set(false);
    this.editingCategory.set(null);
  }

  async saveCategory(): Promise<void> {
    if (this.catSaving()) return;

    const name = this.catName().trim();
    if (!name) {
      this.message.warning(this.translation.t('admin.categories.nameRequired'));
      return;
    }
    const priceInput = parseSubscriptionPriceInput(this.catPrice());
    if (!priceInput.ok) {
      this.message.warning(this.translation.t('admin.categories.priceInvalid'));
      return;
    }

    const slug = this.catSlug().trim();
    const editing = this.editingCategory();
    this.catSaving.set(true);
    try {
      if (editing) {
        await this.admin.updateCategory(editing.id, {
          name,
          slug: slug || undefined,
          icon: editing.icon,
          color: editing.color,
          description: editing.description,
          isActive: true,
          sortOrder: 0,
          subscriptionMonthlyPrice: priceInput.value,
        });
        this.catalog.loadCategories();
        this.message.success(this.translation.t('admin.categories.updateSuccess'));
      } else {
        await this.admin.createCategory({
          id: crypto.randomUUID(),
          name,
          slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
          icon: '📚',
          description: '',
          isActive: true,
          sortOrder: 0,
          subscriptionMonthlyPrice: priceInput.value,
        });
        this.catalog.loadCategories();
        this.message.success(this.translation.t('admin.categories.createSuccess'));
      }
      this.closeCategoryForm();
    } catch {
      // Create failures are already reported by AdminService's ApiFailureReporter; the edit path
      // has always added its own toast on top of that. The form stays open so the admin can retry.
      if (editing) this.message.error(this.translation.t('admin.categories.updateFailed'));
    } finally {
      this.catSaving.set(false);
    }
  }

  removeCategory(c: Category): void {
    this.modal.confirm({
      nzTitle: this.translation.t('admin.categories.confirmDeleteTitle'),
      nzContent: `ลบหมวด "${c.name}" ?`,
      nzOkText: this.translation.t('common.delete') || 'ลบ',
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel') || 'ยกเลิก',
      nzOnOk: () => this.doRemoveCategory(c),
    });
  }

  private async doRemoveCategory(c: Category): Promise<void> {
    try {
      await this.admin.deleteCategory(c.id);
      this.catalog.loadCategories();
      this.message.success(this.translation.t('admin.categories.deleteSuccess'));
    } catch {
      /* ApiFailureReporter ใน AdminService */
    }
  }

  // ========== Subcategory admin (subcategory-admin-crud v1) ==========
  // Backend endpoints do not exist yet — AdminService's 5 subcategory methods are stubs
  // (docs/contracts/subcategory-admin-crud.md §4). This section is UI/state wiring only.

  /** Only one category's subcategories are shown at a time. */
  readonly expandedCategoryId = signal<string | null>(null);
  /** Cache per category id — lazy-loaded on first expand, never refetched unless forced. */
  readonly subcategories = signal<Record<string, SubcategoryAdmin[]>>({});
  readonly subcategoryState = signal<ActionState>(idleActionState());
  readonly subcategoryLoading = computed(() => this.subcategoryState().status === 'loading');
  readonly subcategoryErrorMessage = computed(() => {
    const state = this.subcategoryState();
    return state.status === 'error' ? state.message : '';
  });
  /** Set when a DELETE came back 409 — drives the "ปิดใช้งานแทน" shortcut. */
  readonly deleteConflict = signal<DeleteConflict | null>(null);

  // Form (shared for create + edit; opened via openCreateSubcategory / openEditSubcategory).
  readonly subcategoryFormOpen = signal<boolean>(false);
  readonly subcategoryFormCategoryId = signal<string | null>(null);
  readonly subcategoryFormCategoryName = signal<string>('');
  readonly editingSubcategoryId = signal<string | null>(null);
  readonly subSaving = signal<boolean>(false);
  readonly subId = signal<string>('');
  readonly subName = signal<string>('');
  readonly subSlug = signal<string>('');
  readonly subIcon = signal<string>('');
  readonly subSortOrder = signal<number>(0);
  readonly subIsActive = signal<boolean>(true);

  toggleExpand(category: Category): void {
    if (this.expandedCategoryId() === category.id) {
      this.expandedCategoryId.set(null);
      return;
    }
    this.expandedCategoryId.set(category.id);
    this.deleteConflict.set(null);
    this.subcategoryState.set(idleActionState());
    if (!this.subcategories()[category.id]) {
      void this.loadSubcategories(category.id);
    }
  }

  private async loadSubcategories(categoryId: string): Promise<void> {
    this.subcategoryState.set(loadingActionState());
    try {
      const list = await this.admin.listSubcategories(categoryId);
      this.subcategories.update((rec) => ({ ...rec, [categoryId]: list }));
      this.subcategoryState.set(idleActionState());
    } catch (e) {
      this.apiFail.report('errors.context.loadSubcategories', e);
      this.subcategoryState.set(idleActionState());
    }
  }

  openCreateSubcategory(category: Category): void {
    this.subcategoryFormCategoryId.set(category.id);
    this.subcategoryFormCategoryName.set(category.name);
    this.editingSubcategoryId.set(null);
    this.subId.set('');
    this.subName.set('');
    this.subSlug.set('');
    this.subIcon.set('');
    this.subSortOrder.set(0);
    this.subIsActive.set(true);
    this.deleteConflict.set(null);
    this.subcategoryFormOpen.set(true);
  }

  openEditSubcategory(category: Category, sub: SubcategoryAdmin): void {
    this.subcategoryFormCategoryId.set(category.id);
    this.subcategoryFormCategoryName.set(category.name);
    this.editingSubcategoryId.set(sub.id);
    this.subId.set(sub.id);
    this.subName.set(sub.name);
    this.subSlug.set(sub.slug);
    this.subIcon.set(sub.icon);
    this.subSortOrder.set(sub.sortOrder);
    this.subIsActive.set(sub.isActive);
    this.deleteConflict.set(null);
    this.subcategoryFormOpen.set(true);
  }

  closeSubcategoryForm(): void {
    this.subcategoryFormOpen.set(false);
    this.editingSubcategoryId.set(null);
  }

  async saveSubcategory(): Promise<void> {
    const categoryId = this.subcategoryFormCategoryId();
    if (!categoryId || this.subSaving()) return;

    const name = this.subName().trim();
    if (!name) {
      this.message.warning(this.translation.t('admin.categories.subNameRequired'));
      return;
    }
    const editingId = this.editingSubcategoryId();
    if (!editingId && !this.subId().trim()) {
      this.message.warning(this.translation.t('admin.categories.subIdRequired'));
      return;
    }

    this.subSaving.set(true);
    try {
      if (editingId) {
        await this.admin.updateSubcategory(categoryId, editingId, {
          name,
          slug: this.subSlug().trim(),
          icon: this.subIcon().trim(),
          isActive: this.subIsActive(),
          sortOrder: this.subSortOrder(),
        });
        this.message.success(this.translation.t('admin.categories.subSaveSuccess'));
      } else {
        await this.admin.createSubcategory(categoryId, {
          id: this.subId().trim(),
          name,
          slug: this.subSlug().trim(),
          icon: this.subIcon().trim(),
          isActive: this.subIsActive(),
          sortOrder: this.subSortOrder(),
        });
        this.message.success(this.translation.t('admin.categories.subCreateSuccess'));
      }
      this.closeSubcategoryForm();
      await this.loadSubcategories(categoryId);
    } catch (e) {
      this.apiFail.report('errors.context.saveSubcategory', e);
    } finally {
      this.subSaving.set(false);
    }
  }

  confirmDeleteSubcategory(categoryId: string, sub: SubcategoryAdmin): void {
    this.modal.confirm({
      nzTitle: this.translation.t('admin.categories.confirmDeleteSubTitle'),
      nzContent: `ยืนยันลบหมวดย่อย "${sub.name}" หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`,
      nzOkText: this.translation.t('common.delete') || 'ลบ',
      nzOkDanger: true,
      nzCancelText: this.translation.t('common.cancel') || 'ยกเลิก',
      nzOnOk: () => this.deleteSubcategory(categoryId, sub),
    });
  }

  private async deleteSubcategory(categoryId: string, sub: SubcategoryAdmin): Promise<void> {
    this.deleteConflict.set(null);
    this.subcategoryState.set(loadingActionState());
    try {
      await this.admin.deleteSubcategory(categoryId, sub.id);
      this.message.success(this.translation.t('admin.categories.subDeleteSuccess'));
      this.subcategoryState.set(idleActionState());
      await this.loadSubcategories(categoryId);
    } catch (e) {
      // AC-14 / spec §4: show the server's own Thai message verbatim (409 body is plain text),
      // never a generic fallback — and offer the "disable instead" shortcut the spec recommends.
      const detail = this.apiFail.formatDetail(e);
      this.deleteConflict.set({ categoryId, subcategory: sub });
      this.subcategoryState.set(errorActionState(detail));
    }
  }

  async disableInsteadOfDelete(): Promise<void> {
    const conflict = this.deleteConflict();
    if (!conflict) return;

    this.subcategoryState.set(loadingActionState());
    try {
      await this.admin.updateSubcategory(conflict.categoryId, conflict.subcategory.id, {
        name: conflict.subcategory.name,
        slug: conflict.subcategory.slug,
        icon: conflict.subcategory.icon,
        isActive: false,
        sortOrder: conflict.subcategory.sortOrder,
      });
      this.message.success(this.translation.t('admin.categories.subSaveSuccess'));
      this.deleteConflict.set(null);
      this.subcategoryState.set(idleActionState());
      await this.loadSubcategories(conflict.categoryId);
    } catch (e) {
      this.apiFail.report('errors.context.saveSubcategory', e);
      this.subcategoryState.set(idleActionState());
    }
  }
}

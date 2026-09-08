import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalModule, NzModalService } from 'ng-zorro-antd/modal';
import { NzSwitchModule } from 'ng-zorro-antd/switch';
import { AdminService, CatalogService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import {
  errorActionState,
  idleActionState,
  loadingActionState,
  type ActionState,
} from '../../../core/services/action-state';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import type { Category, SubcategoryAdmin } from '../../../core/models';

/** Subcategory being deleted while `subcategoryState()` is holding a 409 — see confirmDeleteSubcategory. */
interface DeleteConflict {
  categoryId: string;
  subcategory: SubcategoryAdmin;
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

  async addCategory(): Promise<void> {
    const name = prompt('ชื่อหมวดหมู่')?.trim();
    if (!name) return;
    const slug = prompt('Slug (เว้นว่างได้ — จะใช้จากชื่อ)', '')?.trim();
    try {
      await this.admin.createCategory({
        id: crypto.randomUUID(),
        name,
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
        icon: '📚',
        description: '',
        isActive: true,
        sortOrder: 0,
      });
      this.catalog.loadCategories();
      this.message.success('เพิ่มหมวดหมู่แล้ว');
    } catch {
      /* ApiFailureReporter ใน AdminService */
    }
  }

  async editCategory(c: Category): Promise<void> {
    const name = prompt('ชื่อหมวดหมู่', c.name)?.trim();
    if (!name) return;
    const slug = prompt('Slug', c.slug)?.trim();
    try {
      await this.admin.updateCategory(c.id, {
        name,
        slug: slug || undefined,
        icon: c.icon,
        color: c.color,
        description: c.description,
        isActive: true,
        sortOrder: 0,
      });
      this.catalog.loadCategories();
      this.message.success('อัปเดตหมวดหมู่แล้ว');
    } catch {
      this.message.error('อัปเดตไม่สำเร็จ');
    }
  }

  removeCategory(c: Category): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันลบหมวดหมู่',
      nzContent: `ลบหมวด "${c.name}" ?`,
      nzOkText: 'ลบ',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.doRemoveCategory(c),
    });
  }

  private async doRemoveCategory(c: Category): Promise<void> {
    try {
      await this.admin.deleteCategory(c.id);
      this.catalog.loadCategories();
      this.message.success('ลบหมวดหมู่แล้ว');
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
      this.apiFail.report('โหลดหมวดย่อย', e);
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
      this.message.warning('กรุณาตั้งชื่อหมวดย่อย');
      return;
    }
    const editingId = this.editingSubcategoryId();
    if (!editingId && !this.subId().trim()) {
      this.message.warning('กรุณากรอกรหัส (id)');
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
        this.message.success('บันทึกหมวดย่อยเรียบร้อย');
      } else {
        await this.admin.createSubcategory(categoryId, {
          id: this.subId().trim(),
          name,
          slug: this.subSlug().trim(),
          icon: this.subIcon().trim(),
          isActive: this.subIsActive(),
          sortOrder: this.subSortOrder(),
        });
        this.message.success('เพิ่มหมวดย่อยเรียบร้อย');
      }
      this.closeSubcategoryForm();
      await this.loadSubcategories(categoryId);
    } catch (e) {
      this.apiFail.report('ดำเนินการกับหมวดย่อยไม่สำเร็จ', e);
    } finally {
      this.subSaving.set(false);
    }
  }

  confirmDeleteSubcategory(categoryId: string, sub: SubcategoryAdmin): void {
    this.modal.confirm({
      nzTitle: 'ยืนยันลบหมวดย่อย',
      nzContent: `ยืนยันลบหมวดย่อย "${sub.name}" หรือไม่? การกระทำนี้ย้อนกลับไม่ได้`,
      nzOkText: 'ลบ',
      nzOkDanger: true,
      nzCancelText: 'ยกเลิก',
      nzOnOk: () => this.deleteSubcategory(categoryId, sub),
    });
  }

  private async deleteSubcategory(categoryId: string, sub: SubcategoryAdmin): Promise<void> {
    this.deleteConflict.set(null);
    this.subcategoryState.set(loadingActionState());
    try {
      await this.admin.deleteSubcategory(categoryId, sub.id);
      this.message.success('ลบหมวดย่อยเรียบร้อย');
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
      this.message.success('บันทึกหมวดย่อยเรียบร้อย');
      this.deleteConflict.set(null);
      this.subcategoryState.set(idleActionState());
      await this.loadSubcategories(conflict.categoryId);
    } catch (e) {
      this.apiFail.report('ดำเนินการกับหมวดย่อยไม่สำเร็จ', e);
      this.subcategoryState.set(idleActionState());
    }
  }
}

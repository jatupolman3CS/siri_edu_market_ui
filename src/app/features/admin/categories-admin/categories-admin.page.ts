import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { AdminService, CatalogService } from '../../../core/services';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import type { Category } from '../../../core/models';

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [IconComponent, CompactPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './categories-admin.page.html',
  styleUrl: './categories-admin.page.scss',
})
export class AdminCategoriesPage {
  readonly admin = inject(AdminService);
  private readonly catalog = inject(CatalogService);
  private readonly message = inject(NzMessageService);

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

  async removeCategory(c: Category): Promise<void> {
    if (!confirm(`ลบหมวด "${c.name}" ?`)) return;
    try {
      await this.admin.deleteCategory(c.id);
      this.catalog.loadCategories();
      this.message.success('ลบหมวดหมู่แล้ว');
    } catch {
      /* ApiFailureReporter ใน AdminService */
    }
  }
}

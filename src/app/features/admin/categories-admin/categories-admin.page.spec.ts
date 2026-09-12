import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AdminCategoriesPage } from './categories-admin.page';
import { AdminService } from '../../../core/services/admin.service';
import type { Category, SubcategoryAdmin } from '../../../core/models';

/**
 * subcategory-admin-crud v1 (docs/contracts/subcategory-admin-crud.md §4).
 *
 * These specs drive the page against a stubbed `AdminService` (via `vi.spyOn`) rather than a
 * stubbed `fetch`, to keep this a unit test of the page's state/wiring — `AdminService`'s own
 * spec / integration coverage is where the real SDK calls (now wired to the 5 subcategory
 * endpoints) get exercised. `GET /api/admin/categories` is real (through the existing
 * `refreshAdminCategories`), so that one still goes through a stubbed `fetch`.
 */
type Route = { status?: number; body: unknown };

let routes: Map<string, Route>;
let realFetch: typeof globalThis.fetch;
let messages: { success: string[]; warning: string[]; error: string[] };

function jsonResponse(body: unknown, status = 200): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubRoute(method: string, path: string, body: unknown, status = 200): void {
  routes.set(`${method.toUpperCase()} ${path}`, { body, status });
}

function category(id: string, name = `หมวด ${id}`) {
  return {
    id,
    name,
    slug: id,
    icon: '📚',
    color: '#F9A8D4',
    description: '',
    isActive: true,
    sortOrder: 0,
    documentCount: 0,
  };
}

function categoryModel(id: string, name: string): Category {
  return { id, name, slug: id, icon: '📚', color: '#F9A8D4', description: '', documentCount: 0 };
}

function subcategory(id: string, categoryId: string, overrides: Partial<SubcategoryAdmin> = {}): SubcategoryAdmin {
  return {
    id,
    categoryId,
    name: `หมวดย่อย ${id}`,
    slug: id,
    icon: '📄',
    isActive: true,
    sortOrder: 0,
    documentCount: 0,
    ...overrides,
  };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function renderPage() {
  TestBed.configureTestingModule({
    imports: [AdminCategoriesPage],
    providers: [
      {
        provide: NzMessageService,
        useValue: {
          success: (m: string) => messages.success.push(m),
          warning: (m: string) => messages.warning.push(m),
          error: (m: string) => messages.error.push(m),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(AdminCategoriesPage);
  fixture.detectChanges();
  return fixture;
}

/**
 * `NzModalModule` registers its own (non-`providedIn: 'root'`) `NzModalService` provider, which
 * the component resolves from its *own* element injector — a level below `TestBed.inject()`,
 * which resolves from the outer testing-module injector and would return a different instance.
 * `fixture.debugElement.injector` walks the same hierarchy the component itself uses, so this
 * spies on the one the page actually calls. Simulates a click on the dialog's "Ok" button by
 * invoking `nzOnOk` synchronously.
 */
function autoConfirmModal(fixture: { debugElement: { injector: { get: typeof TestBed.inject } } }): void {
  const modal = fixture.debugElement.injector.get(NzModalService);
  vi.spyOn(modal, 'confirm').mockImplementation((...args: Parameters<typeof modal.confirm>) => {
    const options = args[0] as { nzOnOk?: () => unknown } | undefined;
    void options?.nzOnOk?.();
    return {} as ReturnType<typeof modal.confirm>;
  });
}

beforeEach(() => {
  routes = new Map();
  messages = { success: [], warning: [], error: [] };
  realFetch = globalThis.fetch;

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const path = url.pathname;
    const route = routes.get(`${request.method} ${path}`);
    if (!route) return jsonResponse([], 200);
    return jsonResponse(route.body, route.status ?? 200);
  }) as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  TestBed.resetTestingModule();
});

describe('AdminCategoriesPage — subcategory admin (subcategory-admin-crud v1)', () => {
  it('does not fetch subcategories for a category until its row is expanded', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();

    const admin = TestBed.inject(AdminService);
    const listSpy = vi.spyOn(admin, 'listSubcategories').mockResolvedValue([]);

    expect(listSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.subcategories()['cat-1']).toBeUndefined();
  });

  it('loads and caches the subcategory list on first expand, and does not refetch on the next', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const listSpy = vi
      .spyOn(admin, 'listSubcategories')
      .mockResolvedValue([subcategory('sub-1', 'cat-1')]);

    page.toggleExpand(categoryModel('cat-1', 'หมวด cat-1'));
    await settle();

    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(listSpy).toHaveBeenCalledWith('cat-1');
    expect(page.subcategories()['cat-1']?.length).toBe(1);
    expect(page.expandedCategoryId()).toBe('cat-1');

    // Collapse then re-expand — cached, so no second fetch.
    page.toggleExpand(categoryModel('cat-1', 'หมวด cat-1'));
    page.toggleExpand(categoryModel('cat-1', 'หมวด cat-1'));
    await settle();

    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  it('creates a subcategory through admin.createSubcategory and refreshes the list', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const listSpy = vi.spyOn(admin, 'listSubcategories').mockResolvedValue([]);
    const createSpy = vi.spyOn(admin, 'createSubcategory').mockResolvedValue(null);

    page.openCreateSubcategory(categoryModel('cat-1', 'คณิตศาสตร์'));
    page.subId.set('math-midterm');
    page.subName.set('กลางภาค');
    page.subSlug.set('');
    page.subSortOrder.set(1);

    await page.saveSubcategory();

    expect(createSpy).toHaveBeenCalledWith('cat-1', {
      id: 'math-midterm',
      name: 'กลางภาค',
      slug: '',
      icon: '',
      isActive: true,
      sortOrder: 1,
    });
    expect(messages.success).toContain('เพิ่มหมวดย่อยเรียบร้อย');
    expect(page.subcategoryFormOpen()).toBe(false);
    expect(listSpy).toHaveBeenCalledWith('cat-1');
  });

  it('refuses to create a subcategory without an id', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createSubcategory').mockResolvedValue(null);

    page.openCreateSubcategory(categoryModel('cat-1', 'คณิตศาสตร์'));
    page.subName.set('กลางภาค');
    // subId left empty

    await page.saveSubcategory();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning.some((m) => m.includes('รหัส'))).toBe(true);
  });

  it('edits an existing subcategory through admin.updateSubcategory', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    vi.spyOn(admin, 'listSubcategories').mockResolvedValue([]);
    const updateSpy = vi.spyOn(admin, 'updateSubcategory').mockResolvedValue(null);

    const existing = subcategory('sub-1', 'cat-1', { name: 'เดิม', sortOrder: 2 });
    page.openEditSubcategory(categoryModel('cat-1', 'คณิตศาสตร์'), existing);
    page.subName.set('ใหม่');

    await page.saveSubcategory();

    expect(updateSpy).toHaveBeenCalledWith('cat-1', 'sub-1', {
      name: 'ใหม่',
      slug: existing.slug,
      icon: existing.icon,
      isActive: true,
      sortOrder: 2,
    });
    expect(messages.success).toContain('บันทึกหมวดย่อยเรียบร้อย');
  });

  it('deletes a subcategory after the confirm dialog and refreshes the list', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;
    autoConfirmModal(fixture);

    const admin = TestBed.inject(AdminService);
    const listSpy = vi.spyOn(admin, 'listSubcategories').mockResolvedValue([]);
    const deleteSpy = vi.spyOn(admin, 'deleteSubcategory').mockResolvedValue(undefined);

    const target = subcategory('sub-1', 'cat-1');
    page.confirmDeleteSubcategory('cat-1', target);
    await settle();

    expect(deleteSpy).toHaveBeenCalledWith('cat-1', 'sub-1');
    expect(messages.success).toContain('ลบหมวดย่อยเรียบร้อย');
    expect(listSpy).toHaveBeenCalledWith('cat-1');
  });

  it('shows the server\'s own 409 message (not a generic one) and offers "ปิดใช้งานแทน"', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;
    autoConfirmModal(fixture);

    const admin = TestBed.inject(AdminService);
    vi.spyOn(admin, 'listSubcategories').mockResolvedValue([]);
    const conflictMessage = 'ลบไม่ได้ — ยังมีเอกสาร 3 รายการอยู่ในหมวดย่อยนี้';
    vi.spyOn(admin, 'deleteSubcategory').mockRejectedValue(conflictMessage);
    const updateSpy = vi.spyOn(admin, 'updateSubcategory').mockResolvedValue(null);

    const target = subcategory('sub-1', 'cat-1', { name: 'มีเอกสารอ้างอยู่' });
    page.confirmDeleteSubcategory('cat-1', target);
    await settle();

    expect(page.subcategoryErrorMessage()).toBe(conflictMessage);
    expect(page.deleteConflict()).toEqual({ categoryId: 'cat-1', subcategory: target });

    await page.disableInsteadOfDelete();

    expect(updateSpy).toHaveBeenCalledWith('cat-1', 'sub-1', {
      name: target.name,
      slug: target.slug,
      icon: target.icon,
      isActive: false,
      sortOrder: target.sortOrder,
    });
    expect(messages.success).toContain('บันทึกหมวดย่อยเรียบร้อย');
    expect(page.deleteConflict()).toBeNull();
  });
});

/**
 * F-01 (TASK-PLAN-2026-09-12 §8.1): the create/edit category form is an `nz-modal` now, not a
 * chain of `window.prompt()` calls. These specs drive the modal's form signals directly (the
 * template only binds them through `ngModel` / `nzOk*`, which `ng build`'s template type-check
 * covers) and assert the request payloads are unchanged from the prompt era.
 *
 * subscription-membership v2 §3.1 still applies to the price box: empty = explicit `null`,
 * otherwise a non-negative number. The one behaviour that could not survive the migration is
 * "Cancel the price prompt only" (which dropped the field from the request) — a modal cancels the
 * whole form, so the price is now always sent explicitly; see `parseSubscriptionPriceInput`.
 */
describe('AdminCategoriesPage — category create/edit modal (F-01)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens an empty form in create mode', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.openCreateCategory();

    expect(page.categoryFormOpen()).toBe(true);
    expect(page.editingCategory()).toBeNull();
    expect(page.catName()).toBe('');
    expect(page.catSlug()).toBe('');
    expect(page.catPrice()).toBe('');
    // Name is required, so the modal's OK button starts disabled.
    expect(page.categoryFormValid()).toBe(false);
  });

  it('opens the form pre-filled in edit mode, including the current subscription price', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const existing: Category = {
      ...categoryModel('cat-1', 'หมวด cat-1'),
      subscriptionMonthlyPrice: 150,
    };
    page.openEditCategory(existing);

    expect(page.categoryFormOpen()).toBe(true);
    expect(page.editingCategory()).toEqual(existing);
    expect(page.catName()).toBe('หมวด cat-1');
    expect(page.catSlug()).toBe('cat-1');
    expect(page.catPrice()).toBe('150');
    expect(page.categoryFormValid()).toBe(true);
  });

  it('leaves the price box empty when the category has no subscription price', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    page.openEditCategory(categoryModel('cat-1', 'หมวด cat-1'));

    expect(page.catPrice()).toBe('');
  });

  it('cancelling the form performs no action at all (the old prompt-Cancel behaviour)', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();
    const updateSpy = vi.spyOn(admin, 'updateCategory').mockResolvedValue();

    page.openEditCategory(categoryModel('cat-1', 'หมวด cat-1'));
    page.catName.set('ชื่อที่พิมพ์ไว้แล้วเปลี่ยนใจ');
    page.closeCategoryForm();

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(page.categoryFormOpen()).toBe(false);
    expect(page.editingCategory()).toBeNull();
    expect(messages.success).toEqual([]);
    expect(messages.error).toEqual([]);
  });

  it('refuses to save a blank name and never calls the API', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('   '); // whitespace only

    expect(page.catNameError()).toBe('กรุณากรอกชื่อหมวดหมู่');
    expect(page.categoryFormValid()).toBe(false);

    await page.saveCategory();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning).toContain('กรุณากรอกชื่อหมวดหมู่');
    expect(page.categoryFormOpen()).toBe(true);
  });

  it('trims the name and slug before building the request', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('  ภาษาไทย  ');
    page.catSlug.set('  thai-language  ');

    await page.saveCategory();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ภาษาไทย', slug: 'thai-language' }),
    );
  });

  it('generates the slug from the name when the slug box is left empty', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('Social Studies');

    await page.saveCategory();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'social-studies', icon: '📚', isActive: true, sortOrder: 0 }),
    );
  });

  it('passes a parsed number through to admin.createCategory', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('ภาษาไทย');
    page.catPrice.set('199');

    await page.saveCategory();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ภาษาไทย', subscriptionMonthlyPrice: 199 }),
    );
    expect(messages.success).toContain('เพิ่มหมวดหมู่แล้ว');
    expect(page.categoryFormOpen()).toBe(false);
  });

  it('an empty price box explicitly clears the price to null', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('ภาษาไทย');
    page.catPrice.set('');

    await page.saveCategory();

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionMonthlyPrice: null }),
    );
  });

  it('rejects a non-numeric price and never calls createCategory', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('ภาษาไทย');
    page.catPrice.set('abc');

    expect(page.catPriceError()).toBe('ราคาสมาชิกรายเดือนต้องเป็นตัวเลขไม่ติดลบ');
    expect(page.categoryFormValid()).toBe(false);

    await page.saveCategory();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning).toContain('ราคาสมาชิกรายเดือนต้องเป็นตัวเลขไม่ติดลบ');
  });

  it('rejects a negative price and never calls createCategory', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const createSpy = vi.spyOn(admin, 'createCategory').mockResolvedValue();

    page.openCreateCategory();
    page.catName.set('ภาษาไทย');
    page.catPrice.set('-1');

    await page.saveCategory();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning).toContain('ราคาสมาชิกรายเดือนต้องเป็นตัวเลขไม่ติดลบ');
  });

  it('editCategory: keeps the untouched fields and re-sends the pre-filled price (never an accidental clear)', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const updateSpy = vi.spyOn(admin, 'updateCategory').mockResolvedValue();

    const existing: Category = {
      ...categoryModel('cat-1', 'หมวด cat-1'),
      subscriptionMonthlyPrice: 150,
    };
    page.openEditCategory(existing);
    page.catName.set('ชื่อใหม่');

    await page.saveCategory();

    expect(updateSpy).toHaveBeenCalledWith('cat-1', {
      name: 'ชื่อใหม่',
      slug: 'cat-1',
      icon: existing.icon,
      color: existing.color,
      description: existing.description,
      isActive: true,
      sortOrder: 0,
      subscriptionMonthlyPrice: 150,
    });
    expect(messages.success).toContain('อัปเดตหมวดหมู่แล้ว');
    expect(page.categoryFormOpen()).toBe(false);
  });

  it('editCategory: clearing the price box turns the subscription off', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const updateSpy = vi.spyOn(admin, 'updateCategory').mockResolvedValue();

    page.openEditCategory({
      ...categoryModel('cat-1', 'หมวด cat-1'),
      subscriptionMonthlyPrice: 150,
    });
    page.catPrice.set('');

    await page.saveCategory();

    expect(updateSpy).toHaveBeenCalledWith(
      'cat-1',
      expect.objectContaining({ subscriptionMonthlyPrice: null }),
    );
  });

  it('editCategory: an emptied slug box is omitted so the server keeps the current slug', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    const updateSpy = vi.spyOn(admin, 'updateCategory').mockResolvedValue();

    page.openEditCategory(categoryModel('cat-1', 'หมวด cat-1'));
    page.catSlug.set('');

    await page.saveCategory();

    expect(updateSpy).toHaveBeenCalledWith('cat-1', expect.objectContaining({ slug: undefined }));
  });

  it('keeps the form open and reports the failure when the update call rejects', async () => {
    stubRoute('GET', '/api/admin/categories', [category('cat-1')]);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    vi.spyOn(admin, 'updateCategory').mockRejectedValue(new Error('boom'));

    page.openEditCategory(categoryModel('cat-1', 'หมวด cat-1'));
    await page.saveCategory();

    expect(messages.error).toContain('อัปเดตไม่สำเร็จ');
    expect(page.categoryFormOpen()).toBe(true);
    expect(page.catSaving()).toBe(false);
  });

  it('disables the confirm button while saving and ignores a second submit', async () => {
    stubRoute('GET', '/api/admin/categories', []);
    const fixture = renderPage();
    await settle();
    const page = fixture.componentInstance;

    const admin = TestBed.inject(AdminService);
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const createSpy = vi.spyOn(admin, 'createCategory').mockReturnValue(pending);

    page.openCreateCategory();
    page.catName.set('ภาษาไทย');

    const inFlight = page.saveCategory();
    expect(page.catSaving()).toBe(true);

    // A double-click on the confirm button must not fire a second request.
    await page.saveCategory();
    expect(createSpy).toHaveBeenCalledTimes(1);

    release();
    await inFlight;

    expect(page.catSaving()).toBe(false);
    expect(page.categoryFormOpen()).toBe(false);
  });

  it('renders the price when set, and "ยังไม่เปิด" when subscriptionMonthlyPrice is null', async () => {
    stubRoute('GET', '/api/admin/categories', [
      { ...category('cat-1', 'มีราคา'), subscriptionMonthlyPrice: 199 },
      { ...category('cat-2', 'ยังไม่มีราคา'), subscriptionMonthlyPrice: null },
    ]);
    const fixture = renderPage();
    await settle();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('฿199');
    expect(text).toContain('ยังไม่เปิด');
  });
});

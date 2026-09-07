import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { AnnouncementsAdminPage, announcementStatus } from './announcements-admin.page';
import { AdminService } from '../../../core/services/admin.service';
import { SellerService } from '../../../core/services/seller.service';
import { downloadUrlForStorageKey } from '../../../core/api-runtime';
import type { UploadResponse } from '../../../core/api/types.gen';
import type { AnnouncementAdmin } from '../../../core/models';

/**
 * announcement-popup v1 §4 (`docs/contracts/announcement-popup.md`) — AC-26.
 *
 * Round 1: `AdminService`'s 5 announcement methods are stubs (§4 "การแบ่งงาน" — wiring to the real
 * backend is round 2). These specs drive the page against a stubbed `AdminService` (via
 * `vi.spyOn`), the same style `categories-admin.page.spec.ts` uses for its (also round-1-stubbed)
 * subcategory methods — this is a unit test of the page's state/wiring/client-side validation,
 * not of the SDK calls the stubs will make once wired.
 */

let messages: { success: string[]; warning: string[]; error: string[] };

function announcement(id: string, overrides: Partial<AnnouncementAdmin> = {}): AnnouncementAdmin {
  return {
    id,
    title: `ประกาศ ${id}`,
    isEnabled: true,
    startAt: null,
    endAt: null,
    sortOrder: 0,
    images: [
      { id: `${id}-img-1`, imageUrl: 'https://cdn.example.com/1.jpg', linkUrl: null, altText: null, sortOrder: 0 },
      { id: `${id}-img-2`, imageUrl: 'https://cdn.example.com/2.jpg', linkUrl: null, altText: null, sortOrder: 1 },
      { id: `${id}-img-3`, imageUrl: 'https://cdn.example.com/3.jpg', linkUrl: null, altText: null, sortOrder: 2 },
      { id: `${id}-img-4`, imageUrl: 'https://cdn.example.com/4.jpg', linkUrl: null, altText: null, sortOrder: 3 },
      { id: `${id}-img-5`, imageUrl: 'https://cdn.example.com/5.jpg', linkUrl: null, altText: null, sortOrder: 4 },
    ],
    ...overrides,
  };
}

function fiveValidRows(): { key: string; id: string | null; imageUrl: string; linkUrl: string; altText: string }[] {
  return Array.from({ length: 5 }, (_, i) => ({
    key: `row-${i}`,
    id: null,
    imageUrl: `https://cdn.example.com/new-${i}.jpg`,
    linkUrl: '',
    altText: '',
  }));
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// jsdom does not implement `DataTransfer`, so a real `<input type="file">` selection can't be
// simulated through it — build a minimal `FileList`-shaped object instead, matching what the
// component reads (`input.files`). Same technique as `document-detail.page.spec.ts`.
function toFileList(files: File[]): FileList {
  const list: Record<number, File> & { length: number; item: (i: number) => File | null } = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
  };
  files.forEach((f, i) => (list[i] = f));
  return list as unknown as FileList;
}

function buildFileEvent(files: File[]): Event {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: toFileList(files) });
  return { target: input } as unknown as Event;
}

function autoConfirmModal(fixture: { debugElement: { injector: { get: typeof TestBed.inject } } }): void {
  const modal = fixture.debugElement.injector.get(NzModalService);
  vi.spyOn(modal, 'confirm').mockImplementation((...args: Parameters<typeof modal.confirm>) => {
    const options = args[0] as { nzOnOk?: () => unknown } | undefined;
    void options?.nzOnOk?.();
    return {} as ReturnType<typeof modal.confirm>;
  });
}

function renderPage(uploadFile?: (file: File) => Promise<UploadResponse>) {
  messages = { success: [], warning: [], error: [] };
  const fakeSeller: Partial<SellerService> = {
    uploadFile: uploadFile ?? (async () => { throw new Error('uploadFile should not be called in this test'); }),
  };

  TestBed.configureTestingModule({
    imports: [AnnouncementsAdminPage],
    providers: [
      { provide: SellerService, useValue: fakeSeller },
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

  const admin = TestBed.inject(AdminService);
  vi.spyOn(admin, 'listAnnouncements').mockResolvedValue([]);

  const fixture = TestBed.createComponent(AnnouncementsAdminPage);
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, admin };
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('AnnouncementsAdminPage (announcement-popup v1 §4 — AC-26)', () => {
  it('loads the list from admin.listAnnouncements on construction', async () => {
    const { page, admin } = renderPage();
    vi.mocked(admin.listAnnouncements).mockResolvedValue([announcement('ann-1')]);

    await page.refresh();

    expect(page.items().length).toBe(1);
    expect(page.items()[0].id).toBe('ann-1');
  });

  it('openCreate() resets the form to a blank state', () => {
    const { page } = renderPage();

    page.openCreate();

    expect(page.editingId()).toBeNull();
    expect(page.formTitle()).toBe('');
    expect(page.formIsEnabled()).toBe(true);
    expect(page.formImages()).toEqual([]);
    expect(page.formOpen()).toBe(true);
  });

  it('openEdit() populates the form from an existing announcement, images sorted by sortOrder', () => {
    const { page } = renderPage();
    const existing = announcement('ann-1', {
      title: 'ประกาศเดิม',
      isEnabled: false,
      startAt: '2026-01-01T00:00:00Z',
      endAt: '2026-02-01T00:00:00Z',
      sortOrder: 3,
      images: [
        { id: 'img-b', imageUrl: 'b.jpg', linkUrl: '/b', altText: 'B', sortOrder: 1 },
        { id: 'img-a', imageUrl: 'a.jpg', linkUrl: null, altText: null, sortOrder: 0 },
      ],
    });

    page.openEdit(existing);

    expect(page.editingId()).toBe('ann-1');
    expect(page.formTitle()).toBe('ประกาศเดิม');
    expect(page.formIsEnabled()).toBe(false);
    expect(page.formStartAt()).toBe('2026-01-01');
    expect(page.formEndAt()).toBe('2026-02-01');
    expect(page.formSortOrder()).toBe(3);
    expect(page.formImages().map((r) => r.id)).toEqual(['img-a', 'img-b']);
    expect(page.formImages()[1].linkUrl).toBe('/b');
    expect(page.formOpen()).toBe(true);
  });

  it('AC-26 [v2]: save() blocks and warns when there are 0 images, without calling the API', async () => {
    const { page, admin } = renderPage();
    const createSpy = vi.spyOn(admin, 'createAnnouncement').mockResolvedValue(null);
    page.openCreate();
    page.formTitle.set('ทดสอบ');
    page.formImages.set([]);

    await page.save();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning.some((m) => m.includes('1 รูป'))).toBe(true);
    expect(page.formOpen()).toBe(true);
  });

  it('AC-26 [v2]: save() proceeds with a single image (new minimum lowered from 5 to 1)', async () => {
    const { page, admin } = renderPage();
    const createSpy = vi.spyOn(admin, 'createAnnouncement').mockResolvedValue(null);
    page.openCreate();
    page.formTitle.set('ทดสอบ');
    page.formImages.set(fiveValidRows().slice(0, 1));

    await page.save();

    expect(createSpy).toHaveBeenCalledTimes(1);
  });

  it('AC-26: save() blocks and warns when there are more than 10 images, without calling the API', async () => {
    const { page, admin } = renderPage();
    const createSpy = vi.spyOn(admin, 'createAnnouncement').mockResolvedValue(null);
    page.openCreate();
    page.formTitle.set('ทดสอบ');
    page.formImages.set(
      Array.from({ length: 11 }, (_, i) => ({
        key: `row-${i}`,
        id: null,
        imageUrl: `https://cdn.example.com/${i}.jpg`,
        linkUrl: '',
        altText: '',
      })),
    );

    await page.save();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning.some((m) => m.includes('10 รูป'))).toBe(true);
  });

  it('save() warns and does not call the API when the title is blank', async () => {
    const { page, admin } = renderPage();
    const createSpy = vi.spyOn(admin, 'createAnnouncement').mockResolvedValue(null);
    page.openCreate();
    page.formImages.set(fiveValidRows());
    // formTitle left blank

    await page.save();

    expect(createSpy).not.toHaveBeenCalled();
    expect(messages.warning.some((m) => m.includes('หัวข้อ'))).toBe(true);
  });

  it('creates a valid announcement through admin.createAnnouncement, then refreshes and closes the form', async () => {
    const { page, admin } = renderPage();
    const createSpy = vi.spyOn(admin, 'createAnnouncement').mockResolvedValue(announcement('ann-new'));
    const listSpy = vi.spyOn(admin, 'listAnnouncements').mockResolvedValue([announcement('ann-new')]);

    page.openCreate();
    page.formTitle.set('ประกาศใหม่');
    page.formSortOrder.set(2);
    const rows = fiveValidRows();
    rows[0] = { ...rows[0], linkUrl: '/promo', altText: 'โปรโมชัน' };
    page.formImages.set(rows);

    await page.save();

    expect(createSpy).toHaveBeenCalledTimes(1);
    const [request] = createSpy.mock.calls[0];
    expect(request.title).toBe('ประกาศใหม่');
    expect(request.sortOrder).toBe(2);
    expect(request.images.length).toBe(5);
    expect(request.images[0]).toEqual({
      id: null,
      imageUrl: rows[0].imageUrl,
      linkUrl: '/promo',
      altText: 'โปรโมชัน',
      sortOrder: 0,
    });
    expect(messages.success).toContain('เพิ่มประกาศเรียบร้อย');
    expect(page.formOpen()).toBe(false);
    expect(listSpy).toHaveBeenCalled();
  });

  it('edits an existing announcement through admin.updateAnnouncement', async () => {
    const { page, admin } = renderPage();
    const updateSpy = vi.spyOn(admin, 'updateAnnouncement').mockResolvedValue(null);
    vi.spyOn(admin, 'listAnnouncements').mockResolvedValue([]);

    const existing = announcement('ann-1', { title: 'เดิม' });
    page.openEdit(existing);
    page.formTitle.set('ใหม่');

    await page.save();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const [id, request] = updateSpy.mock.calls[0];
    expect(id).toBe('ann-1');
    expect(request.title).toBe('ใหม่');
    expect(request.images.length).toBe(5);
    expect(messages.success).toContain('บันทึกประกาศเรียบร้อย');
  });

  it('empty linkUrl/altText are sent as null, not empty strings (matches optional-field DTO shape)', async () => {
    const { page, admin } = renderPage();
    const createSpy = vi.spyOn(admin, 'createAnnouncement').mockResolvedValue(null);
    page.openCreate();
    page.formTitle.set('ทดสอบ');
    page.formImages.set(fiveValidRows());

    await page.save();

    const [request] = createSpy.mock.calls[0];
    expect(request.images.every((img) => img.linkUrl === null && img.altText === null)).toBe(true);
  });

  it('onAddImageFiles uploads through SellerService and appends a row using optimizedUrl over the raw key', async () => {
    const uploadFile = vi.fn(
      async (): Promise<UploadResponse> => ({
        key: 'announcements/1.jpg',
        publicUrl: 'https://cdn.example.com/original-1.jpg',
        eTag: 'etag-1',
        optimizedKey: 'announcements/1-opt.jpg',
        optimizedUrl: 'https://cdn.example.com/optimized-1.jpg',
      }),
    );
    const { page } = renderPage(uploadFile);
    page.openCreate();

    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await page.onAddImageFiles(buildFileEvent([file]));

    expect(uploadFile).toHaveBeenCalledWith(file);
    expect(page.formImages().length).toBe(1);
    expect(page.formImages()[0].imageUrl).toBe('https://cdn.example.com/optimized-1.jpg');
  });

  it('onAddImageFiles falls back to downloadUrlForStorageKey(key) when optimizedUrl is null (§1.2)', async () => {
    const uploadFile = vi.fn(
      async (): Promise<UploadResponse> => ({
        key: 'announcements/2.jpg',
        publicUrl: 'https://cdn.example.com/original-2.jpg',
        eTag: 'etag-2',
        optimizedKey: null,
        optimizedUrl: null,
      }),
    );
    const { page } = renderPage(uploadFile);
    page.openCreate();

    const file = new File(['x'], 'photo2.jpg', { type: 'image/jpeg' });
    await page.onAddImageFiles(buildFileEvent([file]));

    expect(page.formImages()[0].imageUrl).toBe(downloadUrlForStorageKey('announcements/2.jpg'));
  });

  it('onAddImageFiles stops uploading once the 10-image cap is reached', async () => {
    const uploadFile = vi.fn(
      async (): Promise<UploadResponse> => ({
        key: 'k',
        publicUrl: 'https://cdn.example.com/k.jpg',
        eTag: 'e',
        optimizedKey: null,
        optimizedUrl: 'https://cdn.example.com/k-opt.jpg',
      }),
    );
    const { page } = renderPage(uploadFile);
    page.openCreate();
    page.formImages.set(fiveValidRows().concat(fiveValidRows())); // already 10

    const files = [new File(['x'], 'extra.jpg', { type: 'image/jpeg' })];
    await page.onAddImageFiles(buildFileEvent(files));

    expect(uploadFile).not.toHaveBeenCalled();
    expect(page.formImages().length).toBe(10);
  });

  it('removeImageRow removes only the targeted row', () => {
    const { page } = renderPage();
    const rows = fiveValidRows();
    page.formImages.set(rows);

    page.removeImageRow(rows[2].key);

    expect(page.formImages().length).toBe(4);
    expect(page.formImages().some((r) => r.key === rows[2].key)).toBe(false);
  });

  it('AC-26: confirmDelete asks for confirmation, then calls admin.deleteAnnouncement and refreshes', async () => {
    const { fixture, page, admin } = renderPage();
    autoConfirmModal(fixture);
    const deleteSpy = vi.spyOn(admin, 'deleteAnnouncement').mockResolvedValue(undefined);
    const listSpy = vi.spyOn(admin, 'listAnnouncements').mockResolvedValue([]);
    const confirmSpy = vi.spyOn(fixture.debugElement.injector.get(NzModalService), 'confirm');

    page.confirmDelete(announcement('ann-1', { title: 'จะลบ' }));
    await settle();

    expect(confirmSpy).toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledWith('ann-1');
    expect(messages.success).toContain('ลบประกาศเรียบร้อย');
    expect(listSpy).toHaveBeenCalled();
  });
});

describe('announcementStatus() (announcement-popup v1 §4)', () => {
  const now = new Date('2026-06-15T00:00:00Z');

  it('is "disabled" when isEnabled is false, regardless of dates', () => {
    expect(
      announcementStatus(announcement('a', { isEnabled: false, startAt: null, endAt: null }), now),
    ).toBe('disabled');
  });

  it('is "scheduled" when startAt is in the future', () => {
    expect(
      announcementStatus(
        announcement('a', { isEnabled: true, startAt: '2026-07-01T00:00:00Z', endAt: null }),
        now,
      ),
    ).toBe('scheduled');
  });

  it('is "expired" when endAt is in the past', () => {
    expect(
      announcementStatus(
        announcement('a', { isEnabled: true, startAt: null, endAt: '2026-01-01T00:00:00Z' }),
        now,
      ),
    ).toBe('expired');
  });

  it('is "active" when enabled and within the start/end window', () => {
    expect(
      announcementStatus(
        announcement('a', {
          isEnabled: true,
          startAt: '2026-01-01T00:00:00Z',
          endAt: '2026-12-31T00:00:00Z',
        }),
        now,
      ),
    ).toBe('active');
  });
});

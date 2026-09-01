import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { of } from 'rxjs';
import { ProfileEditorComponent } from './profile-editor.component';
import { MeService } from '../../../core/services';
import type { UploadResponse } from '../../../core/api/types.gen';
import type {
  UpdateProfileRequestWithKey,
  UserProfileResponseWithKey,
} from '../../../core/services/api-result';

/**
 * image-upload-optimization v1 §4 / AC-11: avatar upload must prefer `optimizedUrl` (when the
 * backend produced one) over `publicUrl` — both for what gets displayed and for what gets sent
 * to `PUT /api/me/profile`. When `optimizedUrl` is null/undefined (optimize was skipped/failed)
 * it must fall back to `publicUrl` silently — no user-facing message for that case (spec §4).
 *
 * storage-key-persistence v1 §4.1: the payload sent to `PUT /api/me/profile` must carry
 * `avatarStorageKey` (a bare key), never `avatarUrl` (a resolved display URL) — see AC-8-style
 * regression case at the bottom of this file.
 */

const profile: UserProfileResponseWithKey = {
  id: 'user-1',
  name: 'ครูเอ',
  email: 'a@example.test',
  avatarUrl: 'https://cdn.example.test/original-avatar.png',
  avatarStorageKey: 'users/user-1/original-avatar.png',
  role: 'Seller',
};

function buildFile(): File {
  return new File(['fake-bytes'], 'avatar.png', { type: 'image/png' });
}

function render(uploadResult: UploadResponse) {
  const updateProfileCalls: UpdateProfileRequestWithKey[] = [];
  const fakeMeService: Partial<MeService> = {
    loadProfile: () => of(profile),
    uploadAvatar: async () => uploadResult,
    updateProfile: (req: UpdateProfileRequestWithKey) => {
      updateProfileCalls.push(req);
      return of({
        ...profile,
        name: req.name ?? profile.name,
        avatarStorageKey: req.avatarStorageKey ?? profile.avatarStorageKey,
      });
    },
  };

  TestBed.configureTestingModule({
    imports: [ProfileEditorComponent],
    providers: [
      { provide: MeService, useValue: fakeMeService },
      { provide: NzMessageService, useValue: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } },
    ],
  });

  const fixture = TestBed.createComponent(ProfileEditorComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, updateProfileCalls };
}

// jsdom (the test environment here) does not implement `DataTransfer`, so a real
// `<input type="file">` selection can't be simulated through it — build a minimal
// `FileList`-shaped object instead, matching what the component reads (`input.files`).
function toFileList(file: File): FileList {
  const list = {
    0: file,
    length: 1,
    item: (index: number) => (index === 0 ? file : null),
    [Symbol.iterator]: function* () {
      yield file;
    },
  };
  return list as unknown as FileList;
}

async function selectAvatarFile(component: ProfileEditorComponent, file: File): Promise<void> {
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: toFileList(file) });
  await component.onAvatarSelected({ target: input } as unknown as Event);
}

afterEach(() => TestBed.resetTestingModule());

describe('ProfileEditorComponent — avatar optimized URL (AC-11)', () => {
  it('uses optimizedUrl for both display and the PUT /api/me/profile payload when present', async () => {
    const { component, updateProfileCalls } = render({
      key: 'users/user-1/2026/09/01/avatar.png',
      publicUrl: 'https://cdn.example.test/original-avatar.png',
      eTag: 'etag-1',
      optimizedKey: 'users/user-1/2026/09/01/optimized/avatar.webp',
      optimizedUrl: 'https://cdn.example.test/optimized-avatar.webp',
    });

    await selectAvatarFile(component, buildFile());

    expect(component.avatarUrl).toBe('https://cdn.example.test/optimized-avatar.webp');
    expect(component.avatarStorageKey).toBe('users/user-1/2026/09/01/optimized/avatar.webp');
    expect(updateProfileCalls).toHaveLength(1);
    // storage-key-persistence v1 §4.1: payload carries the bare key, never a URL.
    expect(updateProfileCalls[0].avatarStorageKey).toBe(
      'users/user-1/2026/09/01/optimized/avatar.webp',
    );
  });

  it('falls back to publicUrl when optimizedUrl is null', async () => {
    const { component, updateProfileCalls } = render({
      key: 'users/user-1/2026/09/01/avatar.png',
      publicUrl: 'https://cdn.example.test/original-avatar.png',
      eTag: 'etag-1',
      optimizedKey: null,
      optimizedUrl: null,
    });

    await selectAvatarFile(component, buildFile());

    expect(component.avatarUrl).toBe('https://cdn.example.test/original-avatar.png');
    expect(component.avatarStorageKey).toBe('users/user-1/2026/09/01/avatar.png');
    expect(updateProfileCalls).toHaveLength(1);
    expect(updateProfileCalls[0].avatarStorageKey).toBe('users/user-1/2026/09/01/avatar.png');
  });

});

describe('ProfileEditorComponent — storage-key round-trip (storage-key-persistence v1 §4.1)', () => {
  it('edit only the display name, do not touch the avatar → payload sends the existing avatarStorageKey, not a URL', () => {
    const { component, updateProfileCalls } = render({
      key: 'unused/upload.png',
      publicUrl: 'https://cdn.example.test/unused.png',
      eTag: 'etag-x',
      optimizedKey: null,
      optimizedUrl: null,
    });

    // The loaded profile fixture's avatarStorageKey ('users/user-1/original-avatar.png') must
    // still be the value sent, even though this edit never touches the avatar at all — this is
    // the exact regression the spec calls out: resubmitting a stale field must never leak a URL
    // into the storage-key column.
    component.displayName = 'ครูเอ (แก้ชื่อ)';
    component.save();

    expect(updateProfileCalls).toHaveLength(1);
    expect(updateProfileCalls[0].name).toBe('ครูเอ (แก้ชื่อ)');
    expect(updateProfileCalls[0].avatarStorageKey).toBe('users/user-1/original-avatar.png');
    expect(updateProfileCalls[0]).not.toHaveProperty('avatarUrl');
  });
});

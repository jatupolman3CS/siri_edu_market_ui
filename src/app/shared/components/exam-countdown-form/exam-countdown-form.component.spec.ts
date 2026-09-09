import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { ExamCountdownFormComponent } from './exam-countdown-form.component';
import { ExamCountdownService } from '../../../core/services';
import { idleActionState, loadingActionState, type ActionState } from '../../../core/services/action-state';
import type { ExamCountdownSetting } from '../../../core/models';

/**
 * exam-countdown-mode v1 (docs/contracts/exam-countdown-mode.md §1 test list / §4) — AC-22/23/24.
 *
 * Drives `ExamCountdownFormComponent` against a stubbed `ExamCountdownService` (a plain object
 * with the same signal/method shape, not the real `providedIn: 'root'` service — same pattern as
 * `payout-account-form.component.spec.ts`) so render/interaction logic is exercised independently
 * of the service's own `TODO(contract)` stub body (covered separately in
 * `exam-countdown.service.spec.ts`).
 */
function fakeExamCountdown(
  initialSetting: ExamCountdownSetting | null = null,
  initialState: ActionState = idleActionState(),
) {
  const setting = signal<ExamCountdownSetting | null>(initialSetting);
  const state = signal<ActionState>(initialState);
  return {
    setting: setting.asReadonly(),
    state: state.asReadonly(),
    docs: () => [],
    docsState: () => idleActionState(),
    hasMoreDocs: () => false,
    _setting: setting,
    _state: state,
    loadSetting: vi.fn(async () => {}),
    saveSetting: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
    setEnabled: vi.fn(async () => {}),
    clearSetting: vi.fn(async () => {
      setting.set(null);
    }),
  };
}

type Messages = { success: string[]; warning: string[]; error: string[] };

function render(
  fake: ReturnType<typeof fakeExamCountdown>,
  messages: Messages = { success: [], warning: [], error: [] },
) {
  TestBed.configureTestingModule({
    imports: [ExamCountdownFormComponent],
    providers: [
      { provide: ExamCountdownService, useValue: fake },
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

  const fixture = TestBed.createComponent(ExamCountdownFormComponent);
  fixture.detectChanges();
  return fixture;
}

/** Mirrors `saved-cards.component.spec.ts`'s `autoConfirmModal` helper. */
function autoConfirmModal(fixture: { debugElement: { injector: { get: typeof TestBed.inject } } }): void {
  const modal = fixture.debugElement.injector.get(NzModalService);
  vi.spyOn(modal, 'confirm').mockImplementation((...args: Parameters<typeof modal.confirm>) => {
    const options = args[0] as { nzOnOk?: () => unknown } | undefined;
    void options?.nzOnOk?.();
    return {} as ReturnType<typeof modal.confirm>;
  });
}

afterEach(() => TestBed.resetTestingModule());

describe('ExamCountdownFormComponent — construction (AC-22)', () => {
  it('calls examCountdown.loadSetting() once on construction', () => {
    const fake = fakeExamCountdown();
    render(fake);

    expect(fake.loadSetting).toHaveBeenCalledTimes(1);
  });

  it('shows the empty form immediately when setting() is null', () => {
    const fixture = render(fakeExamCountdown(null));
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('select[name="examType"]')).toBeTruthy();
    expect(el.querySelector('input[name="examDate"]')).toBeTruthy();
  });

  it('shows the current status (examType/examDate/isEnabled) when a setting already exists', () => {
    const fixture = render(
      fakeExamCountdown({ examType: 'TGAT', examDate: '2026-12-01', isEnabled: true }),
    );
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('TGAT');
    expect(text).toContain('2026-12-01');
    expect(text).toContain('เปิดใช้งานอยู่');
    expect(text).toContain('แก้ไขวันสอบ');
  });

  it('"แก้ไขวันสอบ" prefills the form with the current setting', () => {
    const fixture = render(
      fakeExamCountdown({ examType: 'IELTS', examDate: '2026-11-20', isEnabled: true }),
    );

    fixture.componentInstance.startEdit();
    fixture.detectChanges();

    expect(fixture.componentInstance.formExamType()).toBe('IELTS');
    expect(fixture.componentInstance.formExamDate()).toBe('2026-11-20');
    expect(fixture.componentInstance.showForm()).toBe(true);
  });
});

describe('ExamCountdownFormComponent — submit() (AC-23)', () => {
  it('blocks submit and shows an inline error when a field is missing', async () => {
    const fake = fakeExamCountdown(null);
    const fixture = render(fake);

    await fixture.componentInstance.submit();

    expect(fake.saveSetting).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saveError()).toBeTruthy();
  });

  it('on success: calls saveSetting(examType, examDate), toasts confirmation, leaves editing, emits saved', async () => {
    const fake = fakeExamCountdown(null);
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);
    const savedSpy = vi.fn();
    fixture.componentInstance.saved.subscribe(savedSpy);
    fixture.componentInstance.formExamType.set('TGAT');
    fixture.componentInstance.formExamDate.set('2026-12-25');

    await fixture.componentInstance.submit();

    expect(fake.saveSetting).toHaveBeenCalledWith('TGAT', '2026-12-25');
    expect(messages.success).toContain('บันทึกโหมดใกล้สอบเรียบร้อย');
    expect(fixture.componentInstance.editing()).toBe(false);
    expect(savedSpy).toHaveBeenCalledTimes(1);
  });

  it('on a 400-equivalent failure: shows result.error under the form, no toast', async () => {
    const fake = fakeExamCountdown(null);
    fake.saveSetting.mockResolvedValueOnce({ ok: false, error: 'ประเภทสอบไม่ถูกต้อง' });
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);
    fixture.componentInstance.formExamType.set('TGAT');
    fixture.componentInstance.formExamDate.set('2026-12-25');

    await fixture.componentInstance.submit();

    expect(fixture.componentInstance.saveError()).toBe('ประเภทสอบไม่ถูกต้อง');
    expect(messages.success).toEqual([]);
    expect(messages.error).toEqual([]);
  });
});

describe('ExamCountdownFormComponent — ล้างค่า (AC-24)', () => {
  it('confirmClear() opens a confirm modal before calling clearSetting()', () => {
    const fake = fakeExamCountdown({ examType: 'O-NET', examDate: '2026-12-01', isEnabled: true });
    const fixture = render(fake);
    const modal = fixture.debugElement.injector.get(NzModalService);
    const confirmSpy = vi.spyOn(modal, 'confirm').mockImplementation(
      () => ({}) as ReturnType<typeof modal.confirm>,
    );

    fixture.componentInstance.confirmClear();

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fake.clearSetting).not.toHaveBeenCalled();
  });

  it('after confirming: calls clearSetting(), toasts confirmation, and setting() becomes null', async () => {
    const fake = fakeExamCountdown({ examType: 'O-NET', examDate: '2026-12-01', isEnabled: true });
    const messages: Messages = { success: [], warning: [], error: [] };
    const fixture = render(fake, messages);
    autoConfirmModal(fixture);

    fixture.componentInstance.confirmClear();
    await Promise.resolve();
    await Promise.resolve();

    expect(fake.clearSetting).toHaveBeenCalledTimes(1);
    expect(messages.success).toContain('ล้างค่าโหมดใกล้สอบแล้ว');
    expect(fixture.componentInstance.examCountdown.setting()).toBeNull();
  });
});

describe('ExamCountdownFormComponent — saving() (loading guard)', () => {
  it('disables the save button while a save is in flight', () => {
    const fixture = render(fakeExamCountdown(null, loadingActionState()));

    expect(fixture.componentInstance.saving()).toBe(true);
    const button = (fixture.nativeElement as HTMLElement).querySelector('button.btn-pink') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});

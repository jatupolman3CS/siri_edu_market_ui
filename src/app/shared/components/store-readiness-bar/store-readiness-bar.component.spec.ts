import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StoreReadinessBarComponent } from './store-readiness-bar.component';
import type { StoreReadinessItem } from '../../../core/models';

/**
 * store-readiness-score v1 (docs/contracts/store-readiness-score.md §1 test list / §4) —
 * AC-10, AC-11, AC-12. Fed entirely through `input()` — no `SellerService` involved, matching
 * §4: "component รับข้อมูลผ่าน input ล้วน".
 */
function items(overrides: Partial<Record<string, Partial<StoreReadinessItem>>> = {}): StoreReadinessItem[] {
  const base: StoreReadinessItem[] = [
    {
      key: 'payout_account',
      label: 'ตั้งค่าบัญชีรับเงิน',
      done: false,
      actionLabel: 'ตั้งค่าบัญชีรับเงิน',
      actionRoute: '/seller/settings',
    },
    {
      key: 'profile_picture',
      label: 'อัปโหลดรูปโปรไฟล์ร้าน',
      done: false,
      actionLabel: 'อัปโหลดรูปโปรไฟล์',
      actionRoute: '/seller/settings',
    },
    {
      key: 'listings',
      label: 'อัปโหลดเอกสารอย่างน้อย 3 ชิ้น',
      done: false,
      actionLabel: 'อัปโหลดเอกสาร',
      actionRoute: '/seller/upload',
      currentCount: 0,
      targetCount: 3,
    },
  ];
  return base.map((item) => ({ ...item, ...(overrides[item.key] ?? {}) }));
}

function render(opts: {
  percentComplete: number;
  isComplete: boolean;
  items: StoreReadinessItem[];
  nextActionItemKey: string | null;
}) {
  TestBed.configureTestingModule({
    imports: [StoreReadinessBarComponent],
    providers: [provideRouter([])],
  });

  const fixture = TestBed.createComponent(StoreReadinessBarComponent);
  fixture.componentRef.setInput('percentComplete', opts.percentComplete);
  fixture.componentRef.setInput('isComplete', opts.isComplete);
  fixture.componentRef.setInput('items', opts.items);
  fixture.componentRef.setInput('nextActionItemKey', opts.nextActionItemKey);
  fixture.detectChanges();
  return fixture;
}

afterEach(() => TestBed.resetTestingModule());

describe('StoreReadinessBarComponent — full bar state (AC-10)', () => {
  it('shows the title with percentComplete and a checklist of all 3 items in order', () => {
    const fixture = render({
      percentComplete: 33,
      isComplete: false,
      items: items({ payout_account: { done: true } }),
      nextActionItemKey: 'profile_picture',
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('ความสมบูรณ์ของร้าน 33%');
    expect(text).toContain('ตั้งค่าบัญชีรับเงิน');
    expect(text).toContain('อัปโหลดรูปโปรไฟล์ร้าน');
    expect(text).toContain('อัปโหลดเอกสารอย่างน้อย 3 ชิ้น');
  });

  it('shows "(currentCount/targetCount)" only for the listings item', () => {
    const fixture = render({
      percentComplete: 67,
      isComplete: false,
      items: items({ listings: { currentCount: 2, targetCount: 3 } }),
      nextActionItemKey: 'listings',
    });

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('(2/3)');
    // payout_account / profile_picture never carry a count — no stray "(undefined/undefined)".
    expect(text).not.toContain('undefined');
  });

  it('highlights the nextActionItemKey item with a primary (btn-pink) action and others with secondary (btn-ghost)', () => {
    const fixture = render({
      percentComplete: 33,
      isComplete: false,
      items: items({ payout_account: { done: true } }),
      nextActionItemKey: 'profile_picture',
    });
    const el = fixture.nativeElement as HTMLElement;

    const primaryLink = el.querySelector('a.btn-pink[href="/seller/settings"]') as HTMLAnchorElement;
    expect(primaryLink).toBeTruthy();
    expect(primaryLink.textContent?.trim()).toBe('อัปโหลดรูปโปรไฟล์');

    const secondaryLink = el.querySelector('a.btn-ghost[href="/seller/upload"]') as HTMLAnchorElement;
    expect(secondaryLink).toBeTruthy();
    expect(secondaryLink.textContent?.trim()).toBe('อัปโหลดเอกสาร');
  });

  it('a done item shows no action button at all', () => {
    const fixture = render({
      percentComplete: 33,
      isComplete: false,
      items: items({ payout_account: { done: true } }),
      nextActionItemKey: 'profile_picture',
    });
    const el = fixture.nativeElement as HTMLElement;

    const links = Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    // payout_account is done — its actionRoute (/seller/settings) still appears for
    // profile_picture (also /seller/settings), so assert by count instead of absence of the URL.
    expect(links.length).toBe(2); // profile_picture + listings only, not payout_account
  });

  it('renders a progress bar reflecting percentComplete()', () => {
    const fixture = render({
      percentComplete: 67,
      isComplete: false,
      items: items(),
      nextActionItemKey: 'listings',
    });
    const bar = (fixture.nativeElement as HTMLElement).querySelector('[role="progressbar"] > div') as HTMLElement;

    expect(bar.style.width).toBe('67%');
  });
});

describe('StoreReadinessBarComponent — compact success state (AC-11)', () => {
  it('collapses to a single-line success message with no checklist and no action buttons', () => {
    const fixture = render({
      percentComplete: 100,
      isComplete: true,
      items: items({
        payout_account: { done: true },
        profile_picture: { done: true },
        listings: { done: true, currentCount: 5, targetCount: 3 },
      }),
      nextActionItemKey: null,
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('ร้านของคุณพร้อมขายเต็มที่แล้ว 🎉 100%');
    expect(el.querySelectorAll('li').length).toBe(0);
    expect(el.querySelectorAll('a').length).toBe(0);
  });

  it('shows no dismiss/close button', () => {
    const fixture = render({
      percentComplete: 100,
      isComplete: true,
      items: items({
        payout_account: { done: true },
        profile_picture: { done: true },
        listings: { done: true, currentCount: 5, targetCount: 3 },
      }),
      nextActionItemKey: null,
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('button').length).toBe(0);
  });
});

describe('StoreReadinessBarComponent — action buttons navigate via backend-supplied actionRoute (AC-12)', () => {
  it('never hardcodes a route — each link href matches its item.actionRoute exactly', () => {
    const fixture = render({
      percentComplete: 0,
      isComplete: false,
      items: items(),
      nextActionItemKey: 'payout_account',
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('a[href="/seller/settings"]')).toBeTruthy();
    expect(el.querySelector('a[href="/seller/upload"]')).toBeTruthy();
  });
});

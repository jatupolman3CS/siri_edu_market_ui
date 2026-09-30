import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NzMessageService } from 'ng-zorro-antd/message';
import { SellerStoreSectionsPage } from './store-sections.page';
import { SellerService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import type { DocumentItem } from '../../../core/models';

/**
 * responsive-ui v1.4 gate fixes (G1-5) on /seller/store-sections:
 *  - F158 (R-4): the document picker is the only place a title shows while choosing, so a long
 *    title wraps instead of being cut to ~15 characters with an ellipsis;
 *  - G-14d: a long unbroken section name wraps inside its 2-line clamp instead of being cut
 *    sideways mid-glyph.
 */
const LONG = 'เอกสารสรุปเนื้อหาคณิตศาสตร์ ม.6 เตรียมสอบ A-Level ฉบับสมบูรณ์ ปี 2569';

function render(sections: { id: string; name: string; sortOrder: number; documentIds: string[] }[] = []) {
  const docs = signal([{ id: 'd1', title: LONG } as DocumentItem]);
  const seller = {
    myDocuments: docs.asReadonly(),
    refreshDocuments: vi.fn(async () => {}),
    listStoreSections: vi.fn(async () => sections),
  };
  TestBed.configureTestingModule({
    imports: [SellerStoreSectionsPage],
    providers: [
      { provide: SellerService, useValue: seller },
      { provide: ApiFailureReporter, useValue: { report: vi.fn() } },
      { provide: NzMessageService, useValue: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(SellerStoreSectionsPage);
  fixture.detectChanges();
  return fixture;
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

afterEach(() => TestBed.resetTestingModule());

describe('SellerStoreSectionsPage — long titles (responsive v1.4)', () => {
  it('F158: picker titles wrap (no truncate) and can shrink next to the checkbox', async () => {
    const fixture = render();
    await settle();
    fixture.componentInstance.startCreate();
    fixture.detectChanges();

    const span = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('ul.max-h-72 li button > span')).find(
      (s) => s.textContent?.includes(LONG),
    ) as HTMLElement;
    expect(span).toBeTruthy();
    expect(span.classList.contains('truncate')).toBe(false);
    expect(span.classList.contains('[overflow-wrap:anywhere]')).toBe(true);
    expect(span.classList.contains('min-w-0')).toBe(true);
  });

  it('G-14d: section names wrap long tokens inside their 2-line clamp', async () => {
    const fixture = render([{ id: 's1', name: 'หมวดQDefaultParitye7aa0b3c4d5e6f', sortOrder: 0, documentIds: [] }]);
    await settle();
    fixture.detectChanges();

    const h3 = (fixture.nativeElement as HTMLElement).querySelector('li.card-tile h3') as HTMLElement;
    expect(h3.textContent).toContain('หมวดQDefaultParitye7aa0b3c4d5e6f');
    expect(h3.classList.contains('line-clamp-2')).toBe(true);
    expect(h3.classList.contains('[overflow-wrap:anywhere]')).toBe(true);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { QuickViewModalComponent } from './quick-view-modal.component';
import { CartService, QuickViewService, WishlistService } from '../../../core/services';
import { mapDocument } from '../../../core/api-mappers/mappers';
import type { DocumentItem } from '../../../core/models';

function buildDoc(over: Partial<DocumentItem> = {}): DocumentItem {
  return {
    ...mapDocument({ id: 'doc-1', slug: 'doc-1', title: 'สรุปเคมี ม.6', shortDescription: '', price: 100 }),
    ...over,
  };
}

async function render(doc: DocumentItem) {
  TestBed.configureTestingModule({
    imports: [QuickViewModalComponent],
    providers: [
      provideNoopAnimations(),
      provideRouter([]),
      { provide: CartService, useValue: { has: () => false, add: vi.fn() } },
      { provide: WishlistService, useValue: { has: () => false, toggle: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(QuickViewModalComponent);
  fixture.detectChanges();
  TestBed.inject(QuickViewService).open(doc);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('QuickViewModalComponent', () => {
  afterEach(() => {
    // nz-modal renders into the CDK overlay container on <body>, which outlives the fixture.
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => (node.innerHTML = ''));
    TestBed.resetTestingModule();
  });

  it('fills the preview-page count into "shared.quickView.previewPages" instead of printing "{pages}"', async () => {
    await render(buildDoc({ previewPages: 5 }));

    const text = document.body.textContent ?? '';
    expect(text).toContain('ตัวอย่างเอกสาร (5 หน้า)');
    expect(text).not.toContain('{pages}');
  });
});

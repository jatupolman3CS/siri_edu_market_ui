import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  BundleService,
  CatalogService,
  RecentlyViewedService,
} from '../../../core/services';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { SectionHeaderComponent } from '../../../shared/components/section-header/section-header.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-buyer-home',
  standalone: true,
  imports: [
    RouterLink,
    DocumentCardComponent,
    BundleCardComponent,
    SectionHeaderComponent,
    IconComponent,
    CompactPipe,
    EmptyStateComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class BuyerHomePage {
  readonly catalog = inject(CatalogService);
  readonly bundles = inject(BundleService);
  readonly recent = inject(RecentlyViewedService);
  private readonly router = inject(Router);

  readonly quickSearches = [
    'สรุปคณิตม.ปลาย',
    'Pitch Deck',
    'TOEIC',
    'Resume',
    'งานวิจัย',
  ];

  readonly howItWorks = [
    {
      no: '1',
      emoji: '🔍',
      title: 'ค้นหาเอกสารที่ใช่',
      desc: 'กรองหมวดหมู่ ระดับชั้น และคะแนนรีวิว เลือกเอกสารที่ตรงกับความต้องการของคุณ พร้อมพรีวิวก่อนซื้อ',
    },
    {
      no: '2',
      emoji: '💳',
      title: 'ชำระอย่างปลอดภัย',
      desc: 'ชำระผ่าน PromptPay / บัตรเครดิต ไฟล์มีลายน้ำเฉพาะคุณ ดาวน์โหลดได้ทันทีหลังชำระเงิน',
    },
    {
      no: '3',
      emoji: '📚',
      title: 'เก็บไว้ในคลังของคุณ',
      desc: 'ดาวน์โหลดได้ตลอดเวลาในคลังเอกสารส่วนตัว และให้คะแนน + รีวิวเพื่อช่วยผู้ซื้อท่านอื่น',
    },
  ];

  constructor() {
    // Explicit init to avoid root service auto-fetching on unrelated pages.
    this.catalog.initForHome();
    // Ensure free section has fresh data (and visible loading/error state).
    this.catalog.loadFreeResources();
  }

  get featuredSellers() {
    return this.catalog
      .documents()
      .map((d) => d.seller)
      .filter((s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx)
      .slice(0, 6);
  }

  goSearch(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.elements.namedItem('q') as HTMLInputElement;
    this.router.navigate(['/marketplace'], {
      queryParams: input.value ? { q: input.value } : {},
    });
  }
}

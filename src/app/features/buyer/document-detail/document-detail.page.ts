import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NzTabsModule } from 'ng-zorro-antd/tabs';
import { NzMessageService } from 'ng-zorro-antd/message';
import {
  AuthService,
  BundleService,
  CartService,
  CatalogService,
  FollowService,
  LibraryService,
  RecentlyViewedService,
  WishlistService,
} from '../../../core/services';

import {
  GRADE_LEVEL_LABELS,
  RESOURCE_TYPE_ICONS,
  RESOURCE_TYPE_LABELS,
} from '../../../core/models';
import { resolvePublicUrl } from '../../../core/api-runtime';
import { ReportDocumentComponent } from '../../../shared/components/report-document/report-document.component';

import type { MarketplaceDocumentPreviewResponse } from '../../../core/api/types.gen';
import { DocumentCardComponent } from '../../../shared/components/document-card/document-card.component';
import { BundleCardComponent } from '../../../shared/components/bundle-card/bundle-card.component';
import { RatingStarsComponent } from '../../../shared/components/rating-stars/rating-stars.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';

@Component({
  selector: 'app-buyer-document-detail',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NzTabsModule,
    DocumentCardComponent,
    BundleCardComponent,
    RatingStarsComponent,
    IconComponent,
    EmptyStateComponent,
    ReportDocumentComponent,
    ThbPipe,
    CompactPipe,
    TimeAgoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './document-detail.page.html',
  styleUrl: './document-detail.page.scss',
})
export class BuyerDocumentDetailPage {
  readonly catalog = inject(CatalogService);
  readonly cart = inject(CartService);
  readonly wishlist = inject(WishlistService);
  readonly follow = inject(FollowService);
  readonly library = inject(LibraryService);
  private readonly auth = inject(AuthService);
  private readonly bundles = inject(BundleService);
  private readonly recent = inject(RecentlyViewedService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly message = inject(NzMessageService);

  readonly id = signal<string>('');
  readonly selectedImage = signal<number>(0);
  readonly preview = signal<MarketplaceDocumentPreviewResponse | null>(null);
  readonly previewLoading = signal<boolean>(false);
  readonly showPreviewGallery = signal<boolean>(false);

  readonly doc = computed(() => this.catalog.getById(this.id()));

  readonly previewRasterUrls = computed(() => {
    const urls = this.preview()?.previewImageUrls ?? [];
    return urls.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
  });
  readonly related = computed(() => this.catalog.getRelated(this.id(), 4));
  readonly owned = computed(() => {
    if (!this.auth.isAuthenticated()) return false;
    const id = this.id();
    if (!id) return false;
    return this.library.library().some((x) => x.document.id === id);
  });

  readonly relatedBundles = computed(() =>
    this.bundles.getRelatedBundles(this.id()),
  );

  readonly moreFromSeller = computed(() => {
    const d = this.doc();
    if (!d) return [];
    return this.catalog
      .documents()
      .filter((x) => x.seller.id === d.seller.id && x.id !== d.id)
      .slice(0, 4);
  });

  readonly ratingBreakdown = computed(() => {
    const d = this.doc();
    if (!d) return [];
    const dist: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    d.reviews.forEach((r) => (dist[r.rating] = (dist[r.rating] ?? 0) + 1));
    const total = d.reviews.length || 1;
    return [5, 4, 3, 2, 1].map((score) => ({
      score,
      percent: Math.round(((dist[score] ?? 0) / total) * 100),
    }));
  });

  isFollowing(): boolean {
    return this.follow.isFollowing(this.doc()?.seller.id ?? '');
  }

  resourceLabel(t: string): string {
    return RESOURCE_TYPE_LABELS[t as keyof typeof RESOURCE_TYPE_LABELS] ?? t;
  }
  resourceIcon(t: string): string {
    return RESOURCE_TYPE_ICONS[t as keyof typeof RESOURCE_TYPE_ICONS] ?? '📄';
  }
  gradeLabels(grades: readonly string[]): string {
    return grades
      .map((g) => GRADE_LEVEL_LABELS[g as keyof typeof GRADE_LEVEL_LABELS] ?? g)
      .join(', ');
  }

  previewImgSrc(pathOrUrl: string): string {
    return resolvePublicUrl(pathOrUrl);
  }

  closePreviewGallery(): void {
    this.showPreviewGallery.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscapeCloseGallery(): void {
    if (this.showPreviewGallery()) this.closePreviewGallery();
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.id.set(id);
      this.selectedImage.set(0);
      this.showPreviewGallery.set(false);
      this.preview.set(null);
      if (id) this.catalog.loadDocumentDetail(id);
    });
    // Track recently viewed
    effect(() => {
      const d = this.doc();
      if (d) this.recent.push(d);
    });
    // Best-effort: load library once for owned-check
    effect(() => {
      if (!this.auth.isAuthenticated()) return;
      const id = this.id();
      if (!id) return;
      void this.library.refreshLibraryOnce();
    });
    effect((onCleanup) => {
      if (typeof document === 'undefined') return;
      if (!this.showPreviewGallery()) return;
      document.body.style.overflow = 'hidden';
      onCleanup(() => {
        document.body.style.overflow = '';
      });
    });
  }

  buyNow(id: string): void {
    if (this.owned()) {
      this.message.info('คุณมีเอกสารนี้อยู่ในคลังแล้ว');
      this.router.navigate(['/library']);
      return;
    }
    if (!this.cart.has(id)) {
      const d = this.catalog.getById(id);
      if (d) this.cart.add(d);
    }
    if (!this.auth.isAuthenticated()) {
      this.message.warning('กรุณาเข้าสู่ระบบก่อนทำการชำระเงิน');
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: '/checkout' },
      });
      return;
    }
    this.router.navigate(['/checkout']);
  }

  downloadFree(): void {
    if (!this.auth.isAuthenticated()) {
      this.message.warning('กรุณาเข้าสู่ระบบเพื่อดาวน์โหลดและบันทึกในคลังของคุณ');
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: this.router.url },
      });
      return;
    }
    const d = this.doc();
    if (d) {
      this.library.download(d.id);
    }
  }

  openPreview(): void {
    const id = this.id();
    const d = this.doc();
    if (!id || !d) return;
    if ((d.previewPages ?? 0) <= 0) {
      this.message.info('เอกสารนี้ยังไม่เปิดพรีวิว');
      return;
    }
    if (this.previewLoading()) return;

    void (async () => {
      this.previewLoading.set(true);
      try {
        const data = await this.catalog.loadDocumentPreview(id);
        this.preview.set(data);
        const raster = data.previewImageUrls?.filter((u) => u?.trim()) ?? [];
        if (raster.length > 0) {
          this.showPreviewGallery.set(true);
        } else {
          this.message.warning(
            'ยังไม่มีพรีวิวภาพพร้อมลายน้ำสำหรับเอกสารนี้ — ตรวจสอบว่าเป็น PDF และมีไฟล์ในระบบจัดเก็บ',
          );
        }
      } catch {
        this.message.error('โหลดพรีวิวไม่สำเร็จ');
      } finally {
        this.previewLoading.set(false);
      }
    })();
  }

  // ===== GAP-06: asking the seller a question =====
  // The QNA table was rendered here but nothing could create a question, so buyers had no
  // way to ask anything before buying.

  readonly newQuestion = signal<string>('');
  readonly askingQuestion = signal<boolean>(false);
  readonly questionSent = signal<boolean>(false);

  async askQuestion(documentId: string): Promise<void> {
    if (this.askingQuestion()) return;

    if (!this.auth.isAuthenticated()) {
      void this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl: `/document/${documentId}` },
      });
      return;
    }

    const question = this.newQuestion().trim();
    if (question.length < 5) {
      this.message.warning('กรุณาพิมพ์คำถามอย่างน้อย 5 ตัวอักษร');
      return;
    }

    this.askingQuestion.set(true);
    try {
      await this.catalog.askDocumentQuestion(documentId, question);
      this.newQuestion.set('');
      this.questionSent.set(true);
      this.message.success('ส่งคำถามเรียบร้อย ผู้ขายจะตอบกลับเร็ว ๆ นี้');
    } catch {
      this.message.error('ส่งคำถามไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      this.askingQuestion.set(false);
    }
  }
}

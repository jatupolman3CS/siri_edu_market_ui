import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NzMessageService } from 'ng-zorro-antd/message';
import { RouterLink } from '@angular/router';
import type { SellerBundleItemResponse, SellerBundleResponse } from '../../../core/api';
import { BundleService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { extractErrorCode, extractErrorStatus } from '../../../core/services/api-result';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';

/**
 * F-04 (N-02): the seller's side of bundles.
 *
 * Everything downstream already worked — /bundles, /bundle/:id, adding one to the cart, and the
 * proportional price split in CartPricingCalculator. There was simply no way to make one, so
 * the only bundles that could exist were the seeder's and the public page was going to be empty
 * forever in production.
 *
 * The server enforces every rule independently (at least two documents, all of them the
 * seller's own and approved, price below the sum). What this page adds is showing the seller
 * the numbers while they type, so a rejection is the unusual case rather than the way they
 * discover the rules.
 */
@Component({
  selector: 'app-seller-bundles',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, EmptyStateComponent, ThbPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bundles.page.html',
})
export class SellerBundlesPage {
  private readonly bundleService = inject(BundleService);
  private readonly apiFail = inject(ApiFailureReporter);
  private readonly message = inject(NzMessageService);

  readonly bundles = signal<SellerBundleResponse[]>([]);
  readonly candidates = signal<SellerBundleItemResponse[]>([]);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  /**
   * QA fix: `RequireSellerProfileFilter` answers a clean `403 seller_profile_required` for a
   * caller (typically an Admin) with no `SELLER_PROFILE` row — shown as a friendly "no store yet"
   * state instead of the generic connection-failure toast.
   */
  readonly sellerProfileRequired = signal<boolean>(false);

  /** Bundle being edited; null while creating a new one. */
  readonly editingId = signal<string | null>(null);
  readonly formOpen = signal<boolean>(false);
  readonly title = signal<string>('');
  readonly description = signal<string>('');
  readonly coverUrl = signal<string>('');
  readonly price = signal<number | null>(null);
  readonly selectedDocumentIds = signal<string[]>([]);

  /** Sum of the selected documents' list prices — the same figure the server computes. */
  readonly originalPrice = computed(() => {
    const selected = new Set(this.selectedDocumentIds());
    return this.candidates()
      .filter((c) => c.documentId && selected.has(c.documentId))
      .reduce((sum, c) => sum + (c.price ?? 0), 0);
  });

  readonly savingAmount = computed(() => {
    const price = this.price() ?? 0;
    const original = this.originalPrice();
    return price > 0 && original > price ? original - price : 0;
  });

  readonly savingPercent = computed(() => {
    const original = this.originalPrice();
    return original > 0 ? Math.round((this.savingAmount() / original) * 100) : 0;
  });

  /**
   * Mirrors the server's rules so the button explains itself before the request is made. The
   * server still checks all of them — this is a courtesy, not the enforcement.
   */
  readonly validationError = computed<string | null>(() => {
    if (!this.title().trim()) return 'กรุณาตั้งชื่อแพ็กเกจ';
    if (!this.description().trim()) return 'กรุณาใส่คำอธิบายแพ็กเกจ';
    if (this.selectedDocumentIds().length < 2) return 'เลือกเอกสารอย่างน้อย 2 ชิ้น';
    const price = this.price() ?? 0;
    if (price <= 0) return 'ราคาแพ็กเกจต้องมากกว่า 0';
    if (price >= this.originalPrice()) return 'ราคาแพ็กเกจต้องถูกกว่าผลรวมราคาปกติ';
    return null;
  });

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const [bundles, candidates] = await Promise.all([
        this.bundleService.listMyBundles(),
        this.bundleService.listBundleCandidates(),
      ]);
      this.bundles.set(bundles);
      this.candidates.set(candidates);
      this.sellerProfileRequired.set(false);
    } catch (e) {
      if (extractErrorStatus(e) === 403 && extractErrorCode(e) === 'seller_profile_required') {
        this.sellerProfileRequired.set(true);
      } else {
        this.apiFail.report('โหลดแพ็กเกจของฉัน', e);
      }
      this.bundles.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  startCreate(): void {
    this.editingId.set(null);
    this.title.set('');
    this.description.set('');
    this.coverUrl.set('');
    this.price.set(null);
    this.selectedDocumentIds.set([]);
    this.formOpen.set(true);
  }

  startEdit(bundle: SellerBundleResponse): void {
    this.editingId.set(bundle.id ?? null);
    this.title.set(bundle.title ?? '');
    this.description.set(bundle.description ?? '');
    this.coverUrl.set(bundle.coverUrl ?? '');
    this.price.set(bundle.price ?? null);
    this.selectedDocumentIds.set(
      (bundle.items ?? []).map((i) => i.documentId).filter((id): id is string => !!id),
    );
    this.formOpen.set(true);
  }

  cancel(): void {
    this.formOpen.set(false);
    this.editingId.set(null);
    this.selectedDocumentIds.set([]);
  }

  isSelected(documentId: string): boolean {
    return this.selectedDocumentIds().includes(documentId);
  }

  toggleDocument(documentId: string): void {
    this.selectedDocumentIds.update((ids) =>
      ids.includes(documentId) ? ids.filter((id) => id !== documentId) : [...ids, documentId],
    );
  }

  async save(): Promise<void> {
    const problem = this.validationError();
    if (problem) {
      this.message.warning(problem);
      return;
    }
    if (this.saving()) return;

    this.saving.set(true);
    try {
      await this.bundleService.saveMyBundle(this.editingId(), {
        title: this.title().trim(),
        description: this.description().trim(),
        coverUrl: this.coverUrl().trim(),
        price: this.price() ?? 0,
        documentIds: this.selectedDocumentIds(),
      });
      this.message.success('บันทึกแพ็กเกจเรียบร้อย');
      this.cancel();
      await this.reload();
    } catch (e) {
      this.apiFail.report('บันทึกแพ็กเกจ', e);
    } finally {
      this.saving.set(false);
    }
  }

  async remove(bundle: SellerBundleResponse): Promise<void> {
    if (this.saving() || !bundle.id) return;

    // The server refuses this too; the disabled button and this guard only save the round trip.
    if (bundle.canDelete === false) {
      this.message.warning('ลบไม่ได้เพราะมีคำสั่งซื้อที่อ้างถึงแพ็กเกจนี้แล้ว');
      return;
    }

    this.saving.set(true);
    try {
      await this.bundleService.deleteMyBundle(bundle.id);
      this.message.success('ลบแพ็กเกจเรียบร้อย');
      await this.reload();
    } catch (e) {
      this.apiFail.report('ลบแพ็กเกจ', e);
    } finally {
      this.saving.set(false);
    }
  }
}

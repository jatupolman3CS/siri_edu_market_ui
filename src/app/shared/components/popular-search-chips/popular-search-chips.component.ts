import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PopularSearchTerm } from '../../../core/models';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';

/**
 * crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) §3.1/§4.3 — the "คำค้นยอดนิยม"
 * chip row, shared between the home page (label `home.trendingNow` — "ฮิตตอนนี้:") and the
 * `/marketplace` discovery block (label "คนอื่นกำลังค้นหา:", §3.2 `DiscoveryResponse.popularTerms`).
 *
 * AC-25/AC-26: when `terms()` is non-empty, every chip links to `/marketplace?q=<term>` and a 🔥
 * badge marks `isRising` terms (`title="มาแรงในสัปดาห์นี้"`, §4.3 — "ห้ามเขียนข้อความบอกว่าชิปถูก
 * ปรับตามความสนใจของผู้ใช้"). When `terms()` is empty (not loaded yet / genuinely no data /
 * request failed), it falls back to `fallbackTerms()` — the home page passes its existing
 * hardcoded `quickSearches` there (AC-26 "ห้ามแสดงแถวชิปว่าง"); marketplace's discovery block
 * passes `[]` so the whole chip row simply renders nothing (the parent hides the block entirely
 * per §4.3's "sections.length === 0 && popularTerms.length === 0").
 */
@Component({
  selector: 'app-popular-search-chips',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './popular-search-chips.component.html',
})
export class PopularSearchChipsComponent {
  readonly terms = input<PopularSearchTerm[]>([]);
  readonly fallbackTerms = input<readonly string[]>([]);
  readonly label = input<string>('');
}

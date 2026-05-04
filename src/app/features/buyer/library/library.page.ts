import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LibraryService } from '../../../core/services';
import { PageHeroComponent } from '../../../shared/components/page-hero/page-hero.component';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { StatCardComponent } from '../../../shared/components/stat-card/stat-card.component';
import { ThbPipe } from '../../../shared/pipes/thb.pipe';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { CompactPipe } from '../../../shared/pipes/compact.pipe';

@Component({
  selector: 'app-buyer-library',
  standalone: true,
  imports: [
    RouterLink,
    PageHeroComponent,
    IconComponent,
    EmptyStateComponent,
    StatCardComponent,
    ThbPipe,
    TimeAgoPipe,
    CompactPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './library.page.html',
  styleUrl: './library.page.scss',
})
export class BuyerLibraryPage {
  readonly library = inject(LibraryService);

  readonly tab = signal<'all' | 'recent'>('all');
  readonly tabs = [
    { value: 'all' as const, label: 'ทั้งหมด' },
    { value: 'recent' as const, label: 'เพิ่งดาวน์โหลด' },
  ];
}

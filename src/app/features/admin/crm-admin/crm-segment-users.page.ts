import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CrmService } from '../../../core/services';
import { ApiFailureReporter } from '../../../core/services/api-failure-reporter.service';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';

/**
 * crm-core v1 §3.5, §4.1, §4.4 (`docs/contracts/crm-core.md`) — "สมาชิกของกลุ่ม {code}":
 * **not** a general user list (that is F-08's `/admin/users`, §4.4) — read-only sample of one
 * segment's members so an admin can sanity-check the job's output. No row has any action.
 *
 * Round 1: the fetch behind `CrmService`'s segment-users pager throws `TODO(contract)`
 * (see its class doc) — this page renders the pager's empty/error state until round 2.
 */
@Component({
  selector: 'app-crm-segment-users',
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, EmptyStateComponent, PaginationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-segment-users.page.html',
})
export class CrmSegmentUsersPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly crm = inject(CrmService);
  private readonly apiFail = inject(ApiFailureReporter);

  readonly code = signal(this.route.snapshot.paramMap.get('code') ?? '');

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      await this.crm.loadSegmentUsers(this.code());
    } catch (e) {
      this.apiFail.report('โหลดสมาชิกของกลุ่ม', e);
    }
  }

  async onPageChange(page: number): Promise<void> {
    try {
      await this.crm.onSegmentUsersPageChange(page);
    } catch (e) {
      this.apiFail.report('โหลดสมาชิกของกลุ่ม', e);
    }
  }

  async onPageSizeChange(size: number): Promise<void> {
    try {
      await this.crm.onSegmentUsersPageSizeChange(size);
    } catch (e) {
      this.apiFail.report('โหลดสมาชิกของกลุ่ม', e);
    }
  }

  openUser(userId: string): void {
    void this.router.navigate(['/admin/crm/users', userId]);
  }
}

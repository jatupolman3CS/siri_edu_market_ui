import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CrmUserPanelComponent } from '../../../shared/components/crm-user-panel/crm-user-panel.component';

/**
 * crm-core v1 §3.6, §4.1, §4.4 (`docs/contracts/crm-core.md`) — "/admin/crm/users/:id": full-page
 * wrapper around `CrmUserPanelComponent`. Reached either directly or as a deep link from a
 * segment's member table (`CrmSegmentUsersPage`). §4.4: once F-08's `/admin/users/:id` embeds the
 * same panel, this route stays as the deep-link target — not a duplicate.
 */
@Component({
  selector: 'app-crm-user',
  standalone: true,
  imports: [RouterLink, CrmUserPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './crm-user.page.html',
})
export class CrmUserPage {
  private readonly route = inject(ActivatedRoute);
  readonly userId = signal(this.route.snapshot.paramMap.get('id') ?? '');
}

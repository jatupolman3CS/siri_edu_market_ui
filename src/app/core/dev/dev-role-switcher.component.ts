import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UserRole } from '../models';
import { AuthService } from '../services/auth.service';
import { DevAuthBypassService } from './dev-auth-bypass.service';

/**
 * DEV-BYPASS: floating switcher for the account the app is impersonating. Renders nothing unless
 * the bypass is on, so it disappears from any build that has real sign-in.
 */
@Component({
  selector: 'app-dev-role-switcher',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (devAuth.enabled) {
      <div class="dev-switcher">
        <span class="dev-switcher__label">DEV</span>
        @for (role of roles; track role) {
          <button
            type="button"
            class="dev-switcher__btn"
            [class.dev-switcher__btn--active]="devAuth.role() === role"
            (click)="devAuth.setRole(role)"
          >
            {{ role }}
          </button>
        }
        <span class="dev-switcher__user">{{ auth.user()?.email || '—' }}</span>
      </div>
    }
  `,
  styles: [
    `
      .dev-switcher {
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 2000;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(17, 24, 39, 0.92);
        color: #f9fafb;
        font-size: 12px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
      }
      .dev-switcher__label {
        font-weight: 700;
        letter-spacing: 0.08em;
        color: #fbbf24;
      }
      .dev-switcher__btn {
        border: 1px solid rgba(249, 250, 251, 0.25);
        background: transparent;
        color: inherit;
        border-radius: 999px;
        padding: 2px 10px;
        cursor: pointer;
        text-transform: capitalize;
      }
      .dev-switcher__btn:hover {
        border-color: rgba(249, 250, 251, 0.6);
      }
      .dev-switcher__btn--active {
        background: #2563eb;
        border-color: #2563eb;
      }
      .dev-switcher__user {
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.75;
      }
    `,
  ],
})
export class DevRoleSwitcherComponent {
  protected readonly devAuth = inject(DevAuthBypassService);
  protected readonly auth = inject(AuthService);
  protected readonly roles: UserRole[] = ['buyer', 'seller', 'admin'];
}

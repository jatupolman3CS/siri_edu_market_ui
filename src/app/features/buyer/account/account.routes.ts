import type { Routes } from '@angular/router';

/**
 * One child route per /account sidebar entry — each section opens as its own page instead of
 * the sidebar scrolling one long page to a fragment. Paths equal the old fragment ids, so
 * `/account#cards` maps one-to-one onto `/account/cards`.
 *
 * `account/subscription`, `account/feedback` and `account/privacy` stay top-level routes in
 * app.routes.ts, declared before the `account` parent so they never reach these children.
 */
export const ACCOUNT_SECTION_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'profile' },
  {
    path: 'profile',
    loadComponent: () =>
      import('../../../shared/components/profile-editor/profile-editor.component').then(
        (m) => m.ProfileEditorComponent,
      ),
  },
  {
    path: 'password',
    loadComponent: () =>
      import('../../../shared/components/change-password/change-password.component').then(
        (m) => m.ChangePasswordComponent,
      ),
  },
  {
    path: 'notifications',
    loadComponent: () =>
      import(
        '../../../shared/components/notification-settings/notification-settings.component'
      ).then((m) => m.NotificationSettingsComponent),
  },
  // saved-cards v1 §4: `mode` defaults to 'manage'.
  {
    path: 'cards',
    loadComponent: () =>
      import('../../../shared/components/saved-cards/saved-cards.component').then(
        (m) => m.SavedCardsComponent,
      ),
  },
  {
    path: 'wallet',
    loadComponent: () =>
      import('./account-wallet.section').then((m) => m.AccountWalletSection),
  },
  {
    path: 'referral',
    loadComponent: () =>
      import('../../../shared/components/referral-card/referral-card.component').then(
        (m) => m.ReferralCardComponent,
      ),
  },
  {
    path: 'exam-countdown',
    loadComponent: () =>
      import(
        '../../../shared/components/exam-countdown-form/exam-countdown-form.component'
      ).then((m) => m.ExamCountdownFormComponent),
  },
  {
    path: 'shortcuts',
    loadComponent: () =>
      import('./account-shortcuts.section').then((m) => m.AccountShortcutsSection),
  },
];

import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';
import { adminGuard, sellerGuard } from './core/guards/role.guard';

export const routes: Routes = [
  // ========= Buyer (public + protected) =========
  {
    path: '',
    loadComponent: () =>
      import('./layouts/buyer/buyer-layout/buyer-layout.component').then(
        (m) => m.BuyerLayoutComponent,
      ),
    children: [
      // Public — no login needed
      {
        path: '',
        loadComponent: () =>
          import('./features/buyer/home/home.page').then((m) => m.BuyerHomePage),
        title: 'routes.home',
      },
      {
        path: 'marketplace',
        loadComponent: () =>
          import('./features/buyer/marketplace/marketplace.page').then(
            (m) => m.BuyerMarketplacePage,
          ),
        title: 'routes.marketplace',
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/buyer/categories/categories.page').then(
            (m) => m.BuyerCategoriesPage,
          ),
        title: 'routes.categories',
      },
      {
        path: 'category/:slug',
        loadComponent: () =>
          import('./features/buyer/category-detail/category-detail.page').then(
            (m) => m.BuyerCategoryDetailPage,
          ),
      },
      {
        path: 'document/:id',
        loadComponent: () =>
          import('./features/buyer/document-detail/document-detail.page').then(
            (m) => m.BuyerDocumentDetailPage,
          ),
      },
      {
        path: 'bundles',
        loadComponent: () =>
          import('./features/buyer/bundles/bundles.page').then(
            (m) => m.BuyerBundlesPage,
          ),
        title: 'routes.bundles',
      },
      {
        path: 'bundle/:id',
        loadComponent: () =>
          import('./features/buyer/bundle-detail/bundle-detail.page').then(
            (m) => m.BuyerBundleDetailPage,
          ),
      },
      {
        path: 'free',
        loadComponent: () =>
          import('./features/buyer/free/free.page').then((m) => m.BuyerFreePage),
        title: 'routes.free',
      },
      {
        path: 'store/:id',
        loadComponent: () =>
          import('./features/buyer/storefront/storefront.page').then(
            (m) => m.BuyerStorefrontPage,
          ),
      },
      // Wishlist is guest-accessible — backend now scopes anonymous visitors via a
      // cookie-backed session (see docs/contracts/anonymous-cart-wishlist-scoping.md)
      {
        path: 'wishlist',
        loadComponent: () =>
          import('./features/buyer/wishlist/wishlist.page').then(
            (m) => m.BuyerWishlistPage,
          ),
        title: 'routes.wishlist',
      },
      // exam-hub-landing-pages v1 §4: 4 dedicated landing pages for national exam hubs.
      {
        path: 'tcas',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'tcas' },
        title: 'routes.tcas',
      },
      {
        path: 'tgat-tpat',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'tgat-tpat' },
        title: 'routes.tgatTpat',
      },
      {
        path: 'a-level',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'a-level' },
        title: 'routes.aLevel',
      },
      {
        path: 'onet',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'onet' },
        title: 'routes.onet',
      },

      // Protected — require auth
      {
        path: 'become-seller',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/become-seller/become-seller.page').then(
            (m) => m.BecomeSellerPage,
          ),
        title: 'routes.becomeSeller',
      },
      {
        path: 'library',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/library/library.page').then(
            (m) => m.BuyerLibraryPage,
          ),
        title: 'routes.library',
      },
      // F-07: a buyer's own account page. Until now the only way to reach
      // PUT /api/me/profile was /seller/settings, behind the seller guard.
      {
        path: 'account',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/account/account.page').then((m) => m.AccountPage),
        title: 'routes.account',
      },
      // subscription-membership v2 §4: "สมัครสมาชิกรายเดือน" — choose categories, see the
      // running total, subscribe.
      {
        path: 'subscribe',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/subscribe/subscribe.page').then(
            (m) => m.BuyerSubscribePage,
          ),
        title: 'routes.subscriptionCheckout',
      },
      // subscription-membership v2 §4: current subscription status + cancel.
      {
        path: 'account/subscription',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/account-subscription/account-subscription.page').then(
            (m) => m.AccountSubscriptionPage,
          ),
        title: 'routes.subscription',
      },
      // subscription-membership v2 §4: history of documents accessed via subscription.
      {
        path: 'account/subscription/access-history',
        canActivate: [authGuard],
        loadComponent: () =>
          import(
            './features/buyer/account-subscription/subscription-access-history.page'
          ).then((m) => m.SubscriptionAccessHistoryPage),
        title: 'routes.accessLogs',
      },
      // system-feedback v1 §4.3: buyer-facing feedback & bug report history.
      {
        path: 'account/feedback',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/feedback/feedback.page').then(
            (m) => m.BuyerFeedbackPage,
          ),
        title: 'routes.feedback',
      },
      // crm-core v1 §4.1: "ความเป็นส่วนตัวของฉัน" — view/opt-out/delete the CRM data the platform
      // has learned from this buyer's view/search/purchase behaviour (§3.1–§3.3, PDPA §8.5).
      {
        path: 'account/privacy',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/account-privacy/account-privacy.page').then(
            (m) => m.AccountPrivacyPage,
          ),
        title: 'routes.privacy',
      },
      // buyer-wallet v1 §4.1: "กระเป๋าเงินของฉัน"
      {
        path: 'wallet',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/wallet/wallet.page').then(
            (m) => m.WalletPage,
          ),
        title: 'routes.wallet',
      },
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/checkout/checkout.page').then(
            (m) => m.BuyerCheckoutPage,
          ),
        title: 'routes.checkout',
      },
      {
        path: 'orders',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/orders/orders.page').then(
            (m) => m.BuyerOrdersPage,
          ),
        title: 'routes.orders',
      },
      {
        path: 'orders/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/order-detail/order-detail.page').then(
            (m) => m.BuyerOrderDetailPage,
          ),
        title: 'routes.orderDetail',
      },
      // follow-store-notifications v1 §4: in-app notification history for follow-store alerts.
      // notification-master-config v1 §4.1: scoped to the buyer audience — seller/admin have
      // their own route inside their own layout (AC-7).
      {
        path: 'notifications',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/notifications/notifications.page').then(
            (m) => m.NotificationsPage,
          ),
        data: { audience: 'buyer' },
        title: 'routes.notifications',
      },
      // registration-onboarding v1 §4: onboarding flow for new accounts.
      {
        path: 'onboarding/role',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/onboarding/role-select/role-select.page').then(
            (m) => m.RoleSelectPage,
          ),
        title: 'routes.onboarding',
      },
      {
        path: 'onboarding/interests',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/onboarding/interest-select/interest-select.page').then(
            (m) => m.InterestSelectPage,
          ),
        title: 'routes.interests',
      },
    ],
  },

  // ========= Seller (auth required) =========
  {
    path: 'seller',
    canActivate: [authGuard, sellerGuard],
    loadComponent: () =>
      import('./layouts/seller/seller-layout/seller-layout.component').then(
        (m) => m.SellerLayoutComponent,
      ),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/seller/dashboard/dashboard.page').then(
            (m) => m.SellerDashboardPage,
          ),
        title: 'routes.sellerDashboard',
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/seller/documents/documents.page').then(
            (m) => m.SellerDocumentsPage,
          ),
      },
      {
        path: 'upload',
        loadComponent: () =>
          import('./features/seller/upload/upload.page').then(
            (m) => m.SellerUploadPage,
          ),
      },
      {
        path: 'pdf-preview',
        redirectTo: 'documents',
        pathMatch: 'full',
      },
      {
        path: 'documents/:id/watermark',
        loadComponent: () =>
          import('./features/seller/watermark-editor/watermark-editor.page').then(
            (m) => m.WatermarkEditorPage,
          ),
        title: 'routes.sellerWatermarkDoc',
      },
      {
        path: 'watermark',
        loadComponent: () =>
          import('./features/seller/watermark-editor/watermark-editor.page').then(
            (m) => m.WatermarkEditorPage,
          ),
        title: 'routes.sellerWatermark',
      },
      // G-05: /seller/ai is gone — route, page, service method, endpoint and SDK helper all
      // removed in the dead-code sweep. It never called a language model: it concatenated
      // existing fields and wrote constant tags while the page advertised AI. Bringing it
      // back means writing a real generator first, not restoring this.
      {
        path: 'qna',
        loadComponent: () =>
          import('./features/seller/qna/qna.page').then((m) => m.SellerQnaPage),
      },
      {
        path: 'store-sections',
        loadComponent: () =>
          import('./features/seller/store-sections/store-sections.page').then(
            (m) => m.SellerStoreSectionsPage,
          ),
      },
      // F-04: bundles could be bought but never created — this is the missing half.
      {
        path: 'bundles',
        loadComponent: () =>
          import('./features/seller/bundles/bundles.page').then((m) => m.SellerBundlesPage),
      },
      {
        path: 'earnings',
        loadComponent: () =>
          import('./features/seller/earnings/earnings.page').then(
            (m) => m.SellerEarningsPage,
          ),
      },
      // seller-ads-promotion v1 §4.1: flat-fee ad campaigns bought with the seller's ledger balance.
      {
        path: 'ads',
        loadComponent: () =>
          import('./features/seller/ads/ads.page').then((m) => m.SellerAdsPage),
        title: 'routes.sellerAds',
      },
      {
        path: 'reviews',
        loadComponent: () =>
          import('./features/seller/reviews/reviews.page').then(
            (m) => m.SellerReviewsPage,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/seller/settings/settings.page').then(
            (m) => m.SellerSettingsPage,
          ),
      },
      // notification-master-config v1 §4.1 (AC-7): seller notification history, inside the
      // seller layout — previously the seller bell/sidebar linked to the buyer `/notifications`.
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/seller/notifications/notifications.page').then(
            (m) => m.SellerNotificationsPage,
          ),
        data: { audience: 'seller' },
        title: 'routes.sellerNotifications',
      },
    ],
  },

  // ========= Admin (auth required) =========
  {
    path: 'admin',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./layouts/admin/admin-layout/admin-layout.component').then(
        (m) => m.AdminLayoutComponent,
      ),
    children: [
      { path: 'dashboard', redirectTo: '/admin', pathMatch: 'full' },
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/dashboard/dashboard.page').then(
            (m) => m.AdminDashboardPage,
          ),
        title: 'routes.adminOverview',
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/admin/documents/documents.page').then(
            (m) => m.AdminDocumentsPage,
          ),
        title: 'routes.adminDocuments',
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./features/admin/document-detail/document-detail.page').then(
            (m) => m.AdminDocumentDetailPage,
          ),
        title: 'routes.adminDocumentDetail',
      },
      {
        path: 'approval',
        loadComponent: () =>
          import('./features/admin/approval/approval.page').then(
            (m) => m.AdminApprovalPage,
          ),
      },
      {
        path: 'transactions',
        loadComponent: () =>
          import('./features/admin/transactions/transactions.page').then(
            (m) => m.AdminTransactionsPage,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/admin/users/users.page').then(
            (m) => m.AdminUsersPage,
          ),
        title: 'routes.adminUsers',
      },
      {
        path: 'users/:userId',
        loadComponent: () =>
          import('./features/admin/user-detail/user-detail.page').then(
            (m) => m.AdminUserDetailPage,
          ),
        title: 'routes.adminUserDetail',
      },
      {
        path: 'sellers',
        loadComponent: () =>
          import('./features/admin/sellers/sellers.page').then(
            (m) => m.AdminSellersPage,
          ),
      },
      // F-10: the whole admin audit log, not just one document's slice of it.
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/admin/audit/audit.page').then((m) => m.AdminAuditPage),
      },
      // F-09: one place to read document reports, instead of opening documents to find them.
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/admin/reports/reports.page').then((m) => m.AdminReportsPage),
      },
      // system-feedback v1 §4.4: admin queue for feedback & bug reports.
      {
        path: 'feedback',
        loadComponent: () =>
          import('./features/admin/feedback/feedback-admin.page').then(
            (m) => m.AdminFeedbackPage,
          ),
        title: 'routes.adminFeedback',
      },
      {
        path: 'payouts',
        loadComponent: () =>
          import('./features/admin/payouts/payouts.page').then(
            (m) => m.AdminPayoutsPage,
          ),
      },
      // referral-program v2 §4.1: admin management for affiliate links.
      {
        path: 'affiliates',
        loadComponent: () =>
          import('./features/admin/affiliates/affiliates.page').then(
            (m) => m.AdminAffiliatesPage,
          ),
        title: 'routes.adminAffiliates',
      },
      // seller-ads-promotion v1 §4.1: all-campaigns queue + stop + placement price/capacity editor.
      {
        path: 'ads',
        loadComponent: () =>
          import('./features/admin/ads/ads-admin.page').then((m) => m.AdsAdminPage),
        title: 'routes.adminAds',
      },
      {
        path: 'seller-applications',
        loadComponent: () =>
          import(
            './features/admin/seller-applications/seller-applications.page'
          ).then((m) => m.AdminSellerApplicationsPage),
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/admin/categories-admin/categories-admin.page').then(
            (m) => m.AdminCategoriesPage,
          ),
      },
      // subscription-membership v2 §3.2/§4: read-only paginated list of all subscriptions.
      {
        path: 'subscriptions',
        loadComponent: () =>
          import('./features/admin/subscriptions-admin/subscriptions-admin.page').then(
            (m) => m.AdminSubscriptionsPage,
          ),
        title: 'routes.adminSubscriptions',
      },
      // crm-core v1 §4.1/§4.4: CRM overview + segment membership + one user's read-only
      // interest/segment breakdown (`CrmUserPanelComponent` — also the F-08 embed point, §4.4).
      {
        path: 'crm',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-admin.page').then((m) => m.CrmAdminPage),
        title: 'routes.adminCrm',
      },
      {
        path: 'crm/segments/:code',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-segment-users.page').then(
            (m) => m.CrmSegmentUsersPage,
          ),
        title: 'routes.adminCrmSegment',
      },
      {
        path: 'crm/users/:id',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-user.page').then((m) => m.CrmUserPage),
        title: 'routes.adminCrmProfile',
      },
      // crm-targeted-document-alerts v2 §4.1 (F-12, ข้อ 11): overview of the CRM-targeted
      // document alert queue — admin-only, no seller/buyer surface (§0.5 decision 7).
      {
        path: 'crm/document-alerts',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-document-alerts-admin.page').then(
            (m) => m.CrmDocumentAlertsAdminPage,
          ),
        title: 'routes.adminInterests',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/settings-admin/settings-admin.page').then(
            (m) => m.AdminSettingsPage,
          ),
      },
      // announcement-popup v1: CRUD for the buyer-facing popup announcements.
      {
        path: 'announcements',
        loadComponent: () =>
          import('./features/admin/announcements-admin/announcements-admin.page').then(
            (m) => m.AnnouncementsAdminPage,
          ),
        title: 'routes.adminAnnouncements',
      },
      // category-content-auto-generation v1: trigger/inspect the document auto-generation job —
      // generated documents land in the existing /admin/approval queue automatically.
      {
        path: 'document-generation',
        loadComponent: () =>
          import('./features/admin/document-generation/document-generation.page').then(
            (m) => m.AdminDocumentGenerationPage,
          ),
        title: 'routes.adminDocGeneration',
      },
      // exam-hub-landing-pages v1 §4: CMS management for the 4 exam hub pages.
      {
        path: 'exam-hub',
        loadComponent: () =>
          import('./features/admin/exam-hub/exam-hub-admin.page').then(
            (m) => m.ExamHubAdminPage,
          ),
        title: 'routes.adminExamHub',
      },
      // notification-master-config v1 §4.1 (AC-7): admin notification history, inside the
      // admin layout — the sidebar entry used to link to the buyer `/notifications` route.
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/admin/notifications/notifications.page').then(
            (m) => m.AdminNotificationsPage,
          ),
        data: { audience: 'admin' },
        title: 'routes.adminNotifications',
      },
      // notification-master-config v1 §3.7/§4.1: the master switchboard — which of the 18 catalog
      // events the platform sends, and over which channels (อีเมล / LINE / ในระบบ).
      {
        path: 'notification-config',
        loadComponent: () =>
          import('./features/admin/notification-config/notification-config-admin.page').then(
            (m) => m.NotificationConfigAdminPage,
          ),
        title: 'routes.adminNotificationConfig',
      },
      // ml-embedding-recommendations v1 §4.2: read-only "สถานะระบบแนะนำสินค้า (Bought Together)"
      // monitoring card — light, single-module, not a full page.
      {
        path: 'ml-recommendations',
        loadComponent: () =>
          import('./features/admin/ml-recommendations/ml-recommendations-admin.page').then(
            (m) => m.MlRecommendationsAdminPage,
          ),
        title: 'routes.adminMlRecommendations',
      },
    ],
  },

  // ========= Auth (guest only — no layout) =========
  {
    path: 'auth/login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.page').then((m) => m.AuthLoginPage),
    title: 'routes.signIn',
  },
  {
    path: 'auth/register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.page').then((m) => m.AuthRegisterPage),
    title: 'routes.register',
  },
  {
    path: 'auth/verify-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.page').then(
        (m) => m.AuthVerifyEmailPage,
      ),
    title: 'routes.verifyEmail',
  },
  {
    // external-login-and-mail-config v1 §4.1: LINE Login redirects the whole page back here with
    // `code`/`state` (or `error`), so it must be reachable while signed out — like verify-email
    // and reset-password, and unlike the guest-only login/register pages.
    path: 'auth/line/callback',
    loadComponent: () =>
      import('./features/auth/line-callback/line-callback.page').then(
        (m) => m.AuthLineCallbackPage,
      ),
    title: 'routes.lineCallback',
  },
  {
    path: 'auth/forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page').then(
        (m) => m.AuthForgotPasswordPage,
      ),
    title: 'routes.forgotPassword',
  },
  {
    // GAP-03: opened from the emailed link, so it must stay reachable while signed out.
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page').then(
        (m) => m.AuthResetPasswordPage,
      ),
    title: 'routes.resetPassword',
  },

  // ========= 404 =========
  // Bug #7: this route had no `title`, so Angular's TitleStrategy left `document.title` stuck on
  // whatever the previous route set (e.g. visiting /cart, which isn't a real route) instead of
  // reflecting the 404 state.
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
    title: 'routes.notFound',
  },
];

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
        title: 'SIRIEDUMARKET — เอกสารคุณภาพ จากครีเอเตอร์ตัวจริง',
      },
      {
        path: 'marketplace',
        loadComponent: () =>
          import('./features/buyer/marketplace/marketplace.page').then(
            (m) => m.BuyerMarketplacePage,
          ),
        title: 'ตลาดเอกสาร — SIRIEDUMARKET',
      },
      {
        path: 'categories',
        loadComponent: () =>
          import('./features/buyer/categories/categories.page').then(
            (m) => m.BuyerCategoriesPage,
          ),
        title: 'หมวดหมู่ — SIRIEDUMARKET',
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
        title: 'แพ็กเกจ — SIRIEDUMARKET',
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
        title: 'เอกสารฟรี — SIRIEDUMARKET',
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
        title: 'รายการโปรด — SIRIEDUMARKET',
      },
      // exam-hub-landing-pages v1 §4: 4 dedicated landing pages for national exam hubs.
      {
        path: 'tcas',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'tcas' },
        title: 'TCAS — ระบบคัดเลือกเข้ามหาวิทยาลัย — SIRIEDUMARKET',
      },
      {
        path: 'tgat-tpat',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'tgat-tpat' },
        title: 'TGAT/TPAT — SIRIEDUMARKET',
      },
      {
        path: 'a-level',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'a-level' },
        title: 'A-Level — SIRIEDUMARKET',
      },
      {
        path: 'onet',
        loadComponent: () =>
          import('./features/buyer/exam-hub/exam-hub.page').then((m) => m.ExamHubPage),
        data: { examType: 'onet' },
        title: 'O-NET — SIRIEDUMARKET',
      },

      // Protected — require auth
      {
        path: 'become-seller',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/become-seller/become-seller.page').then(
            (m) => m.BecomeSellerPage,
          ),
        title: 'เปิดร้านขายเอกสาร — SIRIEDUMARKET',
      },
      {
        path: 'library',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/library/library.page').then(
            (m) => m.BuyerLibraryPage,
          ),
        title: 'คลังของฉัน — SIRIEDUMARKET',
      },
      // F-07: a buyer's own account page. Until now the only way to reach
      // PUT /api/me/profile was /seller/settings, behind the seller guard.
      {
        path: 'account',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/account/account.page').then((m) => m.AccountPage),
        title: 'บัญชีของฉัน — SIRIEDUMARKET',
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
        title: 'สมัครสมาชิกรายเดือน — SIRIEDUMARKET',
      },
      // subscription-membership v2 §4: current subscription status + cancel.
      {
        path: 'account/subscription',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/account-subscription/account-subscription.page').then(
            (m) => m.AccountSubscriptionPage,
          ),
        title: 'สมาชิกรายเดือน — SIRIEDUMARKET',
      },
      // subscription-membership v2 §4: history of documents accessed via subscription.
      {
        path: 'account/subscription/access-history',
        canActivate: [authGuard],
        loadComponent: () =>
          import(
            './features/buyer/account-subscription/subscription-access-history.page'
          ).then((m) => m.SubscriptionAccessHistoryPage),
        title: 'ประวัติการเข้าถึงเอกสาร — SIRIEDUMARKET',
      },
      // system-feedback v1 §4.3: buyer-facing feedback & bug report history.
      {
        path: 'account/feedback',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/feedback/feedback.page').then(
            (m) => m.BuyerFeedbackPage,
          ),
        title: 'แจ้งปัญหา / ข้อเสนอแนะ — SIRIEDUMARKET',
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
        title: 'ความเป็นส่วนตัวของฉัน — SIRIEDUMARKET',
      },
      {
        path: 'checkout',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/checkout/checkout.page').then(
            (m) => m.BuyerCheckoutPage,
          ),
        title: 'ชำระเงิน — SIRIEDUMARKET',
      },
      {
        path: 'orders',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/orders/orders.page').then(
            (m) => m.BuyerOrdersPage,
          ),
        title: 'ประวัติคำสั่งซื้อ — SIRIEDUMARKET',
      },
      {
        path: 'orders/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/order-detail/order-detail.page').then(
            (m) => m.BuyerOrderDetailPage,
          ),
        title: 'รายละเอียดคำสั่งซื้อ — SIRIEDUMARKET',
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
        title: 'การแจ้งเตือน — SIRIEDUMARKET',
      },
      // registration-onboarding v1 §4: onboarding flow for new accounts.
      {
        path: 'onboarding/role',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/onboarding/role-select/role-select.page').then(
            (m) => m.RoleSelectPage,
          ),
        title: 'เริ่มต้นการใช้งาน — SIRIEDUMARKET',
      },
      {
        path: 'onboarding/interests',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/onboarding/interest-select/interest-select.page').then(
            (m) => m.InterestSelectPage,
          ),
        title: 'เลือกความสนใจ — SIRIEDUMARKET',
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
        title: 'Siri Studio — Dashboard',
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
        loadComponent: () =>
          import('./features/seller/pdf-preview-upload/pdf-preview-upload.page').then(
            (m) => m.PdfPreviewUploadPage,
          ),
        title: 'พรีวิว PDF — Siri Studio',
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
        title: 'โปรโมตเอกสารของคุณ — Siri Studio',
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
        title: 'การแจ้งเตือนของร้าน — Siri Studio',
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
      {
        path: '',
        loadComponent: () =>
          import('./features/admin/dashboard/dashboard.page').then(
            (m) => m.AdminDashboardPage,
          ),
        title: 'Admin — SIRIEDUMARKET',
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./features/admin/documents/documents.page').then(
            (m) => m.AdminDocumentsPage,
          ),
        title: 'จัดการเอกสาร — Admin',
      },
      {
        path: 'documents/:id',
        loadComponent: () =>
          import('./features/admin/document-detail/document-detail.page').then(
            (m) => m.AdminDocumentDetailPage,
          ),
        title: 'รายละเอียดเอกสาร — Admin',
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
        title: 'ผู้ใช้ทั้งหมด — Admin',
      },
      {
        path: 'users/:userId',
        loadComponent: () =>
          import('./features/admin/user-detail/user-detail.page').then(
            (m) => m.AdminUserDetailPage,
          ),
        title: 'รายละเอียดผู้ใช้ — Admin',
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
        title: 'แจ้งปัญหา / ข้อเสนอแนะ — Admin',
      },
      {
        path: 'payouts',
        loadComponent: () =>
          import('./features/admin/payouts/payouts.page').then(
            (m) => m.AdminPayoutsPage,
          ),
      },
      // seller-ads-promotion v1 §4.1: all-campaigns queue + stop + placement price/capacity editor.
      {
        path: 'ads',
        loadComponent: () =>
          import('./features/admin/ads/ads-admin.page').then((m) => m.AdsAdminPage),
        title: 'จัดการโฆษณา — Admin',
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
        title: 'สมาชิกรายเดือน — Admin',
      },
      // crm-core v1 §4.1/§4.4: CRM overview + segment membership + one user's read-only
      // interest/segment breakdown (`CrmUserPanelComponent` — also the F-08 embed point, §4.4).
      {
        path: 'crm',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-admin.page').then((m) => m.CrmAdminPage),
        title: 'CRM — Admin',
      },
      {
        path: 'crm/segments/:code',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-segment-users.page').then(
            (m) => m.CrmSegmentUsersPage,
          ),
        title: 'สมาชิกของกลุ่ม — CRM Admin',
      },
      {
        path: 'crm/users/:id',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-user.page').then((m) => m.CrmUserPage),
        title: 'โปรไฟล์ CRM ผู้ใช้ — Admin',
      },
      // crm-targeted-document-alerts v2 §4.1 (F-12, ข้อ 11): overview of the CRM-targeted
      // document alert queue — admin-only, no seller/buyer surface (§0.5 decision 7).
      {
        path: 'crm/document-alerts',
        loadComponent: () =>
          import('./features/admin/crm-admin/crm-document-alerts-admin.page').then(
            (m) => m.CrmDocumentAlertsAdminPage,
          ),
        title: 'การแจ้งเตือนเอกสารตรงความสนใจ — Admin',
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
        title: 'จัดการประกาศข่าวสาร — Admin',
      },
      // category-content-auto-generation v1: trigger/inspect the document auto-generation job —
      // generated documents land in the existing /admin/approval queue automatically.
      {
        path: 'document-generation',
        loadComponent: () =>
          import('./features/admin/document-generation/document-generation.page').then(
            (m) => m.AdminDocumentGenerationPage,
          ),
        title: 'สร้างเอกสารอัตโนมัติ — Admin',
      },
      // exam-hub-landing-pages v1 §4: CMS management for the 4 exam hub pages.
      {
        path: 'exam-hub',
        loadComponent: () =>
          import('./features/admin/exam-hub/exam-hub-admin.page').then(
            (m) => m.ExamHubAdminPage,
          ),
        title: 'จัดการเนื้อหาหน้า Exam Hub — Admin',
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
        title: 'การแจ้งเตือนของผู้ดูแลระบบ — Admin',
      },
      // notification-master-config v1 §3.7/§4.1: the master switchboard — which of the 18 catalog
      // events the platform sends, and over which channels (อีเมล / LINE / ในระบบ).
      {
        path: 'notification-config',
        loadComponent: () =>
          import('./features/admin/notification-config/notification-config-admin.page').then(
            (m) => m.NotificationConfigAdminPage,
          ),
        title: 'ตั้งค่าการแจ้งเตือนของระบบ — Admin',
      },
    ],
  },

  // ========= Auth (guest only — no layout) =========
  {
    path: 'auth/login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.page').then((m) => m.AuthLoginPage),
    title: 'เข้าสู่ระบบ — SIRIEDUMARKET',
  },
  {
    path: 'auth/register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/register/register.page').then((m) => m.AuthRegisterPage),
    title: 'สมัครสมาชิก — SIRIEDUMARKET',
  },
  {
    path: 'auth/verify-email',
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email.page').then(
        (m) => m.AuthVerifyEmailPage,
      ),
    title: 'ยืนยันอีเมล — SIRIEDUMARKET',
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
    title: 'เข้าสู่ระบบด้วย LINE — SIRIEDUMARKET',
  },
  {
    path: 'auth/forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.page').then(
        (m) => m.AuthForgotPasswordPage,
      ),
    title: 'ลืมรหัสผ่าน — SIRIEDUMARKET',
  },
  {
    // GAP-03: opened from the emailed link, so it must stay reachable while signed out.
    path: 'auth/reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.page').then(
        (m) => m.AuthResetPasswordPage,
      ),
    title: 'ตั้งรหัสผ่านใหม่ — SIRIEDUMARKET',
  },

  // ========= 404 =========
  // Bug #7: this route had no `title`, so Angular's TitleStrategy left `document.title` stuck on
  // whatever the previous route set (e.g. visiting /cart, which isn't a real route) instead of
  // reflecting the 404 state.
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
    title: 'ไม่พบหน้านี้ — SIRIEDUMARKET',
  },
];

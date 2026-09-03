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
      {
        path: 'payouts',
        loadComponent: () =>
          import('./features/admin/payouts/payouts.page').then(
            (m) => m.AdminPayoutsPage,
          ),
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
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/admin/settings-admin/settings-admin.page').then(
            (m) => m.AdminSettingsPage,
          ),
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

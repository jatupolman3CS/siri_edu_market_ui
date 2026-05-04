import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

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
      // Wishlist works without login (uses localStorage), but encouraging login is fine

      // Protected — require auth
      {
        path: 'wishlist',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/buyer/wishlist/wishlist.page').then(
            (m) => m.BuyerWishlistPage,
          ),
        title: 'รายการโปรด — SIRIEDUMARKET',
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
    ],
  },

  // ========= Seller (auth required) =========
  {
    path: 'seller',
    canActivate: [authGuard],
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
        path: 'ai',
        loadComponent: () =>
          import('./features/seller/ai-assistant/ai-assistant.page').then(
            (m) => m.SellerAiAssistantPage,
          ),
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
    canActivate: [authGuard],
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

  // ========= 404 =========
  {
    path: '**',
    loadComponent: () =>
      import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];

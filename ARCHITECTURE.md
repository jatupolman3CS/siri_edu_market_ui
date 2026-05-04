# ARCHITECTURE.md — Technical Deep-Dive 🏗️

> เอกสารอธิบาย architecture, design decisions และ data flow ของระบบ

---

## 🔭 High-Level Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                         User Browser                              │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                  Angular 21 SPA (Standalone)                      │
│                                                                   │
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Routes    │→ │   Layouts    │→ │   Feature Pages         │  │
│  │ (lazy load)│  │ buyer/seller │  │ (Home, Marketplace, …)  │  │
│  └────────────┘  └──────────────┘  └─────────────────────────┘  │
│         │              │                       │                  │
│         ▼              ▼                       ▼                  │
│  ┌─────────┐    ┌────────────────┐    ┌────────────────────┐    │
│  │ Guards  │    │  Shared        │    │  Core Services     │    │
│  │  auth   │    │  Components    │←──→│  (Signal-based     │    │
│  │  guest  │    │  (Card,        │    │   stores)          │    │
│  └─────────┘    │   Header,      │    └────────┬───────────┘    │
│                 │   Drawer, …)   │             │                 │
│                 └────────────────┘             │                 │
│                                                ▼                 │
│                                       ┌─────────────────┐        │
│                                       │  Mock Data      │        │
│                                       │  + localStorage │        │
│                                       │  (persistence)  │        │
│                                       └─────────────────┘        │
└──────────────────────────────────────────────────────────────────┘

       (Future: Backend layer)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│            .NET 10 API + MSSQL + Cloudflare R2                    │
│         (Clean Architecture: API → App → Infra → Domain)          │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📐 Layered Frontend Architecture

### 1. **Core Layer** (`src/app/core/`)

App-wide singletons — should not depend on feature/shared layers

```
core/
├── models/index.ts         # Pure types (interfaces, type aliases, label maps)
├── mock/                   # Mock data factories — replaceable with API client later
│   ├── categories.mock.ts
│   ├── sellers.mock.ts
│   ├── documents.mock.ts
│   ├── bundles.mock.ts
│   └── library.mock.ts
├── services/               # State + business logic
│   ├── catalog.service.ts        # Document/category catalog
│   ├── cart.service.ts            # Shopping cart
│   ├── library.service.ts         # User's purchased docs
│   ├── seller.service.ts          # Seller's own docs/stats
│   ├── admin.service.ts           # Platform-level data
│   ├── auth.service.ts            # Authentication state
│   ├── wishlist.service.ts        # Favorited docs (localStorage)
│   ├── recently-viewed.service.ts # Browse history (localStorage)
│   ├── follow.service.ts          # Followed sellers (localStorage)
│   ├── bundle.service.ts          # Bundle catalog
│   ├── quick-view.service.ts      # Modal state for quick view
│   └── index.ts                   # Barrel export
└── guards/
    └── auth.guard.ts              # authGuard + guestGuard
```

### 2. **Shared Layer** (`src/app/shared/`)

Reusable across features — should not depend on features

```
shared/
├── components/             # Generic UI components
│   ├── logo.component.ts
│   ├── icon.component.ts
│   ├── rating-stars.component.ts
│   ├── document-card.component.ts
│   ├── bundle-card.component.ts
│   ├── empty-state.component.ts
│   ├── page-hero.component.ts
│   ├── section-header.component.ts
│   ├── stat-card.component.ts
│   ├── social-buttons.component.ts
│   ├── app-header.component.ts
│   ├── app-footer.component.ts
│   ├── cart-drawer.component.ts
│   └── quick-view-modal.component.ts
└── pipes/
    ├── thb.pipe.ts          # Format ฿1,234
    ├── compact.pipe.ts      # 1.2k / 3.5M
    └── time-ago.pipe.ts     # 3 วันที่แล้ว
```

### 3. **Layouts Layer** (`src/app/layouts/`)

Page shells (header + footer + main outlet)

```
layouts/
├── buyer/buyer-layout.component.ts   # Public buyer shell + cart drawer + quick view
├── seller/seller-layout.component.ts # Sidebar + studio mode
├── admin/admin-layout.component.ts   # Dark sidebar + high access
└── auth/auth-layout.component.ts     # Split-screen marketing
```

### 4. **Features Layer** (`src/app/features/`)

Route components — can depend on core, shared, layouts

```
features/
├── buyer/
│   ├── home.page.ts
│   ├── marketplace.page.ts
│   ├── categories.page.ts
│   ├── category-detail.page.ts
│   ├── document-detail.page.ts
│   ├── library.page.ts
│   ├── wishlist.page.ts
│   ├── bundles.page.ts
│   ├── bundle-detail.page.ts
│   ├── free.page.ts
│   ├── storefront.page.ts
│   ├── checkout.page.ts
│   └── orders.page.ts
├── seller/
│   ├── dashboard.page.ts          # + Earnings calculator
│   ├── documents.page.ts
│   ├── upload.page.ts             # 4-step wizard
│   ├── ai-assistant.page.ts
│   ├── earnings.page.ts
│   ├── reviews.page.ts
│   └── settings.page.ts
├── admin/
│   ├── dashboard.page.ts
│   ├── approval.page.ts
│   ├── transactions.page.ts
│   ├── sellers.page.ts
│   ├── categories-admin.page.ts
│   └── settings-admin.page.ts
├── auth/
│   ├── login.page.ts              # Email + Google + FB + LINE
│   ├── register.page.ts           # With strength meter
│   ├── verify-email.page.ts       # 6-digit OTP
│   └── forgot-password.page.ts
└── not-found.page.ts
```

---

## 🔄 Data Flow

### Read flow (Component reading state)

```
┌─────────────────┐
│  Component      │
│  template:      │
│  {{ svc.x() }}  │
└────────┬────────┘
         │ inject + call signal
         ▼
┌─────────────────┐         ┌──────────────────┐
│ Service         │←────────│ Mock Data file   │
│ private signal  │ initial │ MOCK_DOCUMENTS   │
│ readonly view   │         └──────────────────┘
│ computed        │
└─────────────────┘
```

### Write flow (User action)

```
User click → handler() in component
              │
              ▼
       service.add(item)
              │
              ▼
       _items.update(list => [...list, item])
              │
              ▼
       computed signals re-evaluate
              │
              ▼
       OnPush change detection → DOM update
              │
              ▼
       (Optional) persist to localStorage
```

---

## 🔐 Auth State Machine

```
            ┌──────────────┐
            │  Guest       │ ─── click "Sign Up" ──────┐
            │ (no session) │                            │
            └──────┬───────┘                            │
                   │                                    ▼
   click "Login"   │                          ┌─────────────────┐
                   ▼                          │  Pending        │
            ┌──────────────┐                  │  Verification   │
            │ Login Form   │                  │  (code in       │
            │              │                  │   localStorage) │
            │ • Email/Pwd  │                  └────────┬────────┘
            │ • Google     │                           │
            │ • Facebook   │                           │ enter code
            │ • LINE       │                           │
            └──────┬───────┘                           ▼
                   │                          ┌─────────────────┐
                   │ success                  │   Authenticated │
                   ├─────────────────────────→│   (session in   │
                   │ social signin            │    localStorage)│
                   │                          └────────┬────────┘
                   │                                   │
                   ▼                                   │ logout
            ┌──────────────┐                           │
            │  /checkout   │                           ▼
            │  + return    │                    ┌──────────────┐
            │  to original │                    │   Guest      │
            └──────────────┘                    └──────────────┘
```

### Storage keys

| Key | Type | Purpose |
|---|---|---|
| `siriedu.auth` | `AuthSession` | Active session + provider + signedInAt |
| `siriedu.auth.pending` | `PendingAuth` | Pending registration (code, expires) |
| `siriedu.wishlist` | `DocumentItem[]` | Favorited documents |
| `siriedu.recentlyViewed` | `DocumentItem[]` | Last 12 viewed docs |
| `siriedu.follows` | `string[]` | Followed seller IDs |

---

## 🛣️ Routing Structure

```
/ (BuyerLayoutComponent — public shell)
├── /                          BuyerHomePage
├── /marketplace               BuyerMarketplacePage
├── /categories                BuyerCategoriesPage
├── /category/:slug            BuyerCategoryDetailPage
├── /document/:id              BuyerDocumentDetailPage
├── /bundles                   BuyerBundlesPage
├── /bundle/:id                BuyerBundleDetailPage
├── /free                      BuyerFreePage
├── /store/:id                 BuyerStorefrontPage
│
├── /wishlist     [authGuard]  BuyerWishlistPage
├── /library      [authGuard]  BuyerLibraryPage
├── /checkout     [authGuard]  BuyerCheckoutPage
└── /orders       [authGuard]  BuyerOrdersPage

/seller [authGuard] (SellerLayoutComponent)
├── /seller                    SellerDashboardPage
├── /seller/documents          SellerDocumentsPage
├── /seller/upload             SellerUploadPage
├── /seller/ai                 SellerAiAssistantPage
├── /seller/earnings           SellerEarningsPage
├── /seller/reviews            SellerReviewsPage
└── /seller/settings           SellerSettingsPage

/admin [authGuard] (AdminLayoutComponent)
├── /admin                     AdminDashboardPage
├── /admin/approval            AdminApprovalPage
├── /admin/transactions        AdminTransactionsPage
├── /admin/sellers             AdminSellersPage
├── /admin/categories          AdminCategoriesPage
└── /admin/settings            AdminSettingsPage

/auth (no shared layout — each page has its own AuthLayout)
├── /auth/login          [guestGuard]    AuthLoginPage
├── /auth/register       [guestGuard]    AuthRegisterPage
├── /auth/verify-email                   AuthVerifyEmailPage
└── /auth/forgot-password [guestGuard]   AuthForgotPasswordPage

/** → NotFoundPage
```

---

## 🧬 Domain Model Relationships

```
                     ┌──────────────┐
                     │   Category   │
                     │  (8 main)    │
                     └──────┬───────┘
                            │ 1:N
                            ▼
                  ┌────────────────────┐
                  │   Subcategory      │
                  │   (44 total)       │
                  └────────┬───────────┘
                           │ N:1
                           ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Seller    │ 1:N│  DocumentItem│ N:M│   Bundle    │
│             │←───│              │───→│             │
│ banner      │    │ price        │    │ documentIds │
│ followers   │    │ format       │    │ originalPrice
│ specialties │    │ gradeLevels  │    │ price (disc)│
└─────────────┘    │ resourceType │    └─────────────┘
                   │ standards    │
                   │ tags         │
                   │ reviews      │
                   │ qna          │
                   │ aiSummary    │
                   │ isFree       │
                   │ isBestseller │
                   └──────┬───────┘
                          │ N:M (via cart/library)
                          ▼
              ┌───────────────────────┐
              │   User                │
              │   - cart              │
              │   - wishlist          │
              │   - library           │
              │   - orders            │
              │   - follows[sellerId] │
              └───────────────────────┘
```

ดู type definitions เต็มๆ ที่ `src/app/core/models/index.ts`

---

## ⚙️ Build Configuration

### Angular budgets (`angular.json`)

```json
"budgets": [
  { "type": "initial",          "maximumWarning": "2MB", "maximumError": "4MB" },
  { "type": "anyComponentStyle","maximumWarning": "16kB","maximumError": "32kB" }
]
```

> ตั้งสูงเพราะ `template:` inline + Tailwind class เยอะใน components

### Bundle splitting

- ทุก route lazy-loaded → 1 chunk per page
- Initial bundle ~3MB (Angular + NG-ZORRO + Tailwind utilities)
- Each page chunk ~25-300 KB

### Production optimizations (default)

- Tree-shaking
- Bundle minification
- Output hashing
- AOT compilation
- Optional CSS purging via Tailwind

---

## 🌐 Future Backend Integration Plan

### Phase A: REST adapter

```
core/
├── api/                        # NEW
│   ├── document.api.ts         # HttpClient wrapper
│   ├── auth.api.ts
│   ├── cart.api.ts
│   └── ...
├── services/                   # EXISTING — modify to use api
│   └── catalog.service.ts      # Replace MOCK_DOCUMENTS with api.list()
└── interceptors/               # NEW
    ├── auth.interceptor.ts
    └── error.interceptor.ts
```

### Phase B: Switch from mock to live

1. Implement API client with `inject(HttpClient)`
2. Replace mock arrays in services with `rxResource` or `toSignal(observable)`
3. Add loading/error signals
4. Add HTTP interceptor for JWT token

### Phase C: Real-time (optional)

- WebSocket for new orders / Q&A notifications
- Server-Sent Events for live admin dashboard updates

---

## 🔐 Security Model (Mock → Production)

| Concern | Now (mock) | Production target |
|---|---|---|
| Session | localStorage JSON | httpOnly cookie + JWT |
| Password | sent in plaintext | bcrypt hashed (server) + HTTPS |
| OTP code | `Math.random()` 6-digit | crypto-strong + email service |
| OAuth | mock provider object | real OAuth 2.0 flow |
| API auth | none | Bearer token in interceptor |
| CSRF | n/a | tokens (if cookie-based) |
| File upload (R2) | n/a | pre-signed URLs |
| Rate limiting | n/a | API gateway (NGINX/Cloudflare) |

---

## 📊 Performance Targets

- **First Contentful Paint** < 1.5s on 4G
- **Time to Interactive** < 3s on 4G
- **Lighthouse Performance** ≥ 85
- **Total bundle size** < 500KB initial (after tree-shaking + gzip)

ตอนนี้ยัง ~3MB raw initial เพราะ NG-ZORRO ทั้ง bundle — phase A จะ optimize เหลือ < 1MB ด้วย selective imports

---

## 📚 References

- Project README: [README.md](README.md)
- AI agent briefing: [AGENTS.md](AGENTS.md)
- How-to guide: [INSTRUCTION.md](INSTRUCTION.md)
- Conventions: [SKILL.md](SKILL.md)
- Build history: [CHANGELOG.md](CHANGELOG.md)

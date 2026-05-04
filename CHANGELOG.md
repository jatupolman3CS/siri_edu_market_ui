# CHANGELOG.md — Build History 📝

> บันทึกสิ่งที่สร้างมาแต่ละ session — ใช้เป็น reference ว่าอะไรมีแล้ว/อะไรยังต้องทำ

---

## [Unreleased]

### Pending
- Backend integration (.NET 10 API)
- Real Gemini AI integration
- Payment gateway (Omise / GB Prime Pay)
- Real email service (for OTP & password reset)
- File upload to Cloudflare R2

---

## [0.3.0] — 2026-05-04 — Authentication & Account System

### Added — Auth pages
- `/auth/login` — Email/Password + Google + Facebook + LINE social login
- `/auth/register` — สมัครสมาชิก + password strength meter + terms acceptance
- `/auth/verify-email` — 6-digit OTP input (paste + auto-tab + resend cooldown)
- `/auth/forgot-password` — Request password reset link

### Added — Auth infrastructure
- `AuthService` — full state machine with `signIn`, `register`, `verifyEmail`, `signInWithProvider`, `signOut`, `requestPasswordReset`
- Persistence in `localStorage` (keys: `siriedu.auth`, `siriedu.auth.pending`)
- `authGuard` + `guestGuard` (with `returnUrl` support)
- Demo helper: mock OTP code logged to console + clickable autofill in UI
- `AuthLayoutComponent` — shared split-screen layout (form + marketing art)
- `SocialButtonsComponent` — Google/Facebook/LINE branded buttons

### Changed — Route protection
- `/checkout`, `/library`, `/orders`, `/wishlist` now require auth
- All `/seller/*` and `/admin/*` routes now require auth
- Cart drawer "ชำระเงิน" button → redirects to login if not authed
- Document detail "ซื้อทันที" + "ดาวน์โหลดฟรีเลย" → redirects to login

### Changed — Header
- Logged-out: shows "เข้าสู่ระบบ" link + "สมัครฟรี" pink button
- Logged-in: shows avatar dropdown with functional **Sign Out**

---

## [0.2.0] — 2026-05-04 — Sub-categories & TpT Features

### Added — Sub-categories
- `Subcategory` model + 44 sub-categories across 8 main categories
- `MOCK_SUBCATEGORIES` + each `Category.subcategories[]`
- Filter by sub-category in marketplace
- Drill-down navigation in `/category/:slug?sub=...`
- Sub-category preview in `/categories` page
- Sub-category breadcrumb in document detail

### Added — TpT-inspired features
- **Grade Levels** (8 levels): kindergarten → adult
- **Resource Types** (13): lesson-summary, worksheet, mind-map, etc.
- **Standards**: TGAT, TPAT, A-Level, O-NET, IELTS, TOEIC, TOEFL
- **Bundles** — `/bundles` and `/bundle/:id` with multi-doc packages and savings calculation
- **Wishlist** — `/wishlist` page + functional heart button (localStorage)
- **Quick View Modal** — peek at document without leaving current page
- **Seller Storefront** — `/store/:id` with banner, follow button, custom sections, bundles tab
- **Q&A** — Question-and-answer tab on document detail
- **Free Resources** — `/free` page + free filter chip + green "ฟรี" badges
- **Recently Viewed** — strip on home + marketplace (12 items)
- **Follow Seller** — functional follow button on storefront and document detail
- **Marketplace Tabs** — All / Free / Top Rated / New / Bundles
- **Earnings Calculator** — slider widget on seller dashboard
- **Bestseller / Editor's Pick badges** — on document cards
- **Seller Reply** — sellers can reply to reviews
- **Helpful Count** — on each review

### Added — Services
- `WishlistService` (localStorage)
- `RecentlyViewedService` (localStorage, max 12)
- `FollowService` (localStorage)
- `BundleService` (5 mock bundles)
- `QuickViewService` (modal state)

### Added — Components
- `BundleCardComponent`
- `QuickViewModalComponent`

### Changed — Mock data
- 12 → **15 documents** (added 3 free resources)
- Sellers gained `banner`, `followerCount`, `responseHours`, `specialties`, `storeSections`
- Documents gained `subcategoryId`, `gradeLevels`, `resourceType`, `standards`, `qna`, `isFree`, `isBestseller`, `isFeatured`, `isEditorsPick`
- Reviews gained `helpful`, `sellerReply`

---

## [0.1.0] — 2026-05-04 — Initial UI Foundation

### Added — Tooling
- Angular 21.2.9 project (standalone + signals + zoneless)
- Tailwind CSS 3.4.x with custom Light Pink theme
- NG-ZORRO 21.2.2
- Plus Jakarta Sans + Noto Sans Thai fonts

### Added — Design System
- 9-shade pink palette (`pink-50` → `pink-900`)
- Custom Tailwind utility classes: `card-soft`, `card-cream`, `pill-pink`, `pill-soft`, `btn-pink`, `btn-ghost`, `btn-icon`, `input-soft`, `section-title`, `section-subtitle`, `glass-blob`
- Custom shadow utilities: `shadow-soft`, `shadow-pop`, `shadow-float`
- Animations: `fade-in`, `slide-up`, `pulse-soft`
- Signature `2.5rem` border radius
- NG-ZORRO theme overrides (buttons, inputs, tags, tabs, table, drawer, modal)
- Custom scrollbar styling

### Added — Domain models (initial)
- `DocumentItem`, `Category`, `Seller`, `DocumentReview`
- `CartItem`, `Order`, `LibraryItem`, `User`
- `SellerStats`, `AdminTransaction`
- Type aliases: `DocumentStatus`, `FileFormat`, `OrderStatus`, `PaymentMethod`, `UserRole`

### Added — Services (initial)
- `CatalogService` — documents, categories, filters, computed views
- `CartService` — cart items, drawer state
- `LibraryService` — purchased docs, order history
- `SellerService` — own documents, stats
- `AdminService` — transactions, KPIs
- `AuthService` — basic mock signIn/signOut

### Added — Components (initial)
- `LogoComponent`, `IconComponent` (40+ inline SVG icons), `RatingStarsComponent`
- `DocumentCardComponent`, `EmptyStateComponent`, `PageHeroComponent`
- `SectionHeaderComponent`, `StatCardComponent`
- `AppHeaderComponent`, `AppFooterComponent`, `CartDrawerComponent`

### Added — Layouts
- `BuyerLayoutComponent` — public buyer shell
- `SellerLayoutComponent` — Siri Studio sidebar
- `AdminLayoutComponent` — Admin dark sidebar

### Added — Buyer pages
- `/` — Home with hero, categories, trending, featured sellers, CTA
- `/marketplace` — Filter sidebar + sort + grid
- `/categories` · `/category/:slug` — Browse by category
- `/document/:id` — Detail with gallery, watermark preview, AI summary, reviews
- `/library` — Purchased docs grid
- `/checkout` — Multi-step with PromptPay/Card/TrueMoney mocks
- `/orders` — Order history with status

### Added — Seller pages (Siri Studio)
- `/seller` — Dashboard with revenue chart, top categories, recent docs, payout
- `/seller/documents` — Manage own docs with table + filter
- `/seller/upload` — 4-step wizard (file → details → pricing → review)
- `/seller/ai` — AI Assistant for summary/description/tags
- `/seller/earnings` — Revenue stats + payout history
- `/seller/reviews` — Customer reviews with summary
- `/seller/settings` — Profile, bank, notifications

### Added — Admin pages
- `/admin` — Dashboard with GMV, system status, pending approvals
- `/admin/approval` — Document approval with compliance checklist
- `/admin/transactions` — Transaction table with filters
- `/admin/sellers` — All sellers grid
- `/admin/categories` — Category management
- `/admin/settings` — Platform fees, gateways, R2 storage

### Added — Mock data
- 8 categories (with descriptions, icons, colors)
- 6 sellers (with avatars, badges, stats)
- 12 documents (with covers, gallery, AI summaries, reviews)
- 4 pending documents (for admin approval)
- 3 orders + 4 library items
- 18 admin transactions
- Seller stats with 6-month revenue chart

### Added — Pipes
- `ThbPipe` — Format ฿1,234
- `CompactPipe` — 1.2k / 3.5M
- `TimeAgoPipe` — เมื่อสักครู่ / X นาทีที่แล้ว / X วันที่แล้ว

---

## Convention

Each entry follows [Keep a Changelog](https://keepachangelog.com/) format:
- **Added** — new features
- **Changed** — changes in existing functionality
- **Deprecated** — soon-to-be removed features
- **Removed** — removed features
- **Fixed** — bug fixes
- **Security** — security fixes

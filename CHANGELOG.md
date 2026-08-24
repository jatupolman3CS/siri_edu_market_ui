# CHANGELOG.md — Build History 📝

> บันทึกสิ่งที่สร้างมาแต่ละ session — ใช้เป็น reference ว่าอะไรมีแล้ว/อะไรยังต้องทำ

---

> **หมายเหตุ:** entry ตั้งแต่ 0.4.0 ขึ้นไปสร้างจาก `git log` จริงของทั้งสอง repo ไม่ได้เขียนจากเอกสารเก่า
> hash ที่อ้างถึง: `ui/` = `siri_edu_market_ui`, `be/` = `siri_edu_market_backend`
> (ทั้งคู่อยู่บน branch `harden/security-and-completion` ยังไม่ merge เข้า `main`)

---

## [Unreleased]

### Added — Operations & documentation (2026-08-24 → 2026-08-25)
- **`AUDIT-LOG.md`** — ทะเบียนรวม GAP-01…GAP-10 และ AUD-001…AUD-018 ทุก id มีไฟล์+บรรทัดอ้างอิงที่เปิดดูได้ (`ui/1186430`)
- **`ops/backup.ps1` + `ops/restore-check.ps1`** — full/diff/log backup ผ่าน `sqlcmd`, `RESTORE VERIFYONLY` ทุกครั้ง,
  ตรวจขนาดไฟล์ที่ copy offsite, prune ตาม retention · restore-check กู้ลง scratch database แล้วเทียบจำนวน `LIBRARY_ITEM` (`be/8e5b1a3`)
- **Runbook 2 หัวข้อใน `OPERATIONS.md`** — `payment_reconciliation_failed` และ `payment_webhook_signature_rejected`
  พร้อม alert query และขั้นตอนตัดสินใจ fulfil vs refund (`be/1f409c7`)
- **ตาราง rotate credential ใน `CONFIGURATION.md`** — 7 credential พร้อมขั้นตอน rotate ที่ provider และช่องวันที่ให้กรอก (`be/02cd770`)

### Fixed
- **Omise charge ที่ reconcile ไม่ได้ไม่มีใครรู้** — `OmiseWebhookController` ทิ้งผลลัพธ์ของ fulfilment ทั้งก้อน
  `AmountMismatch` / `NotFound` = ลูกค้าจ่ายแล้วไม่ได้ของ และไม่มี log, ไม่มี alert, ไม่มี error ให้ผู้ใช้เห็น
  ตอนนี้ log ระดับ `Error` พร้อม charge id, order id/number, expected vs received satang (`be/1f409c7`)
- **คอมเมนต์ AUD-004 ใน `SystemController.cs` บอกให้ "re-enable admin guard"** ทั้งที่บรรทัดถัดไปมี
  `[Authorize(Roles = "Admin")]` อยู่แล้ว ทำให้อ่านผิดว่าช่องโหว่ยังเปิด (`be/3fee78b`)

### Changed
- **`AGENTS.md` + `CLAUDE.md` เขียนความจริงคนละเรื่องกับ repo** — บอกว่า "ไม่มี backend, mock data ทั้งหมด,
  ห้ามใช้ HttpClient เรียก API จริง, ใช้ inline `template:`" ทั้งที่ต่อ API ครบ 108 endpoint และใช้ `templateUrl` 58 ไฟล์
  แก้ให้ตรงกับโค้ดจริงแล้ว รวมถึงกฎที่ `audit-guard` บังคับจริงและ verify command ครบ 4 ตัว (`ui/37cd093`)
- **`INTEGRATION-CHECKLIST.md`** — ลิงก์ `AUDIT-LOG.md` ใช้ได้จริงแล้ว และหัวข้อ "Open contract gaps"
  เหลือเฉพาะที่ยัง open จริง (AUD-014, AUD-018) (`ui/1186430`)

### Removed
- **build artifact ออกจาก git** — `.angular.zip` (6.2 MB) + `openapi-ts-error-*.log` ฝั่ง UI (`ui/d36d74e`)
  และ **306 ไฟล์ใน `bin/`+`obj/`** ฝั่ง backend ที่ทำให้แค่รัน `dotnet build` working tree ก็สกปรก 19 ไฟล์ (`be/1211653`)
  ไฟล์ทั้งหมดยังอยู่บนดิสก์ — ใช้ `git rm --cached` ไม่ได้ rewrite history

### Pending — ตรวจจากโค้ดจริงเมื่อ 2026-08-25

- **AI Assistant ยังไม่ใช่ AI** — `SellerDashboardService.AiGenerateAsync` ไม่ได้เรียก LLM ใดๆ
  `summary` คือเอา title มาต่อกับ `ShortDescription`, `tags` เขียนค่าคงที่ลง DB
  แต่หน้า `/seller/ai` โฆษณาว่าเป็น AI จริง (G-05)
- **Facebook / LINE login ยังเป็น stub** — `auth.service.ts:328` reject ที่ฝั่ง UI, provider ฝั่ง backend เป็น stub
  UI ติดป้าย "Coming soon" ไว้แล้วจึงยังไม่หลอกผู้ใช้ (GAP-04)
- **Credential ที่เคยหลุดใน git ยังไม่ยืนยันว่า rotate แล้ว** — ตารางใน `CONFIGURATION.md` มีครบแล้ว
  แต่ช่อง "Last rotated" ยังว่างทั้ง 7 แถว (G-02)
- **สคริปต์ backup ยังไม่เคยรันกับ SQL Server จริง** — เครื่องที่พัฒนาอยู่รันไม่ได้
  (ดิสก์รายงาน physical sector size 64 KB ซึ่ง SQL Server ไม่รองรับ) ต้องพิสูจน์บนเครื่องจริงก่อนเชื่อ (G-03)
- **API 4 เส้นทางยัง hand-maintained นอก generated SDK** — `admin-documents.api.ts`,
  `seller-document-update.ts`, `seller-document-main-files.ts` และ `admin.service.ts:21` ที่เรียก `client.gen` ตรง
  ทำให้ `verify:api-drift` จับ drift ไม่ได้ (AUD-014)
- **Frontend มี spec แค่ 1 ไฟล์** ต่อ 41 pages / 26 services ทั้งที่ logic เงินอยู่ฝั่ง UI ด้วย (G-06)
- **ยังไม่ profile N+1 ของ marketplace catalog** (AUD-018)
- **ยังไม่มี docker-compose / deploy stage** ใน pipeline (G-14)
- **target `net9.0`** ทั้งที่กฎโปรเจกต์เขียนว่า .NET 10 — ยังไม่ตัดสินใจ (G-13)

---

## [0.4.0] — 2026-08-24 — Backend จริง, เส้นทางเงิน และ Security Hardening

> release ที่ทำให้โปรเจกต์เลิกเป็น UI-first: มี ASP.NET Core API (net9.0, Clean Architecture,
> EF Core 9 + SQL Server) ต่อครบ **108 endpoints** ผ่าน generated SDK — `npm run audit:coverage`
> รายงาน backend 108 / sdk 108 / used 108 / orphan 0

### Security — `be/896532b`
- **ปิด anonymous auth bypass** — `FacebookExternalIdentityProvider` มี guard ที่ถูก comment ไว้
  และคืน verified profile แบบ hard-code แปลว่าใครก็ตามที่ POST ไป `/api/auth/external/facebook` ได้ session จริง
- ย้าย secret ทุกตัวออกจาก `appsettings.json` ไปเป็น environment variable +
  `StartupConfigurationValidator` ไม่ยอม boot ถ้าค่าหาย/เป็น placeholder/สั้นเกินไป · `Jwt:Key` ไม่มี default อีกต่อไป
- `IStorageAccessPolicy` — เอกสารที่ต้องซื้อดาวน์โหลดได้เฉพาะเจ้าของ (เดิมใครถือ storage key ก็โหลดได้)
- ลบ `DevUserId` fallback ทิ้ง — ไม่มี subject claim = 401 (แก้ IDOR ของ cart/wishlist: AUD-002, AUD-003)
- Rate limiting บน auth, การส่งอีเมล และ endpoint ที่อ่อนไหว
- อัปเกรด MailKit และ Angular ข้าม advisory ที่รู้แล้ว

### Fixed — เส้นทางเงิน — `be/896532b`, `ui/74fb57a`
- **เก็บเงินซ้ำได้** — QR PromptPay ที่ทิ้งไว้ยังจ่ายได้ และไม่มีอะไรกันการสร้าง order ที่ 2 ของเอกสารชุดเดิม
  จ่ายทั้งคู่ = ตัดเงิน 2 รอบ ส่วน fulfilment รอบที่สอง no-op เงียบๆ เพราะ library มีอยู่แล้ว (BUG-09)
- **ยอดที่เห็นกับยอดที่ถูกตัดไม่ตรงกัน** — cart ฝั่ง UI บวก VAT 7% ทับยอดที่ server ไม่เคยเก็บ
  แก้เป็นราคารวม VAT แล้วดึงยอดจาก server (BUG-01, BUG-03)
- เอกสารฟรี fulfil ได้โดยไม่ต้องวิ่งผ่าน Omise (Omise ปฏิเสธ charge ยอด 0) — BUG-02
- Bundle คิดราคาแบบ bundle แล้วเฉลี่ยลงสมาชิก
- Order number มาจาก database sequence + unique index (BUG-06)
- Omise webhook ปฏิเสธ timestamp ที่เก่าเกินและที่ล้ำอนาคต (BUG-08)
- **order ที่ถูก cancel แล้วยังต้อง fulfil ถ้า charge เข้า** — เพราะการ cancel ไม่เคย void charge ได้
  ไม่งั้นคือเก็บเงินแล้วไม่ส่งของ (BUG-09)
- **401 ทำให้ session ตายทุก 15 นาที** — refresh สำเร็จแต่ request เดิมถูกทิ้ง
  ตอนนี้ทั้ง SDK fetch (`core/api-runtime.ts`) และ HTTP interceptor replay request หลัง refresh (BUG-04, AUD-006)

### Added — ฟีเจอร์ที่เคยเป็น stub — `be/896532b`, `ui/74fb57a`
- **Wishlist เก็บลง DB จริง** — ทุก method เคยเป็น no-op ฝั่ง UI เรียก API ถูกมาตลอด แต่ API ทิ้งข้อมูล (GAP-10)
- **Seller storefront + store sections** — `SellerPublicService` เคยเป็น stub ทั้งคลาส (GAP-07)
- **Seller earnings + payout** — `GetEarningsAsync` เคยคืนค่าว่าง, ตาราง `PAYOUT` มีแต่ไม่มี repository/service/endpoint (GAP-02)
- **Password reset จริง** — เดิม UI เป็น stub คืน success ปลอม ตอนนี้มี `PASSWORD_RESET_TOKEN` (เก็บแค่ SHA-256 hash) + ส่งอีเมลจริง (GAP-03)
- **Buyer สมัครเป็น seller + คิวรีวิวฝั่ง admin** (GAP-01)
- **Q&A บนหน้าเอกสาร** — ตาราง `QNA` มี seed และแสดงผลอยู่ แต่ไม่มี write path (GAP-06)
- **PDF watermark สำหรับผู้ซื้อ** — toggle เคยมีแต่ไม่ทำอะไร ผู้ซื้อได้ไฟล์สะอาด (GAP-05)
- **`/api/system/status`** รายงานสถานะ dependency จริง (GAP-08)

### Added — Testing — `be/68d1a08`, `be/2697422`
- unit test **14 → 91** · integration test **0 → 27**
- integration test รันบน database ที่สร้างใหม่จาก migration จริง ครอบ migration, `ORDER_NUMBER_SEQ`,
  filtered unique index, `ExecuteDelete`/`ExecuteUpdate` — ของที่ in-memory provider ไม่มี
  ถ้าไม่มี SQL Server จะ **skip ไม่ใช่ pass** เพื่อไม่ให้เครื่องที่ไม่มี DB รายงานความมั่นใจปลอม
- watermark pipeline 10 test (รัน Docnet + SkiaSharp จริง) · Omise webhook endpoint 11 test · order fulfilment 8 test

### Added — Operations — `be/896532b`
- `MaintenanceCleanupService` กวาด token ที่ใช้แล้วและ order ที่ถูกทิ้ง · ลงทะเบียน log cleanup job อีกครั้ง (GAP-09)
- GitLab CI ทั้งสองฝั่ง: build, test, integration, secret-scan, vulnerable-packages, OpenAPI drift, audit-guard, endpoint coverage
- `CONFIGURATION.md` + `OPERATIONS.md`

### Changed — Frontend — `ui/74fb57a`
- ทุกหน้าเรียกผ่าน `core/services/*` → generated SDK (`core/api/sdk.gen.ts`) → base path `/SIRIEDUMARKET.Api`
- ใบเสร็จแยกยอดก่อนภาษีกับ VAT ที่อยู่ในยอด (API เพิ่งเริ่มคืนค่านี้ใน release นี้)
- checkout ที่ถูกบล็อกเพราะมี order ค้างจ่าย พาไปหน้าประวัติคำสั่งซื้อพร้อมเลขที่ order แทน toast ตัน
- ผู้ซื้อยกเลิก order ที่ยังไม่จ่ายได้ · bundle เพิ่มลงตะกร้าแบบ bundle
- **ลบ mock profile ของ Facebook/LINE ที่กุขึ้นมาออกจาก `auth.service.ts`**
- `environment.ts` เคยตั้ง `production: false` ตอน build production เพราะ angular.json ไม่มี file replacement ของ development เลย
- upgrade Angular ข้ามช่องโหว่ XSS sanitisation bypass ของ compiler

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

# SIRIEDUMARKET 🌸

> แพลตฟอร์มตลาดกลางออนไลน์ (Marketplace) สำหรับการซื้อขายเอกสารวิชาการ สรุปบทเรียน และเทมเพลตคุณภาพสูง

แรงบันดาลใจจาก [Teachers Pay Teachers](https://www.teacherspayteachers.com/) ปรับให้เหมาะกับตลาดไทย — โทน **Minimal Light Pink**, รองรับการซื้อขายในประเทศ (Stripe — บัตรเครดิต / PromptPay / wallet)

---

## ⚡ Quick Start

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:4200)
npm start

# Production build
npm run build
```

> ต้องใช้ **Node.js ≥ 20.x** และ **npm ≥ 10.x**

---

## 🛠️ Tech Stack

| Layer | Tech | เวอร์ชัน |
|---|---|---|
| Framework | **Angular** (Standalone + Signals + Zoneless) | `21.2.x` |
| UI Library | **NG-ZORRO** (Ant Design Angular) | `21.2.x` |
| Styling | **Tailwind CSS** + custom theme | `3.4.x` |
| State | **Angular Signals** (no Redux/NgRx) | built-in |
| Routing | **Angular Router** + lazy loading + guards | built-in |
| Storage (mock) | `localStorage` (auth, wishlist, recently-viewed) | browser |

> Backend ยังไม่ได้สร้าง — ทุก service ใช้ mock data ทั้งหมด พร้อมต่อ API จริงได้ทันที

---

## 📁 Folder Structure

```
src/app/
├── core/                          # Singletons & app-wide concerns
│   ├── models/                    # TypeScript interfaces & enums
│   ├── mock/                      # Mock data (15 docs, 6 sellers, 5 bundles, …)
│   ├── services/                  # Signal-based stores
│   └── guards/                    # Route guards (authGuard, guestGuard)
├── shared/                        # Reusable across features
│   ├── components/                # Logo, Icon, DocumentCard, BundleCard, …
│   └── pipes/                     # thb, compact, timeAgo
├── layouts/                       # Page shells
│   ├── buyer/                     # Public + protected buyer routes
│   ├── seller/                    # Siri Studio (sidebar + studio mode)
│   ├── admin/                     # Admin panel (dark sidebar)
│   └── auth/                      # Auth split-screen
└── features/                      # Route components
    ├── buyer/                     # Home, Marketplace, Document, Cart, Library, …
    ├── seller/                    # Dashboard, Upload (4-step), AI Assistant, …
    ├── admin/                     # Approval, Transactions, Sellers, …
    └── auth/                      # Login, Register, Verify Email, Forgot
```

---

## 🛣️ Routes Overview

### Public (no login)
- `/` — Home (Hero + Trending + Bundles + Free + Categories + Editor's Picks)
- `/marketplace` — Filter by category/sub-category/grade/resource type/standards
- `/categories` · `/category/:slug` — Drill-down with sub-categories
- `/document/:id` — Detail + Q&A + Reviews + Related bundles
- `/bundles` · `/bundle/:id` — Multi-doc packages
- `/free` — Free resources
- `/store/:id` — Seller storefront

### Protected (auth required)
- `/wishlist` · `/library` · `/orders` · `/checkout`
- `/seller/*` — Dashboard, Documents, Upload, AI Assistant, Earnings, Reviews, Settings
- `/admin/*` — Dashboard, Approval, Transactions, Sellers, Categories, Settings

### Auth (guest-only)
- `/auth/login` — Email/Password + Google + Facebook + LINE
- `/auth/register` — With strength meter + terms
- `/auth/verify-email` — 6-digit OTP
- `/auth/forgot-password`

---

## 🎨 Design System

- **Signature radius**: `2.5rem` (`rounded-3xl`)
- **Palette**: 9-shade pink (`pink-50` → `pink-900`) + ink/cream/canvas neutrals
- **Font**: Plus Jakarta Sans + Noto Sans Thai
- **Shadow**: `shadow-soft`, `shadow-pop`, `shadow-float` (all pink-tinted)
- **Animations**: `fade-in`, `slide-up`, `pulse-soft` (custom Tailwind keyframes)

ทุกอย่างกำหนดใน `tailwind.config.js` + CSS variables ใน `src/styles.scss`

---

## 📚 More Docs

- **[AGENTS.md](AGENTS.md)** — สำหรับ AI agents / dev ใหม่ (briefing สั้น)
- **[INSTRUCTION.md](INSTRUCTION.md)** — How-to guide (เพิ่ม feature, page, service)
- **[SKILL.md](SKILL.md)** — Code conventions & patterns
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical deep-dive
- **[CHANGELOG.md](CHANGELOG.md)** — บันทึกที่สร้างมาทั้งหมด

---

## 🗺️ Roadmap

| Phase | สถานะ | ขอบเขต |
|---|---|---|
| 1. UI/UX foundation | ✅ Done | Theme + Layouts + Mock data + Buyer/Seller/Admin pages |
| 2. Sub-categories + TpT features | ✅ Done | Sub-categories, Bundles, Wishlist, Storefront, Q&A, Quick View |
| 3. Authentication | ✅ Done | Login (email + social), Register, Verify, Guards |
| 4. Backend (.NET 10) | ⏳ Pending | Clean Architecture + EF Core + MSSQL + Cloudflare R2 |
| 5. Payment integration | ✅ Done | Stripe PaymentIntent + Payment Element (บัตรเครดิต / PromptPay / wallet) |
| 6. Real AI integration | ⏳ Pending | Gemini API for summaries |

---

## 📄 License

Internal project — ITONE / Siriedu team. ห้ามเผยแพร่โดยไม่ได้รับอนุญาต

# AUDIT-LOG — ทะเบียนรวม GAP / AUD

> ที่รวมของ id ที่กระจายอยู่ในคอมเมนต์โค้ดทั้งสอง repo
> (`siri_edu_market_ui` และ `siri_edu_market_backend`)
> ก่อนหน้านี้ `INTEGRATION-CHECKLIST.md` ชี้มาที่ไฟล์นี้แต่ไฟล์ไม่มีจริง (G-10)
>
> **สร้างจากโค้ดจริง ไม่ได้คัดลอกจากเอกสารเดิม** — รวบรวมด้วย:
> ```bash
> git grep -n "GAP-[0-9]\|AUD-[0-9]"   # รันในทั้งสอง repo
> ```
> ตรวจครั้งล่าสุด: **2026-08-24** · branch `harden/security-and-completion` ทั้งสอง repo

## วิธีอ่านสถานะ

| สถานะ | ความหมาย |
|---|---|
| `closed` | แก้แล้วและมีโค้ดยืนยัน — เปิดไฟล์ตามคอลัมน์หลักฐานแล้วเห็นของจริง |
| `open` | ยังไม่แก้ ยังเป็นหนี้ค้างอยู่ |
| `no-trace` | id ถูกอ้างถึงในชุดเลข แต่ **ไม่พบใน repo ทั้งสองที่เลย** (ดู §ช่องว่างของชุดเลข) |

> path ในตารางเป็น relative จาก root ของ repo ที่ระบุ
> `ui/` = `siri_edu_market_ui/` · `be/` = `siri_edu_market_backend/`

---

## GAP-01 … GAP-10 — ฟีเจอร์ที่เคยเป็นช่องว่าง

| id | เรื่อง | ไฟล์ | สถานะ | หลักฐาน |
|---|---|---|---|---|
| GAP-01 | Buyer สมัครเป็น seller ได้ + คิวรีวิวฝั่ง admin (เดิมไม่มีทางเป็น seller เลย) | `be/src/SIRIEDUMARKET.Application/Seller/Services/SellerApplicationService.cs`<br>`be/src/SIRIEDUMARKET.Api/Controllers/AdminController.cs`<br>`ui/src/app/features/buyer/become-seller/become-seller.page.ts` | `closed` | `SellerApplicationService.cs:25` · `AdminController.cs:234,245,269` · `MeController.cs:54,69` · `SELLER_PROFILE.cs:44-56` · `become-seller.page.ts:11` · `seller-applications.page.ts:9` |
| GAP-02 | Payout + seller earnings (PAYOUT มีตารางแต่ไม่มี repository/service/endpoint) | `be/src/SIRIEDUMARKET.Application/Commerce/Services/PayoutService.cs`<br>`be/src/SIRIEDUMARKET.Application/Commerce/Abstractions/IPayoutRepository.cs`<br>`ui/src/app/features/admin/payouts/payouts.page.ts` | `closed` | `PayoutService.cs:10,19,57` · `IPayoutRepository.cs:14` · `AdminController.cs:296,316` · `SellerDashboardController.cs:157,162` · `payouts.page.ts:17` · `earnings.page.ts:22` · `seller.service.ts:133` |
| GAP-03 | ลืมรหัสผ่าน / reset password (เดิม UI เป็น stub คืน success ปลอม) | `be/src/SIRIEDUMARKET.Api/Controllers/AuthController.cs`<br>`be/src/SIRIEDUMARKET.Domain/Authentication/PASSWORD_RESET_TOKEN.cs`<br>`ui/src/app/features/auth/reset-password/reset-password.page.ts` | `closed` | `AuthController.cs:93,106` · `PASSWORD_RESET_TOKEN.cs:7` (เก็บแค่ SHA-256 hash) · `IAuthenticationService.cs:18,22` · `SmtpEmailVerificationSender.cs:24` · `auth.service.ts:362,379` · `app.routes.ts:339` |
| GAP-04 | Facebook + LINE login ยังเป็น stub | `ui/src/app/core/services/auth.service.ts`<br>`be/src/SIRIEDUMARKET.Infrastructure/Authentication/Services/FacebookExternalIdentityProvider.cs` | `open` | `auth.service.ts:293,328` — reject ที่ฝั่ง UI พร้อมป้าย "Coming soon" จึงยังไม่หลอกผู้ใช้ (ตรงกับ G-15 ใน TASK-PLAN) |
| GAP-05 | Watermark PDF สำหรับผู้ซื้อ (เดิม toggle มีแต่ไม่ทำอะไร ผู้ซื้อได้ไฟล์สะอาด) | `be/src/SIRIEDUMARKET.Api/Services/WatermarkedDocumentService.cs`<br>`be/src/SIRIEDUMARKET.Application/Commerce/Services/LibraryService.cs` | `closed` | `WatermarkedDocumentService.cs:11` · `LibraryService.cs:47` · `SellerDocumentsController.cs:261,288` (seller ได้ต้นฉบับ, buyer ได้ตัว watermark) · `DOCUMENT.cs:80` · `Program.cs:119` · test: `WatermarkedDocumentServiceTests.cs:11` |
| GAP-06 | ถาม-ตอบบนหน้าเอกสาร (ตาราง QNA มี seed + แสดงผล แต่ไม่มี write path) | `be/src/SIRIEDUMARKET.Application/Marketplace/Services/DocumentQnaService.cs`<br>`ui/src/app/features/seller/qna/qna.page.ts` | `closed` | `DocumentQnaService.cs:27` · `IQnaRepository.cs:8` · `MarketplaceController.cs:20` · `SellerDashboardController.cs:49,62` · `qna.page.ts:15` · `buyer/document-detail/document-detail.page.ts:250` · `buyer/document-detail/document-detail.page.html:324` |
| GAP-07 | จัดหน้าร้าน / store sections (STORE_SECTION seed ไว้แต่ service เป็น no-op) | `be/src/SIRIEDUMARKET.Application/Social/Services/StoreSectionService.cs`<br>`be/src/SIRIEDUMARKET.Application/Social/Services/SellerPublicService.cs`<br>`ui/src/app/features/seller/store-sections/store-sections.page.ts` | `closed` | `StoreSectionService.cs:8,37` · `SellerPublicService.cs:8` · `ISellerPublicRepository.cs:17` · `SellerDashboardController.cs:86,96,117,144` · `store-sections.page.ts:18` |
| GAP-08 | `/api/system/status` รายงานสถานะ dependency จริง | `be/src/SIRIEDUMARKET.Infrastructure/System/Repositories/SystemStatusRepository.cs` | `closed` | `SystemStatusRepository.cs:11` · เรียกผ่าน `SystemController.cs:22` |
| GAP-09 | `APPLICATION_LOG` โตไม่มีขอบเขต ทั้งที่ NLog config อ้างว่า retention 30 วัน | `be/src/SIRIEDUMARKET.Infrastructure/DependencyInjection.cs` | `closed` | `DependencyInjection.cs:68` — มี hosted cleanup job จริง |
| GAP-10 | Wishlist ไม่เคยเก็บอะไรลง DB (ทุก method เป็น no-op) | `be/src/SIRIEDUMARKET.Application/Social/Services/WishlistService.cs`<br>`be/src/SIRIEDUMARKET.Infrastructure/Social/Repositories/EfWishlistRepository.cs` | `closed` | `WishlistService.cs:9` · `EfWishlistRepository.cs:9` · `IWishlistRepository.cs:6` · `wishlist.service.ts:40` · tests: `WishlistServiceTests.cs:10`, `WishlistRepositoryIntegrationTests.cs:7` |

---

## AUD-001 … AUD-018 — ผลตรวจ audit

| id | เรื่อง | ไฟล์ | สถานะ | หลักฐาน |
|---|---|---|---|---|
| AUD-001 | error body เคยเป็น PascalCase ขณะที่ success body เป็น camelCase → UI อ่าน `detail`/`title` ไม่ได้ | `be/src/SIRIEDUMARKET.Api/Middleware/GlobalExceptionMiddleware.cs` | `closed` | `GlobalExceptionMiddleware.cs:11-17` ตั้ง `PropertyNamingPolicy = JsonNamingPolicy.CamelCase` · test กันถอยหลัง: `GlobalExceptionMiddlewareTests.cs:17,104` |
| AUD-002 | Cart ผูกกับ dev-user fallback → IDOR อ่าน/เขียนตะกร้าคนอื่นได้ | `be/src/SIRIEDUMARKET.Api/Controllers/CartController.cs` | `closed` | `CartController.cs:10` (คอมเมนต์อธิบายเหตุ) + `CartController.cs:13` `[Authorize(Roles = "Buyer,Admin")]` และใช้ `User.GetUserId()` |
| AUD-003 | Wishlist มี dev fallback แบบเดียวกับ AUD-002 | `be/src/SIRIEDUMARKET.Api/Controllers/WishlistController.cs` | `closed` | `WishlistController.cs:10` + `:13` `[Authorize(Roles = "Buyer,Admin")]` · `:19` ใช้ `User.GetUserId()` ร่วม (ดู SEC-08) |
| AUD-004 | `/api/system/r2` debug payload เปิดให้ anonymous เข้าถึงได้ (รั่ว bucket name + ความยาว key) | `be/src/SIRIEDUMARKET.Api/Controllers/SystemController.cs` | `closed` | `SystemController.cs:34` มี `[Authorize(Roles = "Admin")]` อยู่แล้ว · คอมเมนต์เดิมที่สั่งให้ "re-enable admin guard" ทำให้เข้าใจผิดว่ายัง open — แก้ข้อความแล้วใน T-02 |
| AUD-005 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง (ดู §ช่องว่างของชุดเลข) |
| AUD-006 | UI ยังไม่ wire `POST /api/auth/refresh` → session ตายทุก 15 นาทีตอน access token หมดอายุ | `ui/src/app/core/services/auth.service.ts`<br>`ui/src/app/core/interceptors/unauthorized.interceptor.ts` | `closed` | `auth.service.ts:114-143` `refreshSession()` เรียก `postApiAuthRefresh` ที่ `:125` และ share in-flight promise · ผู้เรียก: `unauthorized.interceptor.ts:40` · ฝั่ง SDK fetch: `api-runtime.ts` refresh-and-replay (BUG-04) |
| AUD-007 | refresh token ถูกเก็บปนกับ access token → `signOut`/`refresh` ส่งผิด field | `ui/src/app/core/services/auth.service.ts` | `closed` | `auth.service.ts:24-27` แยก key `siriedu.auth.refresh` · `:57` · `:102` · `:338` `signOut()` เรียก `postApiAuthLogout` ด้วย refresh token เพื่อ revoke จริง |
| AUD-008 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-009 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-010 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-011 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-012 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-013 | UI อ่าน ProblemDetails ได้ไม่ครบ shape + SDK คืน `{data: undefined, error: undefined}` แล้ว throw ไม่สื่อ | `ui/src/app/core/services/api-failure-reporter.service.ts`<br>`ui/src/app/core/services/api-result.ts` | `closed` | `api-failure-reporter.service.ts:9` รองรับ camelCase ProblemDetails · `api-result.ts:16` จัดการเคส empty result · test ฝั่ง backend: `GlobalExceptionMiddlewareTests.cs:17` |
| AUD-014 | API เส้นทางที่อยู่นอก generated SDK → `verify:api-drift` จับ drift ไม่ได้ | `ui/src/app/core/services/admin.service.ts`<br>`ui/INTEGRATION-CHECKLIST.md` | `closed` | `admin.service.ts` เลิก import `client.gen` แล้ว — `/api/admin/settings` และ `/api/admin/storage/usage` ไปผ่าน `getApiAdminSettings` / `putApiAdminSettings` / `getApiAdminStorageUsage` · ไฟล์ที่เหลือใน `core/api/` (`admin-documents.api.ts`, `seller-document-update.ts`, `seller-document-main-files.ts`) เป็น alias re-export จาก `sdk.gen` ไม่ใช่โค้ด HTTP เขียนเอง · `verify:api-drift` → "OpenAPI matches snapshot" · ปิดใน T-22 |
| AUD-015 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-016 | หน้า page เคย import `sdk.gen` ตรง ทำให้ `audit:guard` แดง | `ui/src/app/core/services/seller.service.ts`<br>`ui/scripts/audit-guard.mjs` | `closed` | `seller.service.ts:308` ย้าย reviews list มาไว้ใน service · บังคับด้วย rule `no-sdk-gen-in-features` ใน `audit-guard.mjs` · `npm run audit:guard` ผ่าน |
| AUD-017 | — | — | `no-trace` | ไม่พบใน repo ทั้งสอง |
| AUD-018 | ยังไม่ profile N+1 ของ marketplace catalog | `be/src/SIRIEDUMARKET.Infrastructure/Marketplace/Repositories/EfMarketplaceCatalogRepository.cs`<br>`be/src/SIRIEDUMARKET.Application/Marketplace/Services/MarketplaceCatalogService.cs` | **`open`** | ยังไม่มีผลวัดใดๆ ในทั้งสอง repo · เดิมบันทึกไว้ที่ `ui/INTEGRATION-CHECKLIST.md` หัวข้อ "Open contract gaps" · แผนแก้ = T-32 |

**สรุป:** GAP — closed 9 / open 1 (GAP-04) · AUD — closed 9 / open 1 (AUD-018) / no-trace 8

---

## ช่องว่างของชุดเลข (ต้องรู้ก่อนเชื่อ)

`AUD-005`, `AUD-008` … `AUD-012`, `AUD-015`, `AUD-017` รวม **8 id ไม่พบที่ไหนเลยในทั้งสอง repo**
ยืนยันด้วย:

```bash
grep -rn -oE "AUD-[0-9]+" -I . | grep -v node_modules | grep -v "/.git/" | sort -u
# → AUD-001 002 003 004 006 007 013 014 016 018  (10 ตัวเท่านั้น)
```

จึงลงตารางไว้เป็น `no-trace` แทนที่จะเดาเนื้อหา — **อย่าถือว่า closed และอย่าถือว่า open**
ถ้ามีรายงาน audit ต้นฉบับที่ยังไม่ได้ commit เข้ามา ให้เติมเนื้อหาลงแถวเหล่านี้แล้วอัปเดตสถานะ

---

## ชุดเลขอื่นที่ใช้อยู่ในโค้ด (ไม่อยู่ในขอบเขต T-02 — ไว้เป็นทางเข้า)

นอกจาก GAP/AUD ยังมีอีกสองชุดที่กระจายอยู่ในคอมเมนต์ ยังไม่มีที่รวมเช่นกัน:

| ชุด | id ที่พบ | ตัวอย่างจุดเริ่มอ่าน |
|---|---|---|
| `SEC-` (security hardening) | SEC-01 … SEC-04, SEC-06 … SEC-11 (ไม่มี SEC-05) | `be/src/SIRIEDUMARKET.Api/Configuration/StartupConfigurationValidator.cs` (SEC-01, SEC-03) · `be/src/SIRIEDUMARKET.Api/Controllers/FilesController.cs` (SEC-02) · `be/src/SIRIEDUMARKET.Api/Configuration/RateLimitPolicies.cs` (SEC-09) · `be/src/SIRIEDUMARKET.Api/Extensions/ClaimsPrincipalExtensions.cs` (SEC-08) |
| `BUG-` (bug fix ที่ทำไปแล้ว) | BUG-01 … BUG-06, BUG-08, BUG-09 (ไม่มี BUG-07) | `be/src/SIRIEDUMARKET.Application/Commerce/Services/OrderPricingService.cs` (BUG-01 VAT) · `be/src/SIRIEDUMARKET.Application/Commerce/Services/CartPricingCalculator.cs` (BUG-03) · `ui/src/app/core/api-runtime.ts` (BUG-04 refresh-and-replay) · `be/src/SIRIEDUMARKET.Infrastructure/Payments/OmiseWebhookSignatureVerifier.cs` (BUG-08) |

ค้นทั้งหมดได้ด้วย:

```bash
grep -rn -oE "\b(SEC|BUG|GAP|AUD)-[0-9]+" -I . | grep -v node_modules | grep -v "/.git/" | sort -u
```

---

## วิธีดูแลไฟล์นี้

1. เพิ่ม id ใหม่ในคอมเมนต์โค้ดก่อนเสมอ (คอมเมนต์คือหลักฐาน ไฟล์นี้คือดัชนี)
2. เปลี่ยนสถานะเป็น `closed` ได้ต่อเมื่อชี้ไฟล์+บรรทัดที่เปิดดูแล้วเห็นของจริงได้
3. อย่าเขียนสถานะจากเอกสารเก่า — รัน `git grep` ใหม่ทุกครั้งที่อัปเดต
4. เอกสารที่เกี่ยวข้อง: `INTEGRATION-CHECKLIST.md` (contract), `AGENTS.md` (กติกาสำหรับ agent), `../TASK-PLAN.md` (แผนงานและ Findings)

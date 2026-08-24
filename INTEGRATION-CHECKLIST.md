# INTEGRATION-CHECKLIST (UI ↔ OpenAPI)

> เป้าหมาย: ทุกหน้า “กดแล้วเห็นผล” โดยเรียกผ่าน OpenAPI SDK (`src/app/core/api/sdk.gen.ts`)

## Shared building blocks
- **SDK**: `src/app/core/api/sdk.gen.ts` (61 endpoints, 78 backend endpoints — ดู `coverage.md`)
- **Client config**: `src/app/core/api-runtime.ts` (`baseUrl: '/SIRIEDUMARKET.Api'`)
- **Action state**: `src/app/core/services/action-state.ts`
- **SDK unwrap**: `src/app/core/services/api-result.ts` (`unwrapSdkResult`)
- **Mappers (non-generated)**: `src/app/core/api-mappers/mappers.ts`
- **Failure reporter**: `src/app/core/services/api-failure-reporter.service.ts`
  (รองรับ ProblemDetails: `detail`/`title`/`message`/`errors[].description`)
- **CI gates**: `npm run audit:guard`, `npm run audit:coverage`, `npm run verify:api-drift`

## Hand-maintained APIs — ไม่เหลือแล้ว (AUD-014 ปิด 2026-08-25)

ทุกเส้นทางไปผ่าน generated SDK หมดแล้ว `verify:api-drift` จึงจับ drift ได้ครบทุก endpoint

- `admin.service.ts` เคยเรียก `client.gen` ตรงที่ `/api/admin/settings` และ `/api/admin/storage/usage`
  → ย้ายไปใช้ `getApiAdminSettings`, `putApiAdminSettings`, `getApiAdminStorageUsage` แล้ว
  (interface `PlatformSettings` / `StorageUsage` ยังอยู่เป็น contract ของ service เพราะ field ที่ generate มาเป็น optional หมด
  แต่ฟอร์มหน้า admin ต้องการ object ที่ครบ — normalize ใน service)
- `admin-documents-pending-search.ts` ที่เคยระบุไว้ในรายการนี้ **ไม่เคยมีไฟล์อยู่จริง** (ดู F-02-3)

ไฟล์ 3 ตัวที่เหลือใน `core/api/` **ไม่ใช่ hand-maintained API** — เป็นแค่ alias re-export จาก `sdk.gen`/`types.gen`
เพื่อให้ import path ฝั่ง feature นิ่ง ไม่มีโค้ด HTTP เขียนเอง จึงไม่หลุด drift check:

- `admin-documents.api.ts` · `seller-document-update.ts` · `seller-document-main-files.ts`

> ⚠️ **`npm run generate:api` ลบไฟล์ที่ไม่ใช่ generated ใน `src/app/core/api/` ทิ้ง**
> รวมถึง 3 ไฟล์ข้างบนและ **`sdk-auth-bridge.ts`** ซึ่ง `app.config.ts` ใช้ผูก token เข้ากับ SDK
> ถ้าลบไปแล้ว build จะพังและ auth จะหยุดทำงาน — หลัง regenerate ทุกครั้งให้ `git status` แล้วกู้คืนด้วย
> `git checkout -- src/app/core/api/` ก่อนทำอย่างอื่น

## Buyer (public)
- **/** Home
  - **catalog free strip**: `CatalogService.loadFreeResources()` → `getApiMarketplaceFree`
  - **bundles**: `BundleService.refreshBundles()` → `getApiMarketplaceBundles`
- **/marketplace**
  - **catalog**: `CatalogService.loadCatalog()` → `getApiMarketplaceCatalog`
  - **categories**: `CatalogService.loadCategories()` → `getApiMarketplaceCategories`
  - **search (optional remote)**: `CatalogService.searchRemote()` → `getApiMarketplaceSearch`
- **/categories**
  - **categories list**: `CatalogService.loadCategories()` → `getApiMarketplaceCategories`
- **/category/:slug**
  - **category slug (wire only)**: `CatalogService.loadCategoryDetailBySlug()` → `getApiMarketplaceCategoriesBySlug`
- **/document/:id**
  - **detail**: `CatalogService.loadDocumentDetail()` → `getApiMarketplaceDocumentsById`
  - **related (wire only)**: `CatalogService.loadRelated()` → `getApiMarketplaceDocumentsByIdRelated`
- **/bundles**
  - **bundles list**: `BundleService.refreshBundles()` → `getApiMarketplaceBundles`
- **/bundle/:id**
  - **bundle detail (wire only)**: `BundleService.loadBundleDetail()` → `getApiMarketplaceBundlesById`
- **/free**
  - **free list**: `CatalogService.loadFreeResources()` → `getApiMarketplaceFree`
- **/store/:id**
  - **follow/unfollow**: `FollowService.toggle()` → `postApiSellersBySellerIdFollow` / `deleteApiSellersBySellerIdFollow`

## Buyer (protected, JWT phase later)
- **/wishlist**
  - list: `WishlistService.refresh()` → `getApiWishlist`
  - add/remove/clear: `postApiWishlist`, `deleteApiWishlistByDocumentId`, `deleteApiWishlist`
- **/library**
  - list (wired): `LibraryService.refreshLibrary()` → `getApiLibrary`
  - download: `LibraryService.download()` → `postApiLibraryByDocumentIdDownload`
- **/orders**
  - list/detail/create (scaffold): `getApiOrders`, `getApiOrdersById`, `postApiOrders`
- **/checkout**
  - create order (scaffold): `postApiOrders`

## Auth
- login/register/verify/resend/logout wired in `AuthService`:
  - `postApiAuthLogin`, `postApiAuthRegister`, `postApiAuthVerifyEmail`, `postApiAuthResendVerification`, `postApiAuthLogout`

## Seller (JWT phase later)
- dashboard/docs/delete scaffold in `SellerService`:
  - `getApiSellerDashboard`, `getApiSellerDocuments`, `deleteApiSellerDocumentsById`

## Admin (JWT phase later)
- dashboard/transactions scaffold in `AdminService`:
  - `getApiAdminDashboard`, `getApiAdminTransactions`

## Contract conventions (enforced)

- **JSON casing**: success body **และ** error body ใช้ camelCase เหมือนกัน
  (error เคยเป็น PascalCase — แก้แล้วใน `GlobalExceptionMiddleware` ดู AUD-001)
- **Error envelope**: `application/problem+json`
  - canonical: `type`, `title`, `status`, `detail`
  - alias: `message`, `statusCode`, `traceId`
- **Enum**: ส่งเป็น `string` มาตรฐาน (เช่น `"awaiting_payment"`, `"paid"`)
- **DateTime**: ISO-8601 string (UTC), ไม่ใช่ binary
- **Decimal**: ตัวเลข JSON, format ฝั่ง UI ผ่าน `ThbPipe`
- **PathBase**: backend `app.UsePathBase("/SIRIEDUMARKET.Api")` →
  UI ต้องใช้ `API_BASE_URL` จาก `core/api-runtime.ts` เท่านั้น

## Open contract gaps

> ทะเบียนเต็มของ GAP/AUD ทุก id พร้อมไฟล์อ้างอิงอยู่ที่ [AUDIT-LOG.md](AUDIT-LOG.md)
> ตรวจครั้งล่าสุด 2026-08-25 — ที่ยัง **open** เหลือ 1 รายการ:

- **AUD-018** — ยังไม่ profile N+1 ของ marketplace catalog
  (`EfMarketplaceCatalogRepository.cs`) → แผนแก้ T-32

ปิดไปแล้ว (เคยอยู่ในรายการนี้):

- ~~AUD-006: ยังไม่ wire `postApiAuthRefresh`~~ — **closed** แล้ว
  `core/services/auth.service.ts:119` `refreshSession()` เรียก `postApiAuthRefresh` ที่บรรทัด 125
  และ `core/interceptors/unauthorized.interceptor.ts:40` เป็นผู้เรียก


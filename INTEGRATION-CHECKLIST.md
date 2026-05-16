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

## Hand-maintained APIs (ไม่ผ่าน OpenAPI generation — TRACKED)
> เปลี่ยน DTO เหล่านี้ต้องอัปเดต **ทั้งสองฝั่ง** ด้วยมือ จนกว่าจะ migrate กลับเข้า `sdk.gen.ts`

- `src/app/core/api/admin-documents.api.ts` ↔ `AdminController` document/report endpoints
- `src/app/core/api/seller-document-update.ts` ↔ `SellerDocumentsController.PUT api/seller/documents/{id}`
- `src/app/core/api/admin-documents-pending-search.ts` ↔ `POST api/admin/documents/pending/search`
- เส้นทาง `client.gen` โดยตรงใน `admin.service.ts`: `/api/admin/settings`, `/api/admin/storage/usage`

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

## Open contract gaps (ดู `AUDIT-LOG.md`)

- AUD-006: ยังไม่ wire `postApiAuthRefresh`
- AUD-014: hand-maintained APIs ตาม section ด้านบน
- AUD-018: ยังไม่ profile N+1 ของ marketplace catalog


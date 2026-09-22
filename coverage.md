# Endpoint coverage report

- backend endpoints parsed: **274**
- SDK functions exported: **274**
- SDK functions imported by app code: **239**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **35**
- unused SDK exports (defined but never imported): **35**

## Orphan frontend

_none_

## Orphan backend

- GET `api/admin/documents/pending` (AdminController.cs)
- POST `api/admin/documents/{id:guid}/generate-ai-summary` (AdminController.cs)
- POST `api/admin/documents/ai-summaries/sweep` (AdminController.cs)
- POST `api/admin/documents/ai-prescreen/sweep` (AdminController.cs)
- GET `api/admin/sellers/{sellerId:guid}/balance-entries` (AdminController.cs)
- GET `api/admin/payouts/{payoutId:guid}/slips/{slipId:guid}/file` (AdminController.cs)
- GET `api/admin/sellers/{sellerId:guid}/payout-account` (AdminController.cs)
- PUT `api/admin/sellers/{sellerId:guid}/payout-account` (AdminController.cs)
- POST `api/admin/sellers/{sellerId:guid}/payout-account/reveal` (AdminController.cs)
- POST `api/admin/images/backfill-variants` (AdminImagesController.cs)
- POST `api/auth/refresh-token` (AuthController.cs)
- POST `api/auth/send-otp` (AuthController.cs)
- POST `api/auth/verify-otp` (AuthController.cs)
- GET `api/admin/categories/{id}` (CategoryController.cs)
- GET `api/admin/document-generation/runs/{id:guid}` (DocumentGenerationController.cs)
- POST `api/document/upload` (DocumentUploadController.cs)
- POST `api/files/upload-base64` (FilesController.cs)
- GET `api/files/download/{*key}` (FilesController.cs)
- POST `api/library/{documentId:guid}/reviews` (LibraryController.cs)
- GET `api/notifications/line/callback` (NotificationLineController.cs)
- GET `api/orders/{id:guid}/receipt` (OrderController.cs)
- GET `api/seller/bundles/{bundleId:guid}` (SellerBundlesController.cs)
- GET `api/seller/payouts/{payoutId:guid}/slips/{slipId:guid}/file` (SellerDashboardController.cs)
- POST `api/seller/documents/{id:guid}/preview-raster` (SellerDocumentsController.cs)
- PUT `api/seller/documents/{id:guid}/watermark-config` (SellerDocumentsController.cs)
- POST `api/seller/documents/{id:guid}/generate-preview` (SellerDocumentsController.cs)
- GET `api/seo/document/{id:guid}` (SeoController.cs)
- GET `api/seo/category/{slug}` (SeoController.cs)
- GET `api/seo/store/{sellerId:guid}` (SeoController.cs)
- POST `api/webhooks/stripe` (StripeWebhookController.cs)
- GET `api/system/sitemap.xml` (SystemController.cs)
- GET `api/system/r2` (SystemController.cs)
- POST `api/system/storage-key-backfill` (SystemController.cs)
- POST `api/system/search-reindex` (SystemController.cs)
- POST `api/system/test-email` (SystemController.cs)

## Unused SDK exports

- `getApiAdminDocumentsPending`
- `postApiAdminDocumentsByIdGenerateAiSummary`
- `postApiAdminDocumentsAiSummariesSweep`
- `postApiAdminDocumentsAiPrescreenSweep`
- `getApiAdminSellersBySellerIdBalanceEntries`
- `getApiAdminPayoutsByPayoutIdSlipsBySlipIdFile`
- `getApiAdminSellersBySellerIdPayoutAccount`
- `putApiAdminSellersBySellerIdPayoutAccount`
- `postApiAdminSellersBySellerIdPayoutAccountReveal`
- `postApiAdminImagesBackfillVariants`
- `postApiAuthRefreshToken`
- `postApiAuthSendOtp`
- `postApiAuthVerifyOtp`
- `getApiAdminCategoriesById`
- `getApiAdminDocumentGenerationRunsById`
- `postApiDocumentUpload`
- `postApiFilesUploadBase64`
- `getApiFilesDownloadByKey`
- `postApiLibraryByDocumentIdReviews`
- `getApiNotificationsLineCallback`
- `getApiOrdersByIdReceipt`
- `getApiSellerBundlesByBundleId`
- `getApiSellerPayoutsByPayoutIdSlipsBySlipIdFile`
- `postApiSellerDocumentsByIdPreviewRaster`
- `putApiSellerDocumentsByIdWatermarkConfig`
- `postApiSellerDocumentsByIdGeneratePreview`
- `getApiSeoDocumentById`
- `getApiSeoCategoryBySlug`
- `getApiSeoStoreBySellerId`
- `postApiWebhooksStripe`
- `getApiSystemSitemapXml`
- `getApiSystemR2`
- `postApiSystemStorageKeyBackfill`
- `postApiSystemSearchReindex`
- `postApiSystemTestEmail`

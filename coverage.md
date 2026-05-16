# Endpoint coverage report

- backend endpoints parsed: **78**
- SDK functions exported: **61**
- SDK functions imported by app code: **53**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **25**
- unused SDK exports (defined but never imported): **8**

## Orphan frontend

_none_

## Orphan backend

- GET `api/admin/documents` (AdminController.cs)
- GET `api/admin/documents/{id:guid}` (AdminController.cs)
- PATCH `api/admin/documents/{id:guid}` (AdminController.cs)
- POST `api/admin/documents/bulk` (AdminController.cs)
- GET `api/admin/documents/{id:guid}/reports` (AdminController.cs)
- POST `api/admin/documents/{id:guid}/reports` (AdminController.cs)
- POST `api/admin/documents/{id:guid}/reports/{reportId:guid}/resolve` (AdminController.cs)
- POST `api/admin/documents/{id:guid}/reports/resolve-all` (AdminController.cs)
- GET `api/admin/documents/pending` (AdminController.cs)
- POST `api/admin/documents/pending/search` (AdminController.cs)
- GET `api/admin/settings` (AdminController.cs)
- PUT `api/admin/settings` (AdminController.cs)
- GET `api/admin/storage/usage` (AdminController.cs)
- POST `api/auth/refresh` (AuthController.cs)
- GET `api/admin/categories/{id}` (CategoryController.cs)
- POST `api/files/upload-base64` (FilesController.cs)
- GET `api/files/download/{*key}` (FilesController.cs)
- GET `api/files/presigned/{*key}` (FilesController.cs)
- POST `api/library/{documentId:guid}/reviews` (LibraryController.cs)
- GET `api/orders/{id:guid}` (OrderController.cs)
- GET `api/seller/earnings` (SellerDashboardController.cs)
- POST `api/seller/documents/{id:guid}/generate-preview` (SellerDocumentsController.cs)
- GET `api/seller/documents/{id:guid}/download-url` (SellerDocumentsController.cs)
- GET `api/sellers/{sellerId:guid}/profile` (SellerPublicController.cs)
- GET `api/system/r2` (SystemController.cs)

## Unused SDK exports

- `getApiAdminDocumentsPending`
- `postApiAuthRefresh`
- `getApiAdminCategoriesById`
- `getApiFilesDownloadByKey`
- `getApiFilesPresignedByKey`
- `getApiOrdersById`
- `getApiSellerEarnings`
- `getApiSellersBySellerIdProfile`

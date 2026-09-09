# Endpoint coverage report

- backend endpoints parsed: **177**
- SDK functions exported: **176**
- SDK functions imported by app code: **176**
- orphan frontend (SDK -> no backend route match): **1**
- orphan backend (route -> no SDK call): **2**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

- `putApiAdminExamHubByExamType` -> PUT /api/admin/exam-hub/{examType}

## Orphan backend

- PUT `api/exam-hub/api/admin/exam-hub/{examType}` (ExamHubController.cs)
- POST `api/marketplace/documents/{id:guid}/view` (MarketplaceController.cs)

## Unused SDK exports

_none_

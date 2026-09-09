# Endpoint coverage report

- backend endpoints parsed: **182**
- SDK functions exported: **182**
- SDK functions imported by app code: **182**
- orphan frontend (SDK -> no backend route match): **1**
- orphan backend (route -> no SDK call): **1**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

- `putApiAdminExamHubByExamType` -> PUT /api/admin/exam-hub/{examType}

## Orphan backend

- PUT `api/exam-hub/api/admin/exam-hub/{examType}` (ExamHubController.cs)

## Unused SDK exports

_none_

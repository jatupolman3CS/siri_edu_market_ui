# Endpoint coverage report

- backend endpoints parsed: **212**
- SDK functions exported: **207**
- SDK functions imported by app code: **207**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **5**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- GET `api/admin/users` (AdminController.cs)
- GET `api/admin/users/{userId:guid}` (AdminController.cs)
- POST `api/admin/users/{userId:guid}/suspend` (AdminController.cs)
- POST `api/admin/users/{userId:guid}/ban` (AdminController.cs)
- POST `api/admin/users/{userId:guid}/reinstate` (AdminController.cs)

## Unused SDK exports

_none_

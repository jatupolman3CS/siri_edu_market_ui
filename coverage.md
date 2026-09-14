# Endpoint coverage report

- backend endpoints parsed: **218**
- SDK functions exported: **212**
- SDK functions imported by app code: **212**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **6**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- GET `api/admin/crm/overview` (AdminController.cs)
- GET `api/admin/crm/segments/{code}/users` (AdminController.cs)
- GET `api/admin/crm/users/{userId:guid}` (AdminController.cs)
- GET `api/me/crm` (MeController.cs)
- PUT `api/me/crm/tracking` (MeController.cs)
- DELETE `api/me/crm` (MeController.cs)

## Unused SDK exports

_none_

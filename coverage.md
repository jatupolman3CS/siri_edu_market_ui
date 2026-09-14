# Endpoint coverage report

- backend endpoints parsed: **223**
- SDK functions exported: **219**
- SDK functions imported by app code: **219**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **4**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- GET `api/admin/crm/demand-gaps` (AdminController.cs)
- GET `api/admin/crm/users/{userId:guid}/recommendation-trace` (AdminController.cs)
- GET `api/marketplace/popular-searches` (MarketplaceController.cs)
- GET `api/marketplace/discovery` (MarketplaceController.cs)

## Unused SDK exports

_none_

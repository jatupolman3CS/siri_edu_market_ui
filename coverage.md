# Endpoint coverage report

- backend endpoints parsed: **273**
- SDK functions exported: **271**
- SDK functions imported by app code: **271**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **2**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- POST `api/admin/images/backfill-variants` (AdminImagesController.cs)
- GET `api/orders/{id:guid}/receipt` (OrderController.cs)

## Unused SDK exports

_none_

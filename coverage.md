# Endpoint coverage report

- backend endpoints parsed: **134**
- SDK functions exported: **129**
- SDK functions imported by app code: **129**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **5**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- GET `api/me/payment-methods` (MeController.cs)
- POST `api/me/payment-methods` (MeController.cs)
- POST `api/me/payment-methods/{id:guid}/default` (MeController.cs)
- DELETE `api/me/payment-methods/{id:guid}` (MeController.cs)
- POST `api/me/payment-methods/setup-intent` (MeController.cs)

## Unused SDK exports

_none_

# Endpoint coverage report

- backend endpoints parsed: **193**
- SDK functions exported: **189**
- SDK functions imported by app code: **189**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **4**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- POST `api/auth/refresh-token` (AuthController.cs)
- GET `api/me/onboarding` (MeController.cs)
- PUT `api/me/onboarding/interests` (MeController.cs)
- POST `api/me/onboarding/skip` (MeController.cs)

## Unused SDK exports

_none_

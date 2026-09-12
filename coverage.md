# Endpoint coverage report

- backend endpoints parsed: **200**
- SDK functions exported: **197**
- SDK functions imported by app code: **197**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **3**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- GET `api/admin/notification-config` (NotificationConfigController.cs)
- PUT `api/admin/notification-config/{eventKey}` (NotificationConfigController.cs)
- POST `api/admin/notification-config/{eventKey}/reset` (NotificationConfigController.cs)

## Unused SDK exports

_none_

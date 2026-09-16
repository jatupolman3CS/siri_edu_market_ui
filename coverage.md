# Endpoint coverage report

- backend endpoints parsed: **263**
- SDK functions exported: **259**
- SDK functions imported by app code: **259**
- orphan frontend (SDK -> no backend route match): **0**
- orphan backend (route -> no SDK call): **4**
- unused SDK exports (defined but never imported): **0**

## Orphan frontend

_none_

## Orphan backend

- GET `api/seo/document/{id:guid}` (SeoController.cs)
- GET `api/seo/category/{slug}` (SeoController.cs)
- GET `api/seo/store/{sellerId:guid}` (SeoController.cs)
- GET `api/system/sitemap.xml` (SystemController.cs)

## Unused SDK exports

_none_

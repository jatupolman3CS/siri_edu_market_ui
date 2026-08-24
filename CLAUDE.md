# CLAUDE.md

> Claude Code memory file — รายละเอียดเต็มอยู่ใน [AGENTS.md](AGENTS.md)

## Quick Context

**SIRIEDUMARKET** = Angular 21 marketplace frontend (TpT-inspired Thai version)
**ต่อ backend จริงแล้ว ไม่ใช่ mock** — ASP.NET Core API (net9.0 + EF Core 9 + SQL Server)
ที่ `../siri_edu_market_backend` ต่อครบ **108 endpoints**

เส้นทางข้อมูล: `page → core/services/*.service.ts → core/api/sdk.gen.ts (generated) → base path /SIRIEDUMARKET.Api`
(base URL + auth header + retry 401 อยู่ที่ `src/app/core/api-runtime.ts`)

auth = **JWT + refresh token จริง** (`core/services/auth.service.ts`) — 401 จะ refresh แล้ว replay request

## Critical Rules

1. **Signals + Standalone + OnPush** เท่านั้น (zoneless mode)
2. ใช้ `input()` / `output()` / `inject()` — ไม่ใช่ decorators
3. ใช้ `@if` / `@for` — ไม่ใช่ `*ngIf` / `*ngFor`
4. ห้ามใช้ `any` — ใช้ `unknown` หรือ generic
5. ห้ามใช้ NgModule
6. ใช้ **`templateUrl` + `styleUrl` แยกไฟล์** (ไม่ใช่ inline `template:`)
7. เรียก API ผ่าน `core/services/` เสมอ — `features/**` ห้าม import `sdk.gen` / `client.gen` ตรง (`npm run audit:guard` บังคับ)
8. ห้ามแก้ไฟล์ generated ด้วยมือ (`sdk.gen.ts`, `types.gen.ts`, `client.gen.ts`) — ใช้ `npm run generate:api`
9. lazy load ทุก route (`loadComponent`)
10. UI/copy เป็นภาษาไทย, identifier เป็น English
11. ตอบ user เป็นภาษาไทย

## Read Before Editing

- **[AGENTS.md](AGENTS.md)** — Briefing 60 วินาที (แหล่งความจริงหลัก)
- **[INSTRUCTION.md](INSTRUCTION.md)** — How-to guide ละเอียด
- **[SKILL.md](SKILL.md)** — Conventions & patterns
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical deep-dive
- **[CHANGELOG.md](CHANGELOG.md)** — สิ่งที่สร้างมาแล้ว
- **[coverage.md](coverage.md)** — รายงาน endpoint coverage (generated)

> ⚠️ ไฟล์อื่นนอกจาก AGENTS.md / CLAUDE.md ยังไม่ได้ตรวจแก้ ถ้าเจอที่ไหนบอกว่า "mock only /
> ไม่มี backend / ใช้ inline template" ให้ถือว่า**เอกสารนั้นผิด** และเชื่อ AGENTS.md + โค้ดจริงแทน

## Verification

ห้าม claim ว่าเสร็จถ้ายังไม่ได้รันครบและผ่านจริง:

```bash
npm run build
npm run audit:guard
npm run audit:coverage
npx ng test --watch=false
```

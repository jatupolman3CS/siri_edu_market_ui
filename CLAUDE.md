# CLAUDE.md

> Claude Code memory file — รายละเอียดเต็มอยู่ใน [AGENTS.md](AGENTS.md)

## Quick Context

**SIRIEDUMARKET** = Angular 21 marketplace frontend (TpT-inspired Thai version) — UI-first, mock data only, ยังไม่มี backend

## Critical Rules

1. **Signals + Standalone + OnPush** เท่านั้น (zoneless mode)
2. ใช้ `input()` / `output()` / `inject()` — ไม่ใช่ decorators
3. ใช้ `@if` / `@for` — ไม่ใช่ `*ngIf` / `*ngFor`
4. ห้ามใช้ `any` — ใช้ `unknown` หรือ generic
5. ห้ามใช้ NgModule
6. ใช้ inline `template:` ใน component
7. UI/copy เป็นภาษาไทย, identifier เป็น English
8. ตอบ user เป็นภาษาไทย

## Read Before Editing

- **[AGENTS.md](AGENTS.md)** — Briefing 60 วินาที
- **[INSTRUCTION.md](INSTRUCTION.md)** — How-to guide ละเอียด
- **[SKILL.md](SKILL.md)** — Conventions & patterns
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Technical deep-dive
- **[CHANGELOG.md](CHANGELOG.md)** — สิ่งที่สร้างมาแล้ว

## Verification

ห้าม claim ว่าเสร็จถ้ายังไม่ได้รัน `npm run build` ผ่าน

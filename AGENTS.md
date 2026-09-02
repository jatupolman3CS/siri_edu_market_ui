# AGENTS.md — Briefing for AI Agents 🤖

> ไฟล์นี้คือ **briefing 60 วินาที** สำหรับ AI agent (Claude / GPT / Gemini / Cursor / etc.) ที่จะเข้ามาทำงานกับ codebase นี้  อ่านก่อนแก้ code เสมอ

---

## 🎯 What is this?

**SIRIEDUMARKET** คือ Angular 21 marketplace สำหรับซื้อขายเอกสารวิชาการ + เทมเพลต (TpT-inspired Thai version)

**ระบบต่อ backend จริงแล้ว ไม่ใช่ mock** — repo นี้คือส่วน frontend ที่คุยกับ ASP.NET Core API
(`../siri_edu_market_backend`, **net10.0** + EF Core 10 + SQL Server) ครบ **107 endpoints**
ตรวจได้ด้วย `npm run audit:coverage` (backend 107 / sdk 107 / used 107 / orphan 0)
> เดิม 108 — endpoint `POST /api/seller/documents/{id}/ai-generate` ถูกลบทั้งเส้นตอนเก็บกวาด dead code (G-05)

**User คนสร้าง**: dev ไทย ใช้ภาษาไทยสนทนา ตอบเป็นไทย (โค้ด + identifier เป็น English)

---

## 🔌 Data Flow — ทางเดียวที่อนุญาต

```
page/component  →  core/services/*.service.ts  →  core/api/sdk.gen.ts (generated)
                                                      ↓
                                         core/api/client.gen.ts + core/api-runtime.ts
                                                      ↓
                                    API ที่ /api/...   (ASP.NET Core, ไม่มี path base)
```

- **`core/api/sdk.gen.ts` + `types.gen.ts` เป็นไฟล์ generated** — สร้างจาก OpenAPI ด้วย `npm run generate:api`
  **ห้ามแก้ด้วยมือ** (แก้แล้วหายตอน regenerate) ตรวจ drift ด้วย `npm run verify:api-drift`
- **base URL อยู่ที่ `src/app/core/api-runtime.ts`**
  override ได้ตอน runtime ผ่าน `window.__SIRIEDU_API_BASE_URL__` (ไม่ต้อง rebuild)
- `api-runtime.ts` ยังเป็นที่อยู่ของ custom `fetch` ที่แนบ `Authorization: Bearer`,
  ทำ **silent refresh แล้ว replay request เมื่อเจอ 401**, และคุม global loading
- helper แปลง URL ของไฟล์: `resolvePublicUrl()` / `downloadUrlForStorageKey()` — ใช้ตัวนี้เสมอ
  อย่าประกอบ URL ของไฟล์เอง
- `HttpClient` ใช้ได้เฉพาะเคสที่ generated SDK ทำไม่ได้ (เช่น multipart upload ใน
  `document.service.ts`) และต้องอยู่ใน `core/services/` เท่านั้น — ไม่ใช่ใน `features/**`

---

## 🚦 Critical Constraints — อ่านก่อนแก้!

### ✅ DO
- ใช้ **Angular Signals** (`signal()`, `computed()`) สำหรับ state — ห้ามใช้ Subject/BehaviorSubject เว้นแต่จำเป็น
- ใช้ **Standalone Components** เท่านั้น — ห้ามสร้าง NgModule
- ใช้ **`input()` / `output()` / `inject()`** function (Angular 17+ API) — ไม่ใช่ `@Input()` / `@Output()` decorators
- ใช้ **`templateUrl` + `styleUrl` แยกไฟล์** (`foo.page.html` / `foo.page.scss`) ตามแบบที่โค้ดส่วนใหญ่ทำ
  — 58 ไฟล์ใช้ `templateUrl`, เหลือแค่ 3 ไฟล์ที่ยัง inline (`app.ts`, `order-detail.page.ts`,
  `global-loader.component.ts`) ซึ่งเป็นข้อยกเว้นเก่า ไม่ใช่แบบอย่าง
- ใช้ **OnPush** change detection ทุก component (เพราะใช้ Zoneless)
- ใช้ **new control flow**: `@if`, `@for`, `@switch`, `@let` — ห้ามใช้ `*ngIf`, `*ngFor`
- ใช้ **`takeUntilDestroyed()`** จาก `@angular/core/rxjs-interop` แทน manual subscription cleanup
- ใช้ **Tailwind utility classes** + custom classes ใน `src/styles.scss` (`.btn-pink`, `.card-soft`, `.pill-pink`, …)
- ตั้งราคาในหน่วย THB เสมอ (`฿` prefix) ใช้ `ThbPipe`
- เขียน label/copy เป็น **ภาษาไทย** (UI ที่ผู้ใช้เห็น) — แต่ identifier/comment เป็น **English**
- ใช้ **Lazy loading** ทุก route (`loadComponent: () => import(...)`)
- เรียก API ผ่าน **service ใน `core/services/`** เสมอ (ดู §🔌 Data Flow)

### ❌ DON'T
- **ห้ามใช้ `any`** ใน TypeScript — ใช้ `unknown` หรือ generic แทน (เข้มเป็นพิเศษใน `core/**`)
- **ห้ามใช้ NgModule** — ทุกอย่างเป็น standalone
- **ห้าม import `core/api/sdk.gen` หรือ `core/api/client.gen` ตรงจาก `features/`**
  — ต้องห่อไว้ใน service ใน `core/services/` (มี CI guard บังคับ ดู §🛡️ Architectural Guards)
- **ห้ามแก้ไฟล์ generated ด้วยมือ** (`sdk.gen.ts`, `types.gen.ts`, `client.gen.ts`) — ใช้ `npm run generate:api`
- **ห้ามแก้ NG-ZORRO theme ผ่าน Less variables** — override ผ่าน CSS ใน `styles.scss` แทน (ดูตัวอย่างที่มีอยู่)
- **ห้ามใส่ background tasks ที่ไม่จำเป็น** — keep it simple
- **ห้ามสร้างไฟล์ .md ใหม่** ถ้า user ไม่ขอ
- **ห้ามใส่ emoji ใน code** เว้นแต่ user ขอ (UI/UX content เป็น emoji ได้)

---

## 🛡️ Architectural Guards — บังคับด้วยสคริปต์จริง

`npm run audit:guard` (`scripts/audit-guard.mjs`) exit non-zero เมื่อผิด กฎที่ **บังคับจริงตอนนี้**:

| rule id | บังคับอะไร |
|---|---|
| `no-sdk-gen-in-features` | ไฟล์ใน `src/app/features/**/*.ts` ห้าม import จาก `core/api/sdk.gen` — ต้องผ่าน service ใน `core/services/` |
| `no-client-gen-in-features` | ไฟล์ใน `src/app/features/**/*.ts` ห้าม import จาก `core/api/client.gen` — ให้เรียก SDK helper ผ่าน service |

`npm run audit:coverage` (`scripts/coverage-endpoints.mjs`) จับคู่ controller (.cs) ฝั่ง backend กับ
SDK helper ที่ UI เรียกจริง แล้วรายงาน `orphanBackend` (API มีแต่ UI ไม่เรียก) และ `orphanFrontend`
(UI เรียกแต่ API ไม่มี) — เขียนรายงานละเอียดลง `coverage.md`
**สถานะปัจจุบันต้องเป็น 107/107/107 และ orphan = 0** ถ้าตัวเลขเปลี่ยน แปลว่าคุณทำอะไรพัง

> หมายเหตุความแม่นยำ: comment หัวไฟล์ `audit-guard.mjs` พูดถึงกฎที่ 3 (ห้าม `any` ใน `core/**`)
> แต่ยัง **ไม่ได้ implement** ใน `RULES` — "ห้าม `any` ใน core" จึงยังเป็น convention ที่ต้องรีวิวเอง
> ไม่มี gate จับให้ (ปัจจุบัน `core/**` สะอาดอยู่ — อย่าเป็นคนแรกที่ทำพัง)

---

## 📦 Stack ที่ติดตั้งแล้ว (อย่าเพิ่ม dependency เกินจำเป็น)

```json
{
  "@angular/core": "^21.2.21",
  "@angular/router": "^21.2.21",
  "@angular/animations": "^21.2.21",
  "@angular/forms": "^21.2.21",
  "ng-zorro-antd": "^21.2.2",
  "tailwindcss": "^3.4.19",
  "rxjs": "~7.8.0"
}
```

ถ้าจะเพิ่ม dependency ใหม่ — **ถาม user ก่อน**

---

## 🗂️ Code Map — ไฟล์ที่ควรรู้จัก

| ต้องการทำอะไร? | ดูไฟล์ |
|---|---|
| เพิ่ม domain type ใหม่ | `src/app/core/models/index.ts` |
| ดู contract ของ API | `src/app/core/api/types.gen.ts` (generated — ห้ามแก้มือ) |
| เรียก endpoint ใหม่ | เพิ่ม method ใน `src/app/core/services/*.service.ts` แล้วเรียก helper จาก `core/api` |
| เปลี่ยน base URL / auth header / retry 401 | `src/app/core/api-runtime.ts` |
| ผูก token เข้ากับ SDK | `src/app/core/api/sdk-auth-bridge.ts` |
| เพิ่ม global state | `src/app/core/services/*.service.ts` |
| ป้องกัน route | `src/app/core/guards/auth.guard.ts`, `role.guard.ts` |
| ใช้ component shared | `src/app/shared/components/*` |
| เพิ่มหน้าใหม่ | `src/app/features/<role>/<name>/<name>.page.ts` + `.html` + `.scss` |
| ปรับ routing | `src/app/app.routes.ts` |
| เปลี่ยน theme | `tailwind.config.js` + `src/styles.scss` |
| เปลี่ยน DI providers | `src/app/app.config.ts` |

> `src/app/core/mock/` **ถูกลบไปแล้ว** (T-21, 937 บรรทัด) — อย่าสร้างขึ้นมาใหม่
> ข้อมูลตัวอย่างให้ดึงจาก API จริงเท่านั้น

---

## 🧠 Mental Model — Service-as-Store

ใช้ **service-as-store** pattern (Signal-based, no Redux) และให้ service เป็นที่เดียวที่แตะ SDK:

```ts
@Injectable({ providedIn: 'root' })
export class FooService {
  private readonly _items = signal<Foo[]>([]);

  // expose readonly
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);

  // API call lives here — never in a component
  async load(): Promise<void> {
    const result = await getApiFoo();
    this._items.set(unwrapSdkResult(result) ?? []);
  }
}
```

Component อ่านโดย call signal as function: `service.items()`
ใช้ `unwrapSdkResult()` (`core/services/api-result.ts`) แกะ response และ `ApiFailureReporter` รายงาน error

---

## 🛡️ Auth Flow

- **JWT จริง + refresh token จริง** ออกโดย backend — ดู `src/app/core/services/auth.service.ts`
- storage keys: `siriedu.auth` (session/user), `siriedu.auth.token` (access token),
  `siriedu.auth.refresh` (refresh token), `siriedu.auth.pending` (รอ verify email)
- ทุก request แนบ `Authorization: Bearer <access token>` ผ่าน custom fetch ใน `core/api-runtime.ts`
  (ผูกเข้ากับ `AuthService` โดย `provideSdkAuthBridge()` ใน `app.config.ts`)
- **401 → refresh หนึ่งครั้งแล้ว replay request เดิม** ถ้า refresh ไม่ผ่านค่อยจบ session
  (ยกเว้น endpoint ตระกูล `/api/auth/*` ที่ 401 คือคำตอบ ไม่ใช่ token หมดอายุ)
- รองรับ external provider (Google / Facebook / LINE) ผ่าน `postApiAuthExternalByProvider`
- หน้าที่ต้อง login: `/checkout`, `/library`, `/orders`, `/wishlist`, `/seller/*`, `/admin/*`
- หน้าที่ public: `/`, `/marketplace`, `/document/:id`, `/store/:id`, `/free`, `/bundles`, …
- กดปุ่มซื้อโดยไม่ login → redirect `/auth/login?returnUrl=...`
- ใช้ `authGuard` / `roleGuard` ใน routes config; ใช้ `auth.isAuthenticated()` ใน components

---

## 🎨 Styling Cheatsheet

```html
<!-- Buttons -->
<button class="btn-pink">Primary</button>
<button class="btn-ghost">Secondary</button>
<button class="btn-icon">⚙</button>

<!-- Cards -->
<div class="card-soft">…</div>
<div class="card-cream">…</div>

<!-- Pills -->
<span class="pill-pink">Active</span>
<span class="pill-soft">Tag</span>

<!-- Section title -->
<h2 class="section-title">Heading</h2>
<p class="section-subtitle">Description</p>

<!-- Inputs (NG-ZORRO will auto-pick pink theme via CSS overrides in styles.scss) -->
<input class="input-soft" />
```

ดูเต็มๆ ที่ `src/styles.scss` (ส่วน `@layer components`)

---

## ✅ Verifying Changes

ต้องรันครบทั้ง 4 คำสั่งและผ่านจริง ก่อน claim ว่าเสร็จ:

```bash
npm run build              # type check + production build
npm run audit:guard        # architectural boundaries (features ห้ามแตะ sdk.gen / client.gen)
npm run audit:coverage     # endpoint coverage — ต้องได้ 107/107/107, orphan 0
npx ng test --watch=false  # unit tests (single run)
```

คำสั่งเสริมเมื่อแตะ API layer:

```bash
npm run generate:api       # regenerate SDK จาก OpenAPI
npm run verify:api-drift   # เช็คว่า SDK ยังตรงกับ backend
```

**ห้าม claim ว่าเสร็จถ้ายังไม่ได้รันจริง** ถ้ารันไม่ได้ให้บอกตรงๆ ว่าทำไม

---

## 🔒 Security Notes

- auth เป็น **JWT + refresh token จริงจาก backend** — access token อายุสั้น (~15 นาที) แล้ว silent refresh
- token เก็บใน `localStorage` ซึ่ง **ไม่ใช่ secure storage** (เสี่ยง XSS)
  ถ้าจะยกระดับ production ควรย้ายไป httpOnly cookie — ต้องแก้ทั้ง backend และ `api-runtime.ts`
- **ห้ามเก็บ secret / API key / client secret ใน frontend code** — public config ดึงจาก backend
  (ดู `google-oauth-config.service.ts`)
- อย่า log token, refresh token, หรือ PII ลง console
- authorization ตัวจริงอยู่ที่ backend เสมอ — `authGuard` / `roleGuard` เป็นแค่ UX ไม่ใช่ security boundary

---

## 🆘 ถาม User ก่อน เมื่อ:

- จะเพิ่ม dependency ใหม่
- จะเปลี่ยน theme/palette หลัก
- จะลบหรือเปลี่ยน public API ของ services ที่ใช้กันแพร่หลาย
- จะเปลี่ยน API contract (ต้องแก้ backend ก่อนแล้ว regenerate SDK)
- จะเปลี่ยนวิธีเก็บ token หรือ auth flow
- จะเพิ่ม mock data กลับเข้ามาในโปรเจกต์

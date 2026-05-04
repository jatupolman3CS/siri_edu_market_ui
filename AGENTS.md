# AGENTS.md — Briefing for AI Agents 🤖

> ไฟล์นี้คือ **briefing 60 วินาที** สำหรับ AI agent (Claude / GPT / Gemini / Cursor / etc.) ที่จะเข้ามาทำงานกับ codebase นี้  อ่านก่อนแก้ code เสมอ

---

## 🎯 What is this?

**SIRIEDUMARKET** คือ Angular 21 marketplace สำหรับซื้อขายเอกสารวิชาการ + เทมเพลต (TpT-inspired Thai version)
ตอนนี้มีแต่ **Frontend (UI-first)** — ไม่มี backend, ใช้ mock data ทั้งหมด

**User คนสร้าง**: dev ไทย ใช้ภาษาไทยสนทนา ตอบเป็นไทย (โค้ด + identifier เป็น English)

---

## 🚦 Critical Constraints — อ่านก่อนแก้!

### ✅ DO
- ใช้ **Angular Signals** (`signal()`, `computed()`) สำหรับ state — ห้ามใช้ Subject/BehaviorSubject เว้นแต่จำเป็น
- ใช้ **Standalone Components** เท่านั้น — ห้ามสร้าง NgModule
- ใช้ **`input()` / `output()`** function (Angular 17+ API) — ไม่ใช่ `@Input()` / `@Output()` decorators
- ใช้ **inline `template:`** ใน `@Component` (ไม่แยกเป็น `.html`) ตามแบบที่มีอยู่
- ใช้ **OnPush** change detection ทุก component (เพราะใช้ Zoneless)
- ใช้ **new control flow**: `@if`, `@for`, `@switch`, `@let` — ห้ามใช้ `*ngIf`, `*ngFor`
- ใช้ **`takeUntilDestroyed()`** จาก `@angular/core/rxjs-interop` แทน manual subscription cleanup
- ใช้ **Tailwind utility classes** + custom classes ใน `src/styles.scss` (`.btn-pink`, `.card-soft`, `.pill-pink`, …)
- ตั้งราคาในหน่วย THB เสมอ (`฿` prefix) ใช้ `ThbPipe`
- เขียน label/copy เป็น **ภาษาไทย** (UI ที่ผู้ใช้เห็น) — แต่ identifier/comment เป็น **English**
- ใช้ **Lazy loading** ทุก route (`loadComponent: () => import(...)`)

### ❌ DON'T
- **ห้ามใช้ `any`** ใน TypeScript — ใช้ `unknown` หรือ generic แทน
- **ห้ามใช้ NgModule** — ทุกอย่างเป็น standalone
- **ห้ามใช้ HttpClient เรียก API จริง** — ตอนนี้เป็น mock-only
- **ห้ามแก้ NG-ZORRO theme ผ่าน Less variables** — override ผ่าน CSS ใน `styles.scss` แทน (ดูตัวอย่างที่มีอยู่)
- **ห้ามใส่ background tasks ที่ไม่จำเป็น** — keep it simple
- **ห้ามสร้างไฟล์ .md ใหม่** ถ้า user ไม่ขอ
- **ห้ามใส่ emoji ใน code** เว้นแต่ user ขอ (UI/UX content เป็น emoji ได้)

---

## 📦 Stack ที่ติดตั้งแล้ว (อย่าเพิ่ม dependency เกินจำเป็น)

```json
{
  "@angular/core": "^21.2.0",
  "@angular/router": "^21.2.0",
  "@angular/animations": "^21.2.0",
  "@angular/forms": "^21.2.0",
  "ng-zorro-antd": "^21.2.2",
  "tailwindcss": "^3.4.x",
  "rxjs": "~7.8.0"
}
```

ถ้าจะเพิ่ม dependency ใหม่ — **ถาม user ก่อน**

---

## 🗂️ Code Map — ไฟล์ที่ควรรู้จัก

| ต้องการทำอะไร? | ดูไฟล์ |
|---|---|
| เพิ่ม domain type ใหม่ | `src/app/core/models/index.ts` |
| เพิ่มข้อมูลตัวอย่าง | `src/app/core/mock/*.mock.ts` |
| เพิ่ม global state | `src/app/core/services/*.service.ts` |
| ป้องกัน route | `src/app/core/guards/auth.guard.ts` |
| ใช้ component shared | `src/app/shared/components/*.ts` |
| เพิ่มหน้าใหม่ | `src/app/features/<role>/<name>.page.ts` |
| ปรับ routing | `src/app/app.routes.ts` |
| เปลี่ยน theme | `tailwind.config.js` + `src/styles.scss` |
| เปลี่ยน DI providers | `src/app/app.config.ts` |

---

## 🧠 Mental Model — Service-as-Store

ใช้ **service-as-store** pattern (Signal-based, no Redux):

```ts
@Injectable({ providedIn: 'root' })
export class FooService {
  private readonly _items = signal<Foo[]>([]);

  // expose readonly
  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);

  // mutators
  add(item: Foo): void {
    this._items.update(list => [...list, item]);
  }
}
```

Component อ่านโดย call signal as function: `service.items()`

---

## 🛡️ Auth Flow

- `AuthService` เก็บ session ใน `localStorage` (key `siriedu.auth`)
- หน้าที่ต้อง login: `/checkout`, `/library`, `/orders`, `/wishlist`, `/seller/*`, `/admin/*`
- หน้าที่ public: `/`, `/marketplace`, `/document/:id`, `/store/:id`, `/free`, `/bundles`, …
- กดปุ่มซื้อโดยไม่ login → redirect `/auth/login?returnUrl=...`
- ใช้ `authGuard` ใน routes config; ใช้ `auth.isAuthenticated()` ใน components

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

```bash
# Type check + build
npm run build

# Dev server (auto reload)
npm start
```

ห้าม claim ว่าเสร็จถ้ายังไม่รัน build ผ่าน

---

## 🔒 Security Notes

- ทุก auth ตอนนี้เป็น **mock** — ไม่มี real cryptography หรือ JWT
- รหัส OTP สุ่มแบบ insecure (`Math.random()`) — เปลี่ยนตอนต่อ backend จริง
- localStorage ไม่ใช่ secure storage — production ควรใช้ httpOnly cookies + JWT/session
- **ห้ามเก็บ secrets ใน frontend code** ตอนต่อ backend

---

## 🆘 ถาม User ก่อน เมื่อ:

- จะเพิ่ม dependency ใหม่
- จะเปลี่ยน theme/palette หลัก
- จะลบหรือเปลี่ยน public API ของ services ที่ใช้กันแพร่หลาย
- จะเริ่ม backend / API integration
- ไม่แน่ใจว่าควร mock vs จะ fetch จริง

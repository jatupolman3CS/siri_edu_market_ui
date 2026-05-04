# SKILL.md — Code Conventions & Patterns 🎯

> รวม code conventions, patterns และ idioms ที่ใช้ในโปรเจกต์นี้  ทุกคนควรอ่านก่อนเริ่ม contribute

---

## 1. TypeScript

### 1.1 Strict typing

- **❌ ห้ามใช้ `any`** — ใช้ `unknown` + narrowing หรือ generic
- ใช้ `readonly` กับ field ที่ไม่ควรเปลี่ยน (รวมถึง signals: `readonly count = signal(0)`)
- ใช้ `as const` กับ literal arrays/objects
- ตั้งค่า `strict: true` + `noImplicitOverride`, `noUncheckedIndexedAccess` ที่ tsconfig

### 1.2 Imports order

```ts
// 1. Angular core
import { Component, inject, signal } from '@angular/core';

// 2. Angular sub-packages
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

// 3. Third-party libraries
import { NzMessageService } from 'ng-zorro-antd/message';

// 4. App imports — relative paths from far → near
import { CartService } from '../../core/services';
import { DocumentItem } from '../../core/models';
import { IconComponent } from '../../shared/components/icon.component';
import { ThbPipe } from '../pipes/thb.pipe';
```

### 1.3 Naming

- **PascalCase** — Components, Services, Interfaces, Types, Enums
- **camelCase** — variables, functions, methods, properties
- **SCREAMING_SNAKE_CASE** — module-level constants (mock data, env keys)
- **kebab-case** — file names (`document-card.component.ts`, `auth.guard.ts`)

### 1.4 File naming pattern

| Type | Pattern | Example |
|---|---|---|
| Component | `<name>.component.ts` | `document-card.component.ts` |
| Page (route) | `<name>.page.ts` | `home.page.ts` |
| Service | `<name>.service.ts` | `cart.service.ts` |
| Pipe | `<name>.pipe.ts` | `thb.pipe.ts` |
| Guard | `<name>.guard.ts` | `auth.guard.ts` |
| Mock data | `<name>.mock.ts` | `documents.mock.ts` |
| Models | `index.ts` (single file) | `core/models/index.ts` |

---

## 2. Angular

### 2.1 Standalone Components

ทุก component **ต้อง**เป็น standalone:

```ts
@Component({
  selector: 'app-x',
  standalone: true,             // ← required
  imports: [/* ... */],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `...`,
})
```

**ห้าม**สร้าง NgModule

### 2.2 Inputs & Outputs (Angular 17.1+ API)

```ts
import { input, output, model } from '@angular/core';

// Required input
readonly id = input.required<string>();

// Optional input with default
readonly size = input<number>(20);

// Output (signal-based event emitter)
readonly select = output<string>();

// Two-way binding
readonly value = model<number>(0);
```

❌ ห้ามใช้ `@Input()` `@Output()` decorators

### 2.3 Change Detection

ใช้ **OnPush** ทุก component (เพราะใช้ Zoneless):

```ts
import { ChangeDetectionStrategy } from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

### 2.4 Control Flow (Angular 17+)

```html
<!-- ✅ Use new control flow -->
@if (user(); as u) {
  <div>{{ u.name }}</div>
} @else {
  <div>Guest</div>
}

@for (item of items(); track item.id) {
  <div>{{ item.name }}</div>
} @empty {
  <p>ไม่มีรายการ</p>
}

@switch (status()) {
  @case ('loading') { <spinner /> }
  @case ('ready') { <content /> }
  @default { <error /> }
}

@let user = auth.user();
<div>{{ user?.name }}</div>

<!-- ❌ Don't use structural directives -->
<div *ngIf="...">…</div>
<div *ngFor="...">…</div>
```

### 2.5 Dependency Injection

ใช้ `inject()` function — ไม่ใช่ constructor:

```ts
// ✅ Modern
export class FooPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
}

// ❌ Old-style
export class FooPage {
  constructor(
    private auth: AuthService,
    private router: Router,
  ) {}
}
```

### 2.6 Subscriptions cleanup

```ts
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

constructor() {
  this.route.paramMap
    .pipe(takeUntilDestroyed())
    .subscribe(params => {
      this.id.set(params.get('id') ?? '');
    });
}
```

❌ ห้ามใช้ `Subject<void>()` + `takeUntil()` แบบเก่า

---

## 3. State Management — Signals

### 3.1 Service-as-Store Pattern

```ts
@Injectable({ providedIn: 'root' })
export class FooService {
  // 1. Private mutable signal
  private readonly _items = signal<Foo[]>([]);

  // 2. Public readonly view
  readonly items = this._items.asReadonly();

  // 3. Computed derived state
  readonly count = computed(() => this._items().length);
  readonly hasItems = computed(() => this._items().length > 0);

  // 4. Mutators
  add(item: Foo): void {
    this._items.update(list => [...list, item]);
  }

  remove(id: string): void {
    this._items.update(list => list.filter(i => i.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }
}
```

### 3.2 Component Signals

```ts
export class CounterComponent {
  // Local state
  readonly count = signal(0);

  // Computed
  readonly doubled = computed(() => this.count() * 2);

  // Effect (side-effects from signal changes)
  constructor() {
    effect(() => {
      console.log('count changed:', this.count());
    });
  }

  inc() { this.count.update(c => c + 1); }
}
```

### 3.3 Reading signals

ใน template/code: **call as function** — `service.items()` ไม่ใช่ `service.items`

```html
<!-- ✅ -->
@if (auth.isAuthenticated()) { ... }
{{ cart.count() }} items
@for (d of catalog.documents(); track d.id) { ... }

<!-- ❌ -->
@if (auth.isAuthenticated) { ... }
```

---

## 4. UI Components

### 4.1 Inline templates

ใช้ inline `template:` ใน component (ไม่ใช่แยก `.html`):

```ts
@Component({
  selector: 'app-x',
  standalone: true,
  template: `
    <div class="card-soft p-5">
      <h3>{{ title() }}</h3>
    </div>
  `,
})
```

แยกเฉพาะกรณีที่ template ใหญ่มาก (>500 บรรทัด)

### 4.2 Custom utility classes

ใช้ utility classes ที่กำหนดใน `src/styles.scss` แทนการเขียน Tailwind ยาวๆ ซ้ำ:

```html
<!-- ✅ Use custom class -->
<button class="btn-pink">Submit</button>

<!-- ❌ Don't repeat -->
<button class="inline-flex items-center justify-center gap-2 px-5 py-2.5
               rounded-full bg-pink-500 hover:bg-pink-600 text-white
               font-semibold shadow-soft transition-all duration-200">
  Submit
</button>
```

### 4.3 Component event handlers

ทำให้ตรงไปตรงมา + กัน event bubbling เมื่อต้อง:

```ts
addToCart(event: Event): void {
  event.preventDefault();    // ถ้าอยู่ในลิงก์
  event.stopPropagation();   // ถ้าอยู่ใน clickable parent
  if (!this.cart.has(this.doc().id)) {
    this.cart.add(this.doc());
  }
}
```

---

## 5. Styling

### 5.1 Tailwind first

ใช้ Tailwind utility ก่อน — สร้าง custom class เฉพาะที่ใช้ซ้ำ ≥ 3 ที่

### 5.2 Spacing scale (Tailwind defaults)

- `gap-2` = 8px (tight)
- `gap-3` = 12px (default)
- `gap-4` = 16px (medium)
- `gap-6` = 24px (large)
- `gap-8` = 32px (section)

### 5.3 Border radius

| ขนาด | ใช้กับ |
|---|---|
| `rounded-xl` (1rem) | inputs, buttons เล็ก |
| `rounded-2xl` (1.5rem) | tabs, list items, modals body |
| `rounded-3xl` (2.5rem) | **cards, hero, signature** |
| `rounded-full` | pills, avatars, icon buttons |

### 5.4 Shadow

- `shadow-soft` — default card
- `shadow-pop` — hover state, primary action
- `shadow-float` — modal, floating panel

### 5.5 Color palette

```
pink-50:  #FFF7FA  - canvas / very subtle bg
pink-100: #FFEAF1  - hover bg, soft pill
pink-200: #FFD6E4  - chart fill, secondary
pink-300: #FFB8CE  - decorative blob
pink-400: #FF8AAF  - accent
pink-500: #F2638E  - PRIMARY (buttons, links, active)
pink-600: #D94B78  - hover, body links
pink-700: #B83864  - on-pink-100 text
ink:      #2A1B22  - primary text
ink-soft: #5A4751  - secondary text
ink-muted:#8A7A82  - tertiary text, hints
line:     #F3E6EC  - borders, dividers
```

---

## 6. Mock Data

### 6.1 Stable IDs

ใช้ pattern `<prefix>-<NNN>` ที่อ่านได้:

```ts
{ id: 'doc-001', /* … */ }
{ id: 'cat-edu', /* … */ }
{ id: 'sub-edu-tgat', /* … */ }
{ id: 'seller-01', /* … */ }
{ id: 'bundle-001', /* … */ }
```

### 6.2 Realistic numbers

ใช้ตัวเลขที่ดูสมจริง — ไม่ใช่ทุกอันเป็น `100`:

```ts
// ✅
rating: 4.7,
reviewCount: 184,
downloads: 1108,

// ❌
rating: 5.0,
reviewCount: 100,
downloads: 1000,
```

### 6.3 Reference relationships

อย่าใช้ ID ที่ไม่มีจริง — relationship ต้อง valid:

```ts
{
  categoryId: 'cat-edu',          // ต้องมีใน MOCK_CATEGORIES
  subcategoryId: 'sub-edu-tgat',  // ต้องมีใน SUBCATS + parentId = categoryId
  sellerIdx: 0,                   // index ที่มีจริงใน MOCK_SELLERS
}
```

### 6.4 Cover images

ใช้ Unsplash CDN URL พร้อม `?w=...&h=...&fit=crop` parameters

---

## 7. Performance

### 7.1 Lazy loading

ทุก route ใช้ `loadComponent`:

```ts
{
  path: 'foo',
  loadComponent: () =>
    import('./features/buyer/foo.page').then(m => m.FooPage),
}
```

### 7.2 Track function for `@for`

ใช้ unique key:

```html
@for (item of items(); track item.id) { ... }
```

❌ ห้ามใช้ `track $index` (มันคือ default แล้ว และ inefficient เมื่อ list มีการ reorder)

### 7.3 Computed > Recompute

Compute ใน signal computed แทน method ที่เรียกใน template:

```ts
// ✅
readonly total = computed(() =>
  this.items().reduce((s, i) => s + i.price, 0)
);

// ❌ ใน template เรียก method() ทุก CD cycle
totalMethod() {
  return this.items().reduce(...);
}
```

---

## 8. Accessibility

- มี `alt` ทุก `<img>` (เว้นแต่ decorative — ใช้ `alt=""`)
- มี `aria-label` ในปุ่มที่ไม่มี text (icon-only)
- ใช้ semantic HTML — `<nav>`, `<header>`, `<main>`, `<aside>`, `<article>`, `<footer>`
- focus state มองเห็นได้ (Tailwind: `focus:ring-4 focus:ring-pink-100`)
- form fields มี `<label>` คู่กัน

---

## 9. Git Convention (เมื่อเริ่มใช้)

```
feat: add wishlist functionality
fix: resolve cart drawer overlay issue
refactor: extract bundle card component
chore: bump @angular/core to 21.2.10
docs: update INSTRUCTION.md with auth flow
```

ห้าม commit:
- `node_modules/`
- `dist/`
- `.env*`
- `.angular/cache/`

---

## 10. Anti-patterns to Avoid

| ❌ Don't | ✅ Do |
|---|---|
| `[ngStyle]="{ width: dynamic + 'px' }"` | `[style.width.px]="dynamic"` |
| `class="w-[{{ x }}px]"` | `[style.width.px]="x"` (Tailwind ไม่ scan dynamic) |
| `subscribe()` without cleanup | `pipe(takeUntilDestroyed())` |
| Calling method in template (heavy work) | `computed()` |
| `*ngIf="!isLoading; else loading"` | `@if (!loading()) { ... } @else { ... }` |
| Inline `style="..."` | Tailwind class หรือ component style |
| `console.log` ที่ไม่ได้ตั้งใจ | ลบก่อน commit (ยกเว้น mock auth code log ที่จงใจ) |
| Service ที่ inject ใน component อื่น | service ควรเป็น `providedIn: 'root'` |
| Mutating signals directly | ใช้ `.set()`, `.update()` เท่านั้น |
| ใช้ `var` หรือ `let` ที่ไม่ reassign | ใช้ `const` |

---

## 📚 References

- [Angular Signals Guide](https://angular.dev/guide/signals)
- [Angular Standalone Components](https://angular.dev/guide/standalone-components)
- [NG-ZORRO Components](https://ng.ant.design/components/overview/en)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)

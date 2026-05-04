# INSTRUCTION.md — How-To Guide 📘

> คู่มือแบบละเอียดสำหรับการทำงานกับ codebase ทุกแบบที่พบบ่อย พร้อมตัวอย่างโค้ดที่ copy-paste ได้

อ่าน **[AGENTS.md](AGENTS.md)** ก่อนเพื่อเข้าใจ context รวม

---

## 📋 Table of Contents

1. [การติดตั้งและรันโปรเจกต์](#1-การติดตั้งและรันโปรเจกต์)
2. [การเพิ่มหน้าใหม่](#2-การเพิ่มหน้าใหม่)
3. [การเพิ่ม Component shared](#3-การเพิ่ม-component-shared)
4. [การเพิ่ม Service / Store](#4-การเพิ่ม-service--store)
5. [การเพิ่ม Mock Data](#5-การเพิ่ม-mock-data)
6. [การเพิ่ม Domain Model](#6-การเพิ่ม-domain-model)
7. [การเพิ่ม Sub-category](#7-การเพิ่ม-sub-category)
8. [การปกป้อง Route ด้วย Guard](#8-การปกป้อง-route-ด้วย-guard)
9. [การใช้ NG-ZORRO Components](#9-การใช้-ng-zorro-components)
10. [การปรับ Theme](#10-การปรับ-theme)
11. [การต่อ Backend จริง (เมื่อพร้อม)](#11-การต่อ-backend-จริง-เมื่อพร้อม)

---

## 1. การติดตั้งและรันโปรเจกต์

```bash
cd siriedumarket-web

# Install
npm install

# Dev server (auto-reload, port 4200)
npm start
# หรือ
npx ng serve --port 4200

# Production build (output: dist/)
npm run build

# Watch dev build (no server)
npm run watch

# Type check + tests
npm test
```

**Requirements**: Node.js ≥ 20, npm ≥ 10

---

## 2. การเพิ่มหน้าใหม่

### Step 1: สร้างไฟล์หน้า

ตั้งชื่อตามแพทเทิร์น `<feature>/<name>.page.ts`

```ts
// src/app/features/buyer/wishlist.page.ts
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { WishlistService } from '../../core/services';
import { PageHeroComponent } from '../../shared/components/page-hero.component';

@Component({
  selector: 'app-buyer-wishlist',
  standalone: true,
  imports: [RouterLink, PageHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-7xl mx-auto px-4 lg:px-6 py-8">
      <app-page-hero
        eyebrow="รายการโปรด"
        title="เก็บไว้ดูทีหลัง 💗"
      />
      <!-- content -->
    </div>
  `,
})
export class BuyerWishlistPage {
  readonly wishlist = inject(WishlistService);
}
```

### Step 2: เพิ่ม route ใน `app.routes.ts`

```ts
{
  path: 'wishlist',
  canActivate: [authGuard],     // ถ้าต้อง login
  loadComponent: () =>
    import('./features/buyer/wishlist.page').then(m => m.BuyerWishlistPage),
  title: 'รายการโปรด — SIRIEDUMARKET',
}
```

> เพิ่มใน children ของ buyer-layout (สำหรับหน้าผู้ซื้อ) หรือ seller/admin layout ตามบทบาท

### Step 3: เพิ่ม nav link (ถ้าต้องการ)

แก้ใน `src/app/shared/components/app-header.component.ts`:

```ts
readonly navItems = [
  { label: 'หน้าแรก', href: '/', exact: true },
  { label: 'รายการโปรด', href: '/wishlist' },  // ← เพิ่ม
  // …
];
```

---

## 3. การเพิ่ม Component shared

### Standalone component pattern (default)

```ts
// src/app/shared/components/badge-pink.component.ts
import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-badge-pink',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="pill-pink">
      @if (icon()) { <span>{{ icon() }}</span> }
      {{ label() }}
    </span>
  `,
})
export class BadgePinkComponent {
  readonly label = input.required<string>();
  readonly icon = input<string>('');
}
```

### Output events

```ts
import { output } from '@angular/core';

export class FooComponent {
  readonly select = output<string>();

  onClick() {
    this.select.emit('value');
  }
}
```

ใน parent:
```html
<app-foo (select)="handleSelect($event)" />
```

### Component with model (two-way binding) — Angular 17+

```ts
import { model } from '@angular/core';

export class CounterComponent {
  readonly value = model<number>(0);

  inc() {
    this.value.update(v => v + 1);
  }
}
```

---

## 4. การเพิ่ม Service / Store

### Pattern: Signal-based store

```ts
// src/app/core/services/notifications.service.ts
import { Injectable, computed, signal } from '@angular/core';

export interface AppNotification {
  id: string;
  message: string;
  type: 'info' | 'warn' | 'error';
  createdAt: string;
  read: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly _items = signal<AppNotification[]>([]);

  readonly items = this._items.asReadonly();
  readonly count = computed(() => this._items().length);
  readonly unreadCount = computed(
    () => this._items().filter(n => !n.read).length,
  );

  push(n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): void {
    this._items.update(list => [
      {
        ...n,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        read: false,
      },
      ...list,
    ]);
  }

  markRead(id: string): void {
    this._items.update(list =>
      list.map(n => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  clear(): void {
    this._items.set([]);
  }
}
```

### Step 2: Export ใน `services/index.ts`

```ts
export * from './notifications.service';
```

### ใช้ใน component

```ts
import { inject } from '@angular/core';
import { NotificationsService } from '../../core/services';

export class HeaderComponent {
  readonly notifications = inject(NotificationsService);
  // เรียกใน template: notifications.unreadCount()
}
```

### Persist ลง localStorage (optional)

ดูตัวอย่างใน `WishlistService` หรือ `AuthService` — ใช้ pattern:

```ts
private loadInitial(): T[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

private persist(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._items()));
  } catch { /* quota / SSR */ }
}
```

---

## 5. การเพิ่ม Mock Data

### เพิ่มข้อมูลในไฟล์ที่มีอยู่แล้ว

```ts
// src/app/core/mock/documents.mock.ts
const SEEDS: SeedDoc[] = [
  // …existing
  {
    title: 'ชื่อใหม่',
    shortDescription: '…',
    description: '…',
    price: 199,
    format: 'pdf',
    pages: 50,
    fileSize: '5 MB',
    language: 'th',
    categoryId: 'cat-edu',
    subcategoryId: 'sub-edu-tgat',     // ← ต้องตรงกับ subcategories ใน categories.mock.ts
    gradeLevels: ['secondary-late'],
    resourceType: 'lesson-summary',
    standards: ['TGAT'],
    tags: ['ใหม่', 'TGAT'],
    rating: 4.8,
    reviewCount: 24,
    downloads: 102,
    sellerIdx: 0,                      // ← index ใน MOCK_SELLERS
    aiSummary: ['…', '…', '…'],
  },
];
```

### สร้างไฟล์ mock ใหม่

```ts
// src/app/core/mock/notifications.mock.ts
import { AppNotification } from '../models';

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: 'n1', message: 'มียอดขายใหม่!', type: 'info',
    createdAt: '2026-05-04T10:00:00Z', read: false },
  // …
];
```

แล้วใน service:

```ts
import { MOCK_NOTIFICATIONS } from '../mock/notifications.mock';

private readonly _items = signal(MOCK_NOTIFICATIONS);
```

---

## 6. การเพิ่ม Domain Model

แก้ไฟล์ `src/app/core/models/index.ts`:

```ts
// เพิ่ม type alias
export type SubscriptionPlan = 'free' | 'plus' | 'pro';

// เพิ่ม interface
export interface Subscription {
  id: string;
  userId: string;
  plan: SubscriptionPlan;
  startedAt: string;
  expiresAt: string;
  autoRenew: boolean;
}

// (optional) Helper labels — pattern เดียวกับ GRADE_LEVEL_LABELS
export const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  free: 'ฟรี',
  plus: 'Plus',
  pro: 'Pro',
};
```

---

## 7. การเพิ่ม Sub-category

แก้ `src/app/core/mock/categories.mock.ts` — เพิ่มใน array `SUBCATS`:

```ts
const SUBCATS: Subcategory[] = [
  // …existing
  { id: 'sub-edu-newone', parentId: 'cat-edu',
    name: 'หมวดย่อยใหม่', slug: 'new-one',
    icon: '✨', documentCount: 0 },
];
```

จากนั้นใน documents.mock.ts ใส่ `subcategoryId: 'sub-edu-newone'` ในเอกสารที่ต้องการ

หน้า Marketplace + Categories + Category Detail จะเห็นข้อมูลใหม่ทันที (filter, drill-down, count)

---

## 8. การปกป้อง Route ด้วย Guard

### แบบ 1: ใช้ `authGuard` ที่มีอยู่

```ts
// app.routes.ts
import { authGuard } from './core/guards/auth.guard';

{
  path: 'private-page',
  canActivate: [authGuard],     // ← เพิ่ม
  loadComponent: () => import('./features/buyer/private.page').then(m => m.X),
}
```

### แบบ 2: สร้าง guard ใหม่

```ts
// src/app/core/guards/role.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services';

export const sellerGuard: CanActivateFn = (): boolean | UrlTree => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/auth/login']);
  }
  if (auth.user()?.role !== 'seller') {
    return router.createUrlTree(['/']);
  }
  return true;
};
```

ใช้ใน routes ตามแบบ 1

---

## 9. การใช้ NG-ZORRO Components

โหลด **CSS รวม** อยู่แล้วใน `styles.scss` — แค่ import module ของ component ที่ใช้:

```ts
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzModalModule } from 'ng-zorro-antd/modal';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  // …
  imports: [NzSelectModule, NzModalModule],
})
export class FooComponent {
  private message = inject(NzMessageService);

  toast() {
    this.message.success('สำเร็จ!');
  }
}
```

### Components ที่ใช้บ่อยในโปรเจกต์

| Component | Module | Usage |
|---|---|---|
| Drawer | `nz-drawer` | Cart drawer |
| Modal | `nz-modal` | Quick view |
| Tabs | `nz-tabs` + `nz-tab` | Document detail tabs |
| Select | `nz-select` + `nz-option` | Sort dropdown |
| Slider | `nz-slider` | Price range |
| Dropdown | `nz-dropdown-menu` | User menu in header |
| Message | `NzMessageService` | Toast notifications |

> Tab ใน NG-ZORRO 21 ใช้ selector `nz-tabs` + `nz-tab` (ไม่ใช่ `nz-tabset`!) และไม่มี `nzTabHeading` directive — ใช้ `[nzTitle]="..."` หรือ string

---

## 10. การปรับ Theme

### เพิ่มสีใหม่

`tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      pink: { /* existing */ },
      // เพิ่ม
      success: { 500: '#10B981', 600: '#059669' },
    },
  },
}
```

### เพิ่ม custom utility class

`src/styles.scss` (ส่วน `@layer components`):

```scss
@layer components {
  .btn-success {
    @apply inline-flex items-center justify-center gap-2 px-5 py-2.5
           rounded-full bg-success-500 hover:bg-success-600
           text-white font-semibold shadow-soft transition-all;
  }
}
```

### Override NG-ZORRO theme

`src/styles.scss` (ตามแพทเทิร์นที่มีอยู่):

```scss
.ant-some-component {
  border-radius: 1rem !important;
  background: var(--pink-50) !important;
}
```

---

## 11. การต่อ Backend จริง (เมื่อพร้อม)

### Step 1: สร้าง API client

```ts
// src/app/core/api/document.api.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DocumentItem } from '../models';

@Injectable({ providedIn: 'root' })
export class DocumentApi {
  private http = inject(HttpClient);
  private base = '/api/documents';

  list(): Observable<DocumentItem[]> {
    return this.http.get<DocumentItem[]>(this.base);
  }

  byId(id: string): Observable<DocumentItem> {
    return this.http.get<DocumentItem>(`${this.base}/${id}`);
  }
}
```

### Step 2: เปลี่ยน CatalogService

```ts
// แทน MOCK_DOCUMENTS — fetch จาก API + รักษา signal pattern
import { rxResource, toSignal } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private api = inject(DocumentApi);

  private readonly _data = rxResource({
    loader: () => this.api.list(),
  });

  readonly documents = computed(() => this._data.value() ?? []);
  readonly loading = this._data.isLoading;
  readonly error = this._data.error;
}
```

### Step 3: เพิ่ม HTTP interceptor (auth token)

```ts
// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.session()?.token;
  return token
    ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
    : next(req);
};
```

ลงทะเบียนใน `app.config.ts`:

```ts
provideHttpClient(
  withFetch(),
  withInterceptors([authInterceptor]),
)
```

### Step 4: ปรับ AuthService ให้ call API จริง

แทน `signIn(email, password)` mock — เรียก `/api/auth/login` จริงและเก็บ token

---

## 🆘 Troubleshooting

| ปัญหา | วิธีแก้ |
|---|---|
| `nz-tabset is not a known element` | เปลี่ยนเป็น `nz-tabs` (NG-ZORRO 21 API) |
| `*ngIf is deprecated` warning | ใช้ `@if` block แทน |
| Tailwind class ไม่ทำงาน (เช่น dynamic class name) | Tailwind ต้องเห็น literal string — ใช้ `[ngClass]` หรือ class binding แทน string interpolation |
| Build budget เกิน | เพิ่ม budget ใน `angular.json` หรือลด component CSS |
| `Cannot resolve "ng-zorro-antd/X/style/index.min.css"` | ใช้ `@import 'ng-zorro-antd/ng-zorro-antd.min.css';` (root bundle) |
| `MOCK_USER` is signed in by default | จริงๆ AuthService อ่าน localStorage ก่อน — clear `siriedu.auth` key หรือ Incognito mode |

ดู **[SKILL.md](SKILL.md)** สำหรับ conventions เพิ่มเติม

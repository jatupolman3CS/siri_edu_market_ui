// ============================================================
// SIRIEDUMARKET — Domain Models
// ============================================================

export type DocumentStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type FileFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'zip';
export type OrderStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'fulfilled'
  | 'refunded'
  | 'cancelled';
/**
 * S-04: the buyer no longer picks this — Stripe's Payment Element does, and the webhook records
 * what Stripe reports. `unknown` is what an order carries until then; `truemoney` only appears on
 * orders paid before the Stripe migration.
 */
export type PaymentMethod = 'unknown' | 'promptpay' | 'credit_card' | 'other' | 'truemoney';
export type UserRole = 'buyer' | 'seller' | 'admin';

// ====== Sub-categorization (TpT-inspired) ======

export type GradeLevel =
  | 'kindergarten'
  | 'primary-early'  // ป.1-3
  | 'primary-late'   // ป.4-6
  | 'secondary-early' // ม.1-3
  | 'secondary-late'  // ม.4-6
  | 'university'
  | 'adult'
  | 'all-ages';

export type ResourceType =
  | 'lesson-summary'   // สรุปบทเรียน
  | 'worksheet'        // แบบฝึกหัด
  | 'lesson-plan'      // แผนการสอน
  | 'mind-map'         // Mindmap
  | 'flashcard'        // บัตรคำ
  | 'practice-test'    // ข้อสอบฝึก
  | 'template'         // เทมเพลต
  | 'presentation'     // พรีเซนเทชัน
  | 'cheat-sheet'      // ชีทสรุป
  | 'thesis'           // งานวิจัย/วิทยานิพนธ์
  | 'guide'            // คู่มือ
  | 'workbook'         // หนังสือฝึกหัด
  | 'bundle';          // แพ็กเกจ

export interface Subcategory {
  id: string;
  parentId: string;     // -> Category.id
  name: string;
  slug: string;
  icon?: string;
  documentCount: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  description: string;
  documentCount: number;
  /**
   * real-data-stats v1 §3.1: `CategoryResponse.subcategoryCount` — active subcategory count,
   * computed server-side (1 query, no N+1). `undefined` until `npm run generate:api` ships the
   * field on the generated type — callers must sum with `?? 0`, never treat `undefined` as `0`
   * outright (that would silently render "0 หมวดย่อย" as if it were a real, verified count).
   */
  subcategoryCount?: number;
  /**
   * real-data-stats v1 §3.2: `CategoryDetailResponse.averageRating` / `.reviewCount` — category
   * detail page only (the list endpoint never sends these). `undefined` means either "not wired
   * yet" (round 1) or "genuinely no reviews" (backend sends `null` for `averageRating` in that
   * case) — both cases hide the rating UI, never show "0 ★".
   */
  averageRating?: number;
  reviewCount?: number;
  // Hierarchical sub-categories
  subcategories?: Subcategory[];
}

/**
 * subcategory-admin-crud v1: admin-only shape for `SUBCATEGORY` (docs/contracts/subcategory-admin-crud.md §3.1).
 * Separate from {@link Subcategory} — that one backs the public catalog and never exposed
 * `isActive`/`sortOrder`, which would leak disabled subcategories to buyers if added there.
 */
export interface SubcategoryAdmin {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  icon: string;
  isActive: boolean;
  sortOrder: number;
  documentCount: number;
}

// ====== Seller ======

export interface Seller {
  id: string;
  studioName: string;
  ownerName: string;
  avatar: string;
  bio: string;
  banner?: string;       // Storefront banner image
  joinedAt: string;
  rating: number;
  totalSales: number;
  totalDocuments: number;
  followerCount: number;
  responseHours: number; // Average response time
  badges: string[];
  specialties?: string[]; // e.g. "คณิต ม.ปลาย", "Pitch Deck"
  // Custom store sections (for seller storefront)
  storeSections?: { id: string; name: string; documentIds: string[] }[];
}

// ====== Reviews & Q&A ======

export interface DocumentReview {
  id: string;
  buyerName: string;
  buyerAvatar: string;
  rating: number;
  comment: string;
  createdAt: string;
  verified: boolean;
  helpful?: number;
  sellerReply?: { text: string; createdAt: string };
}

export interface QnAItem {
  id: string;
  buyerName: string;
  buyerAvatar: string;
  question: string;
  askedAt: string;
  answer?: { text: string; answeredAt: string };
  /** document-faq-tab v1 §3.2: true when the seller pinned this (answered) question as FAQ. */
  isFaq: boolean;
  /**
   * document-faq-tab v1.1 §3.2: sort key for the FAQ tab, ascending, tie-broken by
   * `answeredAt` oldest-first — added to `DocumentQnaResponse` in v1.1 (v1 only had `isFaq`).
   */
  faqSortOrder: number;
}

/**
 * document-faq-tab v1 §3.3: `SellerQnaResponse` + 2 new fields — the seller Q&A inbox's own
 * domain shape (mapped from the SDK response, not read from it directly) so the page never binds
 * to `unknown | undefined` fields that vary release to release.
 */
export interface SellerQnaItem {
  id: string;
  documentId: string;
  documentTitle: string;
  buyerName: string;
  question: string;
  askedAt: string;
  answerText: string | null;
  answeredAt: string | null;
  isFaq: boolean;
  faqSortOrder: number;
}

// ====== Document ======

export interface DocumentItem {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  description: string;
  cover: string;
  gallery: string[];
  /**
   * Stable gallery row ids + URLs from seller API (edit/sync). Same order as `gallery` when set.
   * `imageStorageKey` (storage-key-persistence v1 §4.2) is the bare key that must round-trip back
   * into the update payload — `imageUrl` is resolved-URL, display-only.
   */
  gallerySlots?: { id: string; imageUrl: string; imageStorageKey: string }[];
  /** Total gallery images available (may exceed `gallery.length` on list views). */
  galleryCount?: number;
  price: number;            // 0 = Free
  originalPrice?: number;
  discountPercent?: number;
  format: FileFormat;
  pages: number;
  fileSize: string;
  language: 'th' | 'en';

  // Hierarchical taxonomy (TpT-inspired) — many-to-many categories.
  categoryIds: string[];
  subcategoryId?: string;
  gradeLevels: GradeLevel[];        // multi
  resourceType: ResourceType;
  standards?: string[];             // ['TGAT', 'A-Level', 'O-NET'] etc.

  tags: string[];
  rating: number;
  reviewCount: number;
  downloads: number;
  /** Paid/fulfilled order line items (not the same as download count). */
  salesCount?: number;
  status: DocumentStatus;
  watermarkEnabled: boolean;
  previewPages: number;
  /** Second line on raster preview watermark (optional). */
  previewWatermarkSubtitle?: string | null;
  /** Font family name for JPEG preview watermark. */
  previewWatermarkFontFamily?: string | null;
  /** R2/local key for watermarked preview PDF — use with /api/files/download. */
  previewStorageKey?: string | null;
  /** Main binaries for this listing (seller GET by id / listed-main-file PUT). */
  mainFiles?: {
    id: string;
    storageKey: string;
    originalFileName: string;
    uploadedAt: string;
    isListedForSale: boolean;
  }[];
  listedMainFileId?: string | null;
  seller: Seller;
  createdAt: string;
  updatedAt: string;
  reviews: DocumentReview[];
  qna?: QnAItem[];
  /**
   * document-faq-tab v1 §3.2/§4: from `MarketplaceDocumentDetailResponse.faqCount` /
   * `.qnaCount` — the FAQ tab's visibility + badge count must read these, not `qna.length`, so
   * the numbers stay correct if the backend ever truncates the array. Only `mapDocumentDetail`
   * populates them; list-view mappers (`mapDocument`, `mapSellerDocument`, …) leave them
   * `undefined` because they never carry a `qna` array to begin with.
   */
  faqCount?: number;
  qnaCount?: number;
  aiSummary?: string[];
  aiHighlights?: string[];

  // TpT-inspired flags
  isFree?: boolean;
  isBestseller?: boolean;
  isFeatured?: boolean;
  isEditorsPick?: boolean;
  // For bundles
  bundleDocumentIds?: string[];
}

// ====== Bundle ======

export interface Bundle {
  id: string;
  slug: string;
  title: string;
  description: string;
  cover: string;
  price: number;
  originalPrice: number;     // sum of items, used to show savings
  documentIds: string[];
  // document-bundle-cross-sell v1 §3.1: `BundleResponse.documentCount` — the paged bundle
  // endpoints only ever send a count, never the member document ids, so `documentIds` above
  // stays `[]` from `mapBundle`. This is the field the "N เอกสาร" pill should read.
  documentCount: number;
  seller: Seller;
  createdAt: string;
  rating: number;
  reviewCount: number;
  downloads: number;
}

// ====== Cart / Order / Library ======

export interface CartItem {
  document: DocumentItem;
  addedAt: string;
  fromBundleId?: string;
}

export interface OrderPaymentHints {
  stripePaymentIntentId?: string;
  /**
   * S-04: passed straight to Stripe.js to mount the Payment Element. Present only in the reply
   * to checkout — never stored, never logged, and absent when an unpaid order is read back.
   */
  clientSecret?: string;
  /** Stripe's PaymentIntent status at the moment the order was read. */
  status?: string;
  /** Always true while unpaid: the webhook is what fulfils, so the page waits rather than assumes. */
  awaitingWebhook?: boolean;
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  items: CartItem[];
  total: number;
  /** BUG-01: total excluding VAT, for the receipt. Prices are VAT-inclusive. */
  subtotal: number;
  /** BUG-01: VAT already contained in `total`. */
  vatAmount: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  paidAt?: string;
  paymentHints?: OrderPaymentHints;
}

export interface LibraryItem {
  document: DocumentItem;
  purchasedAt: string;
  orderNumber: string;
  downloadCount: number;
  lastDownloadAt?: string;
  isReviewed: boolean;
  myReviewId?: string;
  myRating?: number;
}

// ====== Loyalty points ======
// loyalty-points v1 §4 (docs/contracts/loyalty-points.md) — mirrors `LoyaltySummaryResponse` /
// `LoyaltyEntryResponse` exactly. `core/services/loyalty.service.ts` maps the generated SDK
// responses into these; `summary` stays `null` only until the first successful fetch (or on
// error), never as a stand-in for "not wired yet".

export interface LoyaltySummary {
  balance: number;
  earnedThisMonth: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  asOf: string;
}

export type LoyaltyEntryKind = 'earn' | 'redeem' | 'adjust';

export interface LoyaltyEntry {
  id: string;
  points: number;
  kind: LoyaltyEntryKind;
  reason: string;
  orderNumber?: string;
  occurredAt: string;
}

// ====== Saved payment methods (saved-credit-cards v1 §4) ======
// Mirrors `SavedPaymentMethodResponse` (docs/contracts/saved-credit-cards.md §3.2) exactly.
// `stripePaymentMethodId` is intentionally sent to the frontend — it is required to call
// `stripe.confirmCardPayment(clientSecret, { payment_method: id })` when paying with a saved
// card; knowing it alone is useless without a `clientSecret` for an order the caller owns.

export interface SavedPaymentMethod {
  id: string;
  stripePaymentMethodId: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  createdAt: string;
}

// ====== User ======

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  /** Highest-privilege label (admin > seller > buyer) — back-compat, kept as-is. */
  role: UserRole;
  /**
   * multi-role-permissions v1 §4: every role the user actually holds, e.g. `['buyer']`,
   * `['buyer','seller']`, `['buyer','admin']` — additive on top of `role`, not a replacement.
   * A seller keeps buying rights; an admin does not automatically gain seller rights.
   */
  roles: UserRole[];
  joinedAt: string;
}

// ====== Stats / Admin ======

export interface SellerStats {
  totalRevenue: number;
  monthlyRevenue: number;
  totalDownloads: number;
  monthlyDownloads: number;
  averageRating: number;
  totalReviews: number;
  pendingPayout: number;
  activeListings: number;
  pendingApproval: number;
  followerCount: number;
  newFollowersThisMonth: number;
  revenueByMonth: { month: string; amount: number }[];
  topCategories: { category: string; sales: number }[];
  /**
   * real-data-stats v1 §3.4: `SellerDashboardResponse.revenueTrendPercent` /
   * `.ratingTrendDelta` — `undefined` when the backend hasn't computed a baseline (previous
   * month revenue was 0 / no reviews before this month) **or** hasn't shipped the field yet
   * (round 1). Either way the trend badge must be hidden, never shown as "+0%"/"+0.00".
   */
  revenueTrendPercent?: number;
  ratingTrendDelta?: number;
}

// ====== Platform stats (real-data-stats v1 §3.3/§4.1) ======
// `GET /api/marketplace/stats` — public, anonymous. Single shared source for every page that
// used to hardcode "12k+ เอกสาร" / "3.2k ครีเอเตอร์" / "90% ส่วนแบ่งผู้ขาย" style copy.

export interface PlatformStats {
  totalApprovedDocuments: number;
  totalSellers: number;
  totalDownloads: number;
  reviewCount: number;
  /** `undefined` when `reviewCount === 0` (no baseline to average) — never `0`. */
  averageRating?: number;
  /** `undefined` when `reviewCount === 0` — never `0`. */
  positiveReviewPercent?: number;
  feeRatePercent: number;
}

export interface AdminTransaction {
  id: string;
  orderNumber: string;
  buyerName: string;
  sellerName: string;
  documentTitle: string;
  amount: number;
  fee: number;
  netAmount: number;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
}

// ====== Static label helpers ======

export const GRADE_LEVEL_LABELS: Record<GradeLevel, string> = {
  'kindergarten': 'อนุบาล',
  'primary-early': 'ป.1-3',
  'primary-late': 'ป.4-6',
  'secondary-early': 'ม.1-3',
  'secondary-late': 'ม.4-6',
  'university': 'มหาวิทยาลัย',
  'adult': 'ผู้ใหญ่ / ทำงาน',
  'all-ages': 'ทุกระดับ',
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  'lesson-summary': 'สรุปบทเรียน',
  'worksheet': 'แบบฝึกหัด',
  'lesson-plan': 'แผนการสอน',
  'mind-map': 'Mindmap',
  'flashcard': 'บัตรคำ',
  'practice-test': 'ข้อสอบฝึก',
  'template': 'เทมเพลต',
  'presentation': 'พรีเซนเทชัน',
  'cheat-sheet': 'ชีทสรุป',
  'thesis': 'งานวิจัย',
  'guide': 'คู่มือ',
  'workbook': 'หนังสือฝึกหัด',
  'bundle': 'แพ็กเกจ',
};

export const RESOURCE_TYPE_ICONS: Record<ResourceType, string> = {
  'lesson-summary': '📝',
  'worksheet': '✏️',
  'lesson-plan': '📋',
  'mind-map': '🧠',
  'flashcard': '🎴',
  'practice-test': '🎯',
  'template': '🎨',
  'presentation': '📊',
  'cheat-sheet': '📄',
  'thesis': '📚',
  'guide': '🗺️',
  'workbook': '📖',
  'bundle': '📦',
};

// ====== Announcement popup (announcement-popup v1, docs/contracts/announcement-popup.md §3.1/§4) ======
// Shared between the buyer-facing popup (`GET /api/announcements/active`) and the admin CRUD
// page (`/admin/announcements`) — both endpoints return the same `AnnouncementImageResponse` shape.

export interface AnnouncementImage {
  id: string;
  imageUrl: string;
  linkUrl: string | null;
  altText: string | null;
  sortOrder: number;
}

/** ฝั่ง buyer-facing — จาก GET /api/announcements/active */
export interface AnnouncementPopup {
  id: string;
  title: string;
  images: AnnouncementImage[];
}

/** ฝั่ง admin CRUD — announcement-popup v1 §3.1 */
export interface AnnouncementAdmin {
  id: string;
  title: string;
  isEnabled: boolean;
  startAt: string | null;
  endAt: string | null;
  sortOrder: number;
  images: AnnouncementImage[];
}

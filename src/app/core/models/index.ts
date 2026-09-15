// ============================================================
// SIRIEDUMARKET — Domain Models
// ============================================================

export type DocumentStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type FileFormat = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'zip';
/**
 * watermark-completion v1 §0.2/§3.4: how deeply a stamp can be embedded in this file format —
 * `raster` (PDF), `ooxml` (docx/pptx/xlsx), `repack` (zip, forensic only) or `none`.
 */
export type WatermarkCapability = 'raster' | 'ooxml' | 'repack' | 'none';
/** watermark-completion v1 §3.1: what the delivery pipeline actually did for one download. */
export type WatermarkMode = WatermarkCapability;
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
  /**
   * subscription-membership v2 §2/§3.1: `CategoryResponse.subscriptionMonthlyPrice` — monthly
   * subscription price for this category, VAT-inclusive (same convention as `DOCUMENT.Price`).
   * `null` = this category is not open for subscription yet — either an admin genuinely hasn't
   * set a price, **or** (round 1) the generated `CategoryResponse` type doesn't carry the field
   * yet. `mapCategory` reads it defensively either way, so this starts reflecting real prices
   * with no further model change once `npm run generate:api` ships the field for real.
   */
  subscriptionMonthlyPrice?: number | null;
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

// ====== Admin — seller directory (backend-wide-pagination-and-seller-directory v1) ======

/** Row shape for `/admin/sellers` — mirrors `AdminSellerResponse` 1:1, no placeholder fields. */
export interface AdminSellerRow {
  id: string;
  studioName: string;
  ownerName: string;
  email: string;
  avatarUrl: string | null;
  isVerified: boolean;
  totalDocuments: number;
  totalSales: number;
  totalRevenue: number;
  joinedAt: string;
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
  /** discount-urgency v1 §4 — detail-only, raw `DiscountExpiresAt`; frontend checks future-ness. */
  discountExpiresAt?: string;
  /** discount-urgency v1 §4 — detail-only social-proof count for the current UTC calendar month. */
  soldThisMonthCount?: number;
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
  /** seller-analytics-insights v1 §3.4: lifetime view count — seller-facing only, undefined for buyer-facing responses. */
  viewCount?: number;
  /** seller-analytics-insights v1 §3.4: `round(salesCount/viewCount*100, 1)`, `0` when viewCount is 0. */
  conversionRatePercent?: number;
  status: DocumentStatus;
  watermarkEnabled: boolean;
  previewPages: number;
  /** Second line on raster preview watermark (optional). */
  previewWatermarkSubtitle?: string | null;
  /** Font family name for JPEG preview watermark. */
  previewWatermarkFontFamily?: string | null;
  /** R2/local key for watermarked preview PDF — use with /api/files/download. */
  previewStorageKey?: string | null;
  /**
   * watermark-completion v1 §3.4: seller-facing watermark status, only ever populated by
   * `mapSellerDocument` (`SellerDocumentResponse`). Buyer-facing mappers leave them `undefined`
   * — the platform policy is not public information.
   */
  watermarkCapability?: WatermarkCapability;
  /** What will really happen on a buyer download (policy + capability + the seller toggle). */
  watermarkEffective?: boolean;
  /** `true` = the platform policy decides, so the seller's checkbox must be disabled (§4.3). */
  watermarkPolicyLocked?: boolean;
  /** Thai warning composed by the backend — never re-worded or re-derived in the UI (§4.3). */
  watermarkWarning?: string | null;
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

  /** AI-11: True if generated by system AI */
  isAutoGenerated?: boolean;
  /** AI-09: Risk level determined by prescreen ("Safe", "Warning", "HighRisk") */
  aiPrescreenRiskLevel?: string | null;
  /** AI-09: Prescreen risk flags */
  aiPrescreenFlags?: string[];
  aiPrescreenCheckedAt?: string | null;

  // TpT-inspired flags
  isFree?: boolean;
  isBestseller?: boolean;
  isFeatured?: boolean;
  isEditorsPick?: boolean;
  // For bundles
  bundleDocumentIds?: string[];

  /**
   * subscription-membership v2 §3.7: `MarketplaceDocumentDetailResponse.isAccessibleViaActiveSubscription`
   * — `true` only for a logged-in buyer with an `active` subscription covering one of this
   * document's categories. Detail-only (list/card responses never carry it) — only
   * `mapDocumentDetail` populates it, same as `faqCount`/`qnaCount` above. `undefined` until
   * `npm run generate:api` ships the field on the generated response type (round 1).
   */
  isAccessibleViaActiveSubscription?: boolean;
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
  discountAmount: number;
}

// ====== Order similar documents (order-similar-documents v1 §3.1/§4) ======
// Mirrors `OrderSimilarDocumentResponse` exactly (docs/contracts/order-similar-documents.md §3.1)
// — feeds the "เอกสารที่คล้ายกับคำสั่งซื้อนี้" section on `/orders/:id` only, and only while the
// order's status is `paid`/`fulfilled` (§4).

export interface OrderSimilarDocument {
  document: DocumentItem;
  reason: string;
  matchedDocumentId: string;
  matchedDocumentTitle: string;
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
  isRead: boolean;
  markedReadAt?: string;
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

// ====== Seller payout account (seller-payout-account-self-service v1 §3.1/§4) ======
// Mirrors `PayoutAccountResponse` (docs/contracts/seller-payout-account-self-service.md §3.1)
// exactly — `accountNumberMasked` is the only representation of the account number this app ever
// holds outside of a `reveal()` call, which is why the full number never lives in this model.
//
// payout-request-slip-verification v1 §3.13.2: `accountType`/`promptPayType`/`promptPayMasked`
// added to support PromptPay (phone / national ID) as an alternative to a bank account —
// `accountType` is `null` only when `hasAccount` is `false` (nothing saved yet).

export type PayoutAccountType = 'bank' | 'promptpay';
export type PromptPayIdType = 'phone' | 'national_id';

export interface PayoutAccount {
  hasAccount: boolean;
  accountType: PayoutAccountType | null;
  bankCode: string;
  accountHolderName: string;
  accountNumberMasked: string;
  promptPayType: PromptPayIdType | null;
  promptPayMasked: string;
  updatedAt: string;
}

// ====== Seller balance ledger (payout-request-slip-verification v1 §2.1-§2.3/§3.5) ======
// Mirrors `SellerBalanceEntryResponse` — one row of the seller's earnings ledger, the source of
// truth for `availableBalance` (§1.2 DEC-1). `kind` stays a bare `string` (not narrowed) the same
// way `PayoutResponse.status` does elsewhere in this app — the backend enum travels as a string
// and label lookup happens where it's displayed (§4.4).

export interface SellerBalanceEntry {
  id: string;
  /** `opening_balance` \| `order_earning` \| `subscription_share` \| `payout_hold` \| `payout_reversal` \| `adjustment` \| `order_refund` */
  kind: string;
  /** Signed — positive = money in, negative = money out. */
  amount: number;
  reason: string;
  sourceType: string | null;
  sourceId: string | null;
  note: string | null;
  occurredAt: string;
}

// ====== Payout e-slip verification (payout-request-slip-verification v1 §2.4/§3.7-§3.8) ======
// Mirrors `PayoutSlipResponse` — one uploaded e-Slip and its verification result against a payout.

export interface PayoutSlip {
  id: string;
  payoutId: string;
  provider: string;
  /** `pending` \| `matched` \| `mismatched` \| `provider_error` \| `duplicate` \| `manually_accepted` */
  verificationStatus: string;
  providerReference: string | null;
  parsedAmount: number | null;
  parsedTransferredAt: string | null;
  parsedReceiverNameMasked: string | null;
  parsedReceiverAccountLast4: string | null;
  parsedSenderBankCode: string | null;
  mismatchReasons: string[];
  providerErrorCode: string | null;
  providerErrorMessage: string | null;
  /** `/api/admin/payouts/{payoutId}/slips/{id}/file` — admin-only, never a raw R2 URL (§4.5). */
  fileUrl: string;
  uploadedAt: string;
  uploadedByName: string | null;
}

// ====== Subscription membership (subscription-membership v2 §3, §4) ======
// Mirrors `SubscriptionResponse` / `SubscriptionAccessHistoryItemResponse` /
// `AdminSubscriptionListItemResponse` exactly (docs/contracts/subscription-membership.md §3).
// Round 1 stub: `core/services/subscription.service.ts` maps these once
// `npm run generate:api` regenerates the SDK against a backend that ships this contract.

export type SubscriptionStatus = 'incomplete' | 'active' | 'past_due' | 'canceled';

/**
 * `SubscriptionResponse.paymentHints` — mirrors `OrderPaymentHints` above; only present right
 * after `POST /api/me/subscription` (`clientSecret` is never re-served from `GET`, same as
 * `OrderResponse.paymentHints.clientSecret`).
 */
export interface SubscriptionPaymentHints {
  stripeSubscriptionId: string;
  clientSecret: string | null;
  /** Stripe's PaymentIntent status at the moment the subscription was created/read. */
  status: string;
  awaitingWebhook: boolean;
}

export interface Subscription {
  id: string;
  status: SubscriptionStatus;
  categoryIds: string[];
  /** VAT-inclusive, sum of every selected category's `subscriptionMonthlyPrice`. Immutable for the lifetime of this subscription (§5 out-of-scope: no proration). */
  monthlyPrice: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  /** `true` after the buyer cancels — still `active`/`past_due` until `currentPeriodEnd`. */
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  paymentHints: SubscriptionPaymentHints | null;
}

/** `GET /api/me/subscription/access-history` (§3.6) row. */
export interface SubscriptionAccessHistoryItem {
  documentId: string;
  title: string;
  coverUrl: string;
  sellerName: string;
  firstAccessedAt: string;
  lastAccessedAt: string;
  accessCount: number;
  /** `true` only when the *current* subscription is `active` and still covers this document. */
  stillAccessible: boolean;
}

/** `GET /api/admin/subscriptions` (§3.2) row — admin read-only list. */
export interface AdminSubscriptionListItem {
  id: string;
  buyerName: string;
  buyerEmail: string;
  categoryIds: string[];
  status: SubscriptionStatus;
  monthlyPrice: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

/** ต้องตรงกับ canonical list ที่ contract ข้อ 2.1 เป๊ะ ๆ ทั้งจำนวนและสะกด */
export const THAI_BANKS: ReadonlyArray<{ code: string; name: string }> = [
  { code: 'BBL', name: 'ธนาคารกรุงเทพ' },
  { code: 'KBANK', name: 'ธนาคารกสิกรไทย' },
  { code: 'KTB', name: 'ธนาคารกรุงไทย' },
  { code: 'SCB', name: 'ธนาคารไทยพาณิชย์' },
  { code: 'BAY', name: 'ธนาคารกรุงศรีอยุธยา' },
  { code: 'TTB', name: 'ธนาคารทหารไทยธนชาต' },
  { code: 'CIMBT', name: 'ธนาคารซีไอเอ็มบีไทย' },
  { code: 'UOBT', name: 'ธนาคารยูโอบี' },
  { code: 'GSB', name: 'ธนาคารออมสิน' },
  { code: 'GHB', name: 'ธนาคารอาคารสงเคราะห์' },
  { code: 'BAAC', name: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร' },
  { code: 'KKP', name: 'ธนาคารเกียรตินาคินภัทร' },
  { code: 'TISCO', name: 'ธนาคารทิสโก้' },
  { code: 'LHBANK', name: 'ธนาคารแลนด์ แอนด์ เฮ้าส์' },
  { code: 'ICBCT', name: 'ธนาคารไอซีบีซี (ไทย)' },
  { code: 'SME', name: 'ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อมแห่งประเทศไทย' },
];

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
  onboardingCompletedAt: string | null;
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
  /**
   * store-readiness-score v1 §3.2/§4. Required per spec literal — `mapSellerStats`
   * (`core/api-mappers/mappers.ts`) now maps the real backend field (round 2, post-regen) and
   * always returns a value (falling back to `DEFAULT_STORE_READINESS` defensively if the backend
   * field is ever missing), so this never needs to be optional at the type level again.
   */
  storeReadiness: StoreReadiness;
  /**
   * seller-analytics-insights v1 §4. Required per spec literal — same reasoning as
   * `storeReadiness` above. `mapSellerStats` (`core/api-mappers/mappers.ts`) now maps the real
   * `d.insights` field via `mapSellerInsights` (round 2, post-regen), falling back to
   * `DEFAULT_SELLER_INSIGHTS` defensively if the backend field is ever missing.
   */
  insights: SellerInsights;
}

// ====== Store readiness (store-readiness-score v1 §3.2/§4) ======
// Mirrors `StoreReadinessResponse` / `StoreReadinessItemResponse`
// (docs/contracts/store-readiness-score.md §3.2) exactly — derived, real-time data computed
// inside `GET /api/seller/dashboard`, no schema/cache of its own.

export interface StoreReadinessItem {
  key: string;
  label: string;
  done: boolean;
  actionLabel: string;
  actionRoute: string;
  /** Only set for the `"listings"` item — `undefined` for `payout_account`/`profile_picture`. */
  currentCount?: number;
  /** Only set for the `"listings"` item — `undefined` for `payout_account`/`profile_picture`. */
  targetCount?: number;
}

export interface StoreReadiness {
  percentComplete: number;
  isComplete: boolean;
  items: StoreReadinessItem[];
  nextActionItemKey: string | null;
}

/**
 * store-readiness-score v1 §4: literal copy of the backend §3.3 constants. Used as:
 *  1. `SellerService._stats` initial signal value (before the first `refreshDashboard()` resolves), and
 *  2. the defensive fallback inside `mapStoreReadiness`/`mapSellerStats` (`core/api-mappers/mappers.ts`)
 *     if the backend ever omits `storeReadiness` from `SellerDashboardResponse`.
 * Must stay byte-for-byte identical to the backend literals — this is genuinely rendered on
 * screen during that window, not a throwaway placeholder.
 */
export const DEFAULT_STORE_READINESS: StoreReadiness = {
  percentComplete: 0,
  isComplete: false,
  items: [
    {
      key: 'payout_account',
      label: 'ตั้งค่าบัญชีรับเงิน',
      done: false,
      actionLabel: 'ตั้งค่าบัญชีรับเงิน',
      actionRoute: '/seller/settings',
    },
    {
      key: 'profile_picture',
      label: 'อัปโหลดรูปโปรไฟล์ร้าน',
      done: false,
      actionLabel: 'อัปโหลดรูปโปรไฟล์',
      actionRoute: '/seller/settings',
    },
    {
      key: 'listings',
      label: 'อัปโหลดเอกสารอย่างน้อย 3 ชิ้น',
      done: false,
      actionLabel: 'อัปโหลดเอกสาร',
      actionRoute: '/seller/upload',
      currentCount: 0,
      targetCount: 3,
    },
  ],
  nextActionItemKey: 'payout_account',
};

// ====== Seller insights (seller-analytics-insights v1 §3.2/§4) ======
// Mirrors `SellerInsightsResponse` / `SellerDocumentConversionItem` / `SellerSearchTermItem` /
// `SellerTrafficBreakdownResponse` (docs/contracts/seller-analytics-insights.md §3.2) — derived,
// real-time data computed inside `GET /api/seller/dashboard`, no schema/cache of its own here.

export interface SellerDocumentConversionItem {
  documentId: string;
  title: string;
  viewCount: number;
  salesCount: number;
  conversionRatePercent: number;
}

export interface SellerSearchTermItem {
  term: string;
  hitCount: number;
}

export interface SellerTrafficBreakdown {
  totalViews: number;
  searchViews: number;
  categoryViews: number;
  directViews: number;
  searchPercent: number;
  categoryPercent: number;
  directPercent: number;
}

export interface SellerInsights {
  documentConversions: SellerDocumentConversionItem[];
  topSearchTerms: SellerSearchTermItem[];
  trafficBreakdown: SellerTrafficBreakdown;
}

/**
 * seller-analytics-insights v1 §4: literal all-empty/all-zero shape. Used as:
 *  1. `SellerService._stats` initial signal value (before the first `refreshDashboard()` resolves), and
 *  2. the defensive fallback inside `mapSellerStats` (`core/api-mappers/mappers.ts`) if the
 *     backend ever omits `insights` from `SellerDashboardResponse`.
 * Every empty-state in `dashboard.page.html` (§4) renders correctly off this value.
 */
export const DEFAULT_SELLER_INSIGHTS: SellerInsights = {
  documentConversions: [],
  topSearchTerms: [],
  trafficBreakdown: {
    totalViews: 0,
    searchViews: 0,
    categoryViews: 0,
    directViews: 0,
    searchPercent: 0,
    categoryPercent: 0,
    directPercent: 0,
  },
};

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

// ====== Referral Program (referral-program v1, docs/contracts/referral-program.md §4) ======

export interface ReferralSummary {
  code: string;
  shareUrl: string;
  totalReferred: number;
  unusedCreditCount: number;
  unusedCreditTotal: number;
}

export interface ReferralCodeValidation {
  valid: boolean;
  discountAmount?: number;
  reasonText?: string;
}

// ====== Exam Hub Landing Pages (exam-hub-landing-pages v1, docs/contracts/exam-hub-landing-pages.md §4) ======

export type ExamHubType = 'tcas' | 'tgat-tpat' | 'a-level' | 'onet';

export interface ExamHubPage {
  examType: ExamHubType;
  title: string;
  metaDescription: string;
  introText: string;
  examDateInfo?: string;
  scoreCriteriaInfo?: string;
  trendInfo?: string;
  updatedAt?: string;
}

// ====== Seller pricing hint (seller-pricing-and-storefront-stats v1 §3.1/§4) ======
// Mirrors `DocumentPricingHintResponse` exactly. Local model — not a wrapper around a generated
// SDK type — kept as its own shape so `upload.page.ts` never binds to the raw generated response
// directly (`SellerService.getDocumentPricingHint` maps it here).

export interface DocumentPricingHint {
  sampleSize: number;
  minPrice: number | null;
  maxPrice: number | null;
  averagePrice: number | null;
}

// ====== Storefront sales chart (seller-pricing-and-storefront-stats v1 §3.3/§4) ======
// One point of `SellerProfileResponse.salesByMonth` — kept as its own model + signal
// (`CatalogService.sellerSalesByMonth`) instead of reading `SellerProfileResponse.salesByMonth`
// directly in the template, decoupling `storefront.page.ts` from the generated response shape.
// `unitsSold` is intentionally the only numeric field — no ฿ amount is ever modeled here
// (privacy decision, §1 of the contract).

export interface SellerSalesByMonthPoint {
  month: string;
  unitsSold: number;
}

// ====== LINE notification channel (line-notification-channel v1, docs/contracts/line-notification-channel.md §3.3) ======
// Mirrors `LineConnectionStatusResponse` exactly. `status` is a plain string, not an OpenAPI enum
// (§3.3 note — no schema in this system declares an enum, kept consistent on purpose).

export type LineConnectionStatusValue = 'NotConnected' | 'Connected' | 'Disconnected';

export interface LineConnectionStatus {
  isAvailable: boolean;
  isConnected: boolean;
  status: LineConnectionStatusValue;
  lineDisplayName: string | null;
  connectedAt: string | null;
}

// ====== Exam Countdown Mode (exam-countdown-mode v1, docs/contracts/exam-countdown-mode.md §4) ======
// Mirrors `ExamCountdownSettingResponse` exactly — `examType` is one of the 9 `Standard` presets
// already used by `DOCUMENT_STANDARD` (§0 การตัดสินใจที่ 1 ของ contract), reused as-is with no
// separate label mapping. `examDate` stays a raw `'yyyy-MM-dd'` string — `daysRemaining`/`isPast`
// are computed on the frontend only (`core/services/exam-countdown.service.ts`).

export type ExamCountdownExamType =
  | 'O-NET'
  | 'TGAT'
  | 'TPAT'
  | 'GAT'
  | 'PAT'
  | 'สสวท.'
  | 'A-Level'
  | 'IELTS'
  | 'TOEFL';

export const EXAM_COUNTDOWN_EXAM_TYPES: ExamCountdownExamType[] = [
  'O-NET',
  'TGAT',
  'TPAT',
  'GAT',
  'PAT',
  'สสวท.',
  'A-Level',
  'IELTS',
  'TOEFL',
];

export interface ExamCountdownSetting {
  examType: ExamCountdownExamType;
  examDate: string; // 'yyyy-MM-dd'
  isEnabled: boolean;
}

// ====== System Feedback (system-feedback v1 §3.0, §3.9) ======
export interface PagedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export type FeedbackType = 'bug' | 'suggestion' | 'usability' | 'other';
export type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'closed';
export type FeedbackRole = 'buyer' | 'seller';

export const FEEDBACK_TYPES: FeedbackType[] = ['bug', 'suggestion', 'usability', 'other'];
export const FEEDBACK_STATUSES: FeedbackStatus[] = ['new', 'in_progress', 'resolved', 'closed'];
export const FEEDBACK_ROLES: FeedbackRole[] = ['buyer', 'seller'];

export type {
  FeedbackAttachmentResponse,
  SubmitFeedbackRequest,
  MyFeedbackListItemResponse,
  MyFeedbackResponse,
  AdminFeedbackListItemResponse,
  AdminFeedbackDetailResponse,
  UpdateFeedbackStatusRequest,
} from '../api';

// ====== Admin User Management (admin-user-management v1 §3, §4.5) ======
export type AdminUserAccountStatus = 'active' | 'suspended' | 'banned';
export type AdminUserModerationActionType = 'suspend' | 'ban' | 'reinstate';
export type AdminUsersSort = 'newest' | 'oldest' | 'most_spent' | 'most_earned' | 'name_asc';

export interface AdminUsersQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  role?: string;
  status?: string;
  joinedFrom?: string;
  joinedTo?: string;
  sort?: AdminUsersSort;
}

/**
 * §3.1 `AdminUserListItemResponse`, mirrored 1:1 (§4.5: "ห้ามมี field ที่ backend ไม่มี").
 *
 * The round-1 stub carried `createdDate` and `lastLoginDate`; neither exists on the contract —
 * the registration timestamp is `joinedAt` (the same name `AdminSellerRow` uses) and there is no
 * last-login column at all.
 */
export interface AdminUserRow {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roles: string[];
  studioName: string | null;
  isEmailVerified: boolean;
  accountStatus: AdminUserAccountStatus;
  suspendedUntil: string | null;
  totalPurchaseAmount: number;
  totalOrderCount: number;
  totalSalesAmount: number;
  totalSalesCount: number;
  joinedAt: string;
}

export interface AdminUserPurchaseStats {
  totalPurchaseAmount: number;
  totalOrderCount: number;
  refundedAmount: number;
  refundedOrderCount: number;
  lastOrderAt: string | null;
}

export interface AdminUserSellerStats {
  studioName: string;
  isVerified: boolean;
  rating: number;
  totalDocuments: number;
  totalSalesCount: number;
  grossRevenue: number;
  lifetimeNetEarnings: number;
  pendingBalance: number;
}

export interface AdminUserModerationEntry {
  id: string;
  action: AdminUserModerationActionType;
  reason: string;
  messageToUser: string | null;
  suspendedUntil: string | null;
  previousStatus: AdminUserAccountStatus;
  performedByUserId: string | null;
  performedByName: string | null;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roles: string[];
  studioName: string | null;
  isEmailVerified: boolean;
  accountStatus: AdminUserAccountStatus;
  suspendedUntil: string | null;
  totalPurchaseAmount: number;
  totalOrderCount: number;
  accountStatusReason: string | null;
  accountStatusMessage: string | null;
  accountStatusChangedAt: string | null;
  accountStatusChangedBy: string | null;
  accountStatusChangedByName: string | null;
  isSeller: boolean;
  sellerApplicationStatus: string | null;
  purchaseStats: AdminUserPurchaseStats;
  sellerStats: AdminUserSellerStats | null;
  moderationHistory: AdminUserModerationEntry[];
  joinedAt: string;
}

export interface SuspendUserRequest {
  reason: string;
  until: string;
  messageToUser?: string | null;
}

export interface BanUserRequest {
  reason: string;
  messageToUser?: string | null;
}

export interface ReinstateUserRequest {
  reason: string;
  messageToUser?: string | null;
}

// crm-core v1 (docs/contracts/crm-core.md) — kept in its own file per the fe-1 build prompt
// (§6.5 scope), unlike every other model above.
export * from './crm.model';

// crm-driven-discovery v1 (docs/contracts/crm-driven-discovery.md) — kept in its own file, same
// reasoning as crm.model.ts above.
export * from './discovery.model';




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
export type PaymentMethod = 'promptpay' | 'credit_card' | 'truemoney';
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
  // Hierarchical sub-categories
  subcategories?: Subcategory[];
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
  price: number;            // 0 = Free
  originalPrice?: number;
  discountPercent?: number;
  format: FileFormat;
  pages: number;
  fileSize: string;
  language: 'th' | 'en';

  // Hierarchical taxonomy (TpT-inspired)
  categoryId: string;
  subcategoryId?: string;
  gradeLevels: GradeLevel[];        // multi
  resourceType: ResourceType;
  standards?: string[];             // ['TGAT', 'A-Level', 'O-NET'] etc.

  tags: string[];
  rating: number;
  reviewCount: number;
  downloads: number;
  status: DocumentStatus;
  watermarkEnabled: boolean;
  previewPages: number;
  seller: Seller;
  createdAt: string;
  updatedAt: string;
  reviews: DocumentReview[];
  qna?: QnAItem[];
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

export interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  createdAt: string;
  paidAt?: string;
}

export interface LibraryItem {
  document: DocumentItem;
  purchasedAt: string;
  orderNumber: string;
  downloadCount: number;
  lastDownloadAt?: string;
}

// ====== User ======

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
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

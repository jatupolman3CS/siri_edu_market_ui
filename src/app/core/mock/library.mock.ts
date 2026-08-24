import { LibraryItem, Order, AdminTransaction, SellerStats, User } from '../models';
import { MOCK_DOCUMENTS } from './documents.mock';

export const MOCK_USER: User = {
  id: 'user-current',
  name: 'พิชญา ภัทราวดี',
  email: 'pichaya@example.com',
  avatar:
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop&crop=face',
  role: 'buyer',
  joinedAt: '2025-09-12',
};

export const MOCK_LIBRARY: LibraryItem[] = [
  {
    document: MOCK_DOCUMENTS[0],
    purchasedAt: '2026-04-12T08:24:00Z',
    orderNumber: 'SE-2604-0124',
    downloadCount: 3,
    lastDownloadAt: '2026-05-01T10:32:00Z',
  },
  {
    document: MOCK_DOCUMENTS[3],
    purchasedAt: '2026-04-08T14:10:00Z',
    orderNumber: 'SE-2604-0098',
    downloadCount: 1,
    lastDownloadAt: '2026-04-09T09:15:00Z',
  },
  {
    document: MOCK_DOCUMENTS[6],
    purchasedAt: '2026-03-22T19:45:00Z',
    orderNumber: 'SE-2603-0084',
    downloadCount: 5,
    lastDownloadAt: '2026-04-28T22:01:00Z',
  },
  {
    document: MOCK_DOCUMENTS[10],
    purchasedAt: '2026-02-14T11:00:00Z',
    orderNumber: 'SE-2602-0056',
    downloadCount: 2,
    lastDownloadAt: '2026-03-12T17:42:00Z',
  },
];

export const MOCK_ORDERS: Order[] = [
  {
    id: 'ord-001',
    orderNumber: 'SE-2604-0124',
    buyerId: 'user-current',
    items: [{ document: MOCK_DOCUMENTS[0], addedAt: '2026-04-12T08:20:00Z' }],
    total: 199,
    subtotal: 185.98,
    vatAmount: 13.02,
    status: 'fulfilled',
    paymentMethod: 'promptpay',
    createdAt: '2026-04-12T08:20:00Z',
    paidAt: '2026-04-12T08:24:00Z',
  },
  {
    id: 'ord-002',
    orderNumber: 'SE-2604-0098',
    buyerId: 'user-current',
    items: [{ document: MOCK_DOCUMENTS[3], addedAt: '2026-04-08T14:08:00Z' }],
    total: 290,
    subtotal: 271.03,
    vatAmount: 18.97,
    status: 'fulfilled',
    paymentMethod: 'credit_card',
    createdAt: '2026-04-08T14:08:00Z',
    paidAt: '2026-04-08T14:10:00Z',
  },
  {
    id: 'ord-003',
    orderNumber: 'SE-2603-0084',
    buyerId: 'user-current',
    items: [{ document: MOCK_DOCUMENTS[6], addedAt: '2026-03-22T19:40:00Z' }],
    total: 249,
    subtotal: 232.71,
    vatAmount: 16.29,
    status: 'fulfilled',
    paymentMethod: 'promptpay',
    createdAt: '2026-03-22T19:40:00Z',
    paidAt: '2026-03-22T19:45:00Z',
  },
];

// Admin transactions
const buyerNames = ['พิชญา ภ.', 'นพรุจ ส.', 'ภัทรชนน อ.', 'อรอุมา ก.', 'ฐิตินันท์ ม.', 'จิรายุ ว.', 'ชวัลลักษณ์ น.', 'รชต ป.'];
const methods = ['promptpay', 'credit_card', 'truemoney'] as const;
const statuses = ['fulfilled', 'paid', 'awaiting_payment', 'refunded'] as const;

export const MOCK_TRANSACTIONS: AdminTransaction[] = Array.from(
  { length: 18 },
  (_, i) => {
    const doc = MOCK_DOCUMENTS[i % MOCK_DOCUMENTS.length];
    const status = statuses[i % statuses.length];
    const fee = Math.round(doc.price * 0.1);
    return {
      id: `txn-${String(i + 1).padStart(3, '0')}`,
      orderNumber: `SE-2604-${String(200 - i * 3).padStart(4, '0')}`,
      buyerName: buyerNames[i % buyerNames.length],
      sellerName: doc.seller.studioName,
      documentTitle: doc.title,
      amount: doc.price,
      fee,
      netAmount: doc.price - fee,
      paymentMethod: methods[i % methods.length],
      status,
      createdAt: new Date(2026, 4, 4 - (i % 14), 9 + (i % 8), i % 60).toISOString(),
    };
  },
);

// Seller stats
export const MOCK_SELLER_STATS: SellerStats = {
  totalRevenue: 184_520,
  monthlyRevenue: 38_240,
  totalDownloads: 4_286,
  monthlyDownloads: 612,
  averageRating: 4.86,
  totalReviews: 1_124,
  pendingPayout: 12_480,
  activeListings: 28,
  pendingApproval: 2,
  followerCount: 2_486,
  newFollowersThisMonth: 124,
  revenueByMonth: [
    { month: 'พ.ย.', amount: 22400 },
    { month: 'ธ.ค.', amount: 28100 },
    { month: 'ม.ค.', amount: 26800 },
    { month: 'ก.พ.', amount: 31500 },
    { month: 'มี.ค.', amount: 35200 },
    { month: 'เม.ย.', amount: 38240 },
  ],
  topCategories: [
    { category: 'การศึกษา', sales: 892 },
    { category: 'ดีไซน์ & เทมเพลต', sales: 524 },
    { category: 'ธุรกิจ', sales: 318 },
    { category: 'ภาษา', sales: 246 },
  ],
};

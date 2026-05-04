import { Bundle } from '../models';
import { MOCK_DOCUMENTS } from './documents.mock';
import { MOCK_SELLERS } from './sellers.mock';

interface BundleSeed {
  title: string;
  description: string;
  cover: string;
  price: number;
  documentIds: string[];
  sellerIdx: number;
  rating: number;
  reviewCount: number;
  downloads: number;
}

const SEEDS: BundleSeed[] = [
  {
    title: 'Mega Bundle เตรียมสอบเข้ามหาวิทยาลัย (ครบทุกวิชา)',
    description:
      'แพ็กเกจรวมเอกสารสรุปและข้อสอบฝึก ทุกวิชาที่ใช้ในสนามสอบ TGAT/A-Level/TPAT — ประหยัดกว่าซื้อแยกถึง 40%',
    cover: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=900&h=560&fit=crop',
    price: 590,
    documentIds: ['doc-001', 'doc-007'],
    sellerIdx: 0,
    rating: 4.92,
    reviewCount: 124,
    downloads: 412,
  },
  {
    title: 'Startup Founder Toolkit — 3 in 1',
    description:
      'ครบเซ็ตสำหรับสตาร์ทอัพ: Pitch Deck + Business Plan + Financial Model พร้อมเทมเพลต Marketing เพิ่มเติม',
    cover: 'https://images.unsplash.com/photo-1556761175-b413da4baf72?w=900&h=560&fit=crop',
    price: 890,
    documentIds: ['doc-002'],
    sellerIdx: 1,
    rating: 4.86,
    reviewCount: 64,
    downloads: 184,
  },
  {
    title: 'Designer Starter Kit — เทมเพลตครบรอบปี',
    description:
      '50 สไลด์พรีเซนต์ + Wedding Lookbook + Resume Pack — ครบทุกจังหวะของชีวิต',
    cover: 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=900&h=560&fit=crop',
    price: 990,
    documentIds: ['doc-004', 'doc-009', 'doc-014'],
    sellerIdx: 5,
    rating: 4.95,
    reviewCount: 96,
    downloads: 248,
  },
  {
    title: 'English Test Prep Pack — TOEIC + IELTS',
    description:
      'รวม Cheat Sheet TOEIC + Sample Essays IELTS — เตรียมสอบในที่เดียวจบ พร้อมเทคนิคสกัดเวลา',
    cover: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=900&h=560&fit=crop',
    price: 379,
    documentIds: ['doc-005', 'doc-011'],
    sellerIdx: 3,
    rating: 4.78,
    reviewCount: 88,
    downloads: 312,
  },
  {
    title: 'Backend Engineer Library — .NET + TS Patterns',
    description:
      'รวม Clean Architecture .NET + TypeScript Design Patterns — เอกสารชุดเดียวที่ทีมแบ็กเอนด์ต้องมี',
    cover: 'https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=900&h=560&fit=crop',
    price: 549,
    documentIds: ['doc-003', 'doc-008'],
    sellerIdx: 2,
    rating: 4.93,
    reviewCount: 56,
    downloads: 184,
  },
];

export const MOCK_BUNDLES: Bundle[] = SEEDS.map((s, i) => {
  const id = `bundle-${String(i + 1).padStart(3, '0')}`;
  const seller = MOCK_SELLERS[s.sellerIdx];
  const includedDocs = MOCK_DOCUMENTS.filter((d) => s.documentIds.includes(d.id));
  const originalPrice = includedDocs.reduce((sum, d) => sum + d.price, 0);

  return {
    id,
    slug: id,
    title: s.title,
    description: s.description,
    cover: s.cover,
    price: s.price,
    originalPrice: Math.max(originalPrice, s.price + 200),
    documentIds: s.documentIds,
    seller,
    createdAt: new Date(2026, 3, 20 - i * 4).toISOString(),
    rating: s.rating,
    reviewCount: s.reviewCount,
    downloads: s.downloads,
  };
});

import { Category, Subcategory } from '../models';

// ====== Subcategories per main category ======
const SUBCATS: Subcategory[] = [
  // Education (cat-edu)
  { id: 'sub-edu-kg',     parentId: 'cat-edu', name: 'อนุบาล',         slug: 'kindergarten',     icon: '🧸', documentCount: 24 },
  { id: 'sub-edu-pri',    parentId: 'cat-edu', name: 'ประถมศึกษา',      slug: 'primary',          icon: '🎒', documentCount: 56 },
  { id: 'sub-edu-sec1',   parentId: 'cat-edu', name: 'มัธยมต้น',        slug: 'secondary-early',  icon: '🏫', documentCount: 48 },
  { id: 'sub-edu-sec2',   parentId: 'cat-edu', name: 'มัธยมปลาย',       slug: 'secondary-late',   icon: '🎓', documentCount: 72 },
  { id: 'sub-edu-tgat',   parentId: 'cat-edu', name: 'TGAT / TPAT',     slug: 'tgat',             icon: '📝', documentCount: 18 },
  { id: 'sub-edu-alevel', parentId: 'cat-edu', name: 'A-Level',         slug: 'a-level',          icon: '🎯', documentCount: 22 },
  { id: 'sub-edu-onet',   parentId: 'cat-edu', name: 'O-NET',           slug: 'o-net',            icon: '📋', documentCount: 16 },
  { id: 'sub-edu-tutor',  parentId: 'cat-edu', name: 'ติวเตอร์ / ครูผู้สอน', slug: 'tutor',            icon: '👩‍🏫', documentCount: 32 },

  // Business (cat-biz)
  { id: 'sub-biz-pitch',  parentId: 'cat-biz', name: 'Pitch Deck',      slug: 'pitch-deck',       icon: '🚀', documentCount: 28 },
  { id: 'sub-biz-plan',   parentId: 'cat-biz', name: 'แผนธุรกิจ',         slug: 'business-plan',    icon: '📈', documentCount: 24 },
  { id: 'sub-biz-mkt',    parentId: 'cat-biz', name: 'การตลาด',          slug: 'marketing',        icon: '📣', documentCount: 32 },
  { id: 'sub-biz-fin',    parentId: 'cat-biz', name: 'การเงิน / Model',  slug: 'financial-model',  icon: '💹', documentCount: 18 },
  { id: 'sub-biz-hr',     parentId: 'cat-biz', name: 'HR / Hiring',     slug: 'hr',               icon: '🤝', documentCount: 14 },
  { id: 'sub-biz-ops',    parentId: 'cat-biz', name: 'การจัดการ',         slug: 'operations',       icon: '⚙️', documentCount: 16 },

  // IT (cat-it)
  { id: 'sub-it-web',     parentId: 'cat-it',  name: 'Web Development', slug: 'web',              icon: '🌐', documentCount: 28 },
  { id: 'sub-it-mobile',  parentId: 'cat-it',  name: 'Mobile',          slug: 'mobile',           icon: '📱', documentCount: 14 },
  { id: 'sub-it-cloud',   parentId: 'cat-it',  name: 'Cloud / DevOps',  slug: 'cloud-devops',     icon: '☁️', documentCount: 16 },
  { id: 'sub-it-data',    parentId: 'cat-it',  name: 'Data / AI / ML',  slug: 'data-ai',          icon: '🤖', documentCount: 18 },
  { id: 'sub-it-arch',    parentId: 'cat-it',  name: 'Architecture',    slug: 'architecture',     icon: '🏗️', documentCount: 12 },
  { id: 'sub-it-algo',    parentId: 'cat-it',  name: 'Algorithm / DSA', slug: 'algorithm',        icon: '🧮', documentCount: 8 },

  // Design (cat-design)
  { id: 'sub-dz-ppt',     parentId: 'cat-design', name: 'PowerPoint',      slug: 'powerpoint',     icon: '🎬', documentCount: 38 },
  { id: 'sub-dz-keynote', parentId: 'cat-design', name: 'Keynote',         slug: 'keynote',        icon: '🍎', documentCount: 14 },
  { id: 'sub-dz-resume',  parentId: 'cat-design', name: 'Resume / CV',     slug: 'resume',         icon: '📄', documentCount: 26 },
  { id: 'sub-dz-wedding', parentId: 'cat-design', name: 'Wedding',         slug: 'wedding',        icon: '💍', documentCount: 18 },
  { id: 'sub-dz-poster',  parentId: 'cat-design', name: 'Poster / Flyer',  slug: 'poster',         icon: '📰', documentCount: 22 },
  { id: 'sub-dz-social',  parentId: 'cat-design', name: 'Social Media',    slug: 'social-media',   icon: '📷', documentCount: 30 },
  { id: 'sub-dz-print',   parentId: 'cat-design', name: 'Printable / Planner', slug: 'printable',  icon: '🗓️', documentCount: 26 },

  // Research (cat-research)
  { id: 'sub-rs-thesis',  parentId: 'cat-research', name: 'วิทยานิพนธ์',   slug: 'thesis',         icon: '🎓', documentCount: 22 },
  { id: 'sub-rs-paper',   parentId: 'cat-research', name: 'งานวิจัย',     slug: 'paper',           icon: '📑', documentCount: 18 },
  { id: 'sub-rs-stats',   parentId: 'cat-research', name: 'สถิติ / SPSS', slug: 'statistics',      icon: '📊', documentCount: 14 },
  { id: 'sub-rs-ref',     parentId: 'cat-research', name: 'อ้างอิง / APA', slug: 'reference',      icon: '📚', documentCount: 10 },

  // Language (cat-lang)
  { id: 'sub-lang-toeic',  parentId: 'cat-lang', name: 'TOEIC',          slug: 'toeic',           icon: '🌐', documentCount: 22 },
  { id: 'sub-lang-ielts',  parentId: 'cat-lang', name: 'IELTS',          slug: 'ielts',           icon: '🇬🇧', documentCount: 18 },
  { id: 'sub-lang-toefl',  parentId: 'cat-lang', name: 'TOEFL',          slug: 'toefl',           icon: '🇺🇸', documentCount: 14 },
  { id: 'sub-lang-grammar',parentId: 'cat-lang', name: 'Grammar',        slug: 'grammar',         icon: '📝', documentCount: 16 },
  { id: 'sub-lang-vocab',  parentId: 'cat-lang', name: 'Vocabulary',     slug: 'vocabulary',      icon: '🔤', documentCount: 18 },

  // Finance (cat-finance)
  { id: 'sub-fin-stock',   parentId: 'cat-finance', name: 'หุ้น / Trading', slug: 'stock',         icon: '📈', documentCount: 14 },
  { id: 'sub-fin-fund',    parentId: 'cat-finance', name: 'กองทุน / RMF', slug: 'fund',            icon: '💼', documentCount: 12 },
  { id: 'sub-fin-tax',     parentId: 'cat-finance', name: 'ภาษี',           slug: 'tax',           icon: '🧾', documentCount: 8 },
  { id: 'sub-fin-acc',     parentId: 'cat-finance', name: 'บัญชี',           slug: 'accounting',    icon: '📒', documentCount: 18 },

  // Engineering (cat-engineer)
  { id: 'sub-eng-civ',     parentId: 'cat-engineer', name: 'โยธา',          slug: 'civil',         icon: '🏗️', documentCount: 12 },
  { id: 'sub-eng-elec',    parentId: 'cat-engineer', name: 'ไฟฟ้า',          slug: 'electrical',    icon: '⚡', documentCount: 10 },
  { id: 'sub-eng-mech',    parentId: 'cat-engineer', name: 'เครื่องกล',        slug: 'mechanical',    icon: '🔧', documentCount: 9 },
  { id: 'sub-eng-soft',    parentId: 'cat-engineer', name: 'ซอฟต์แวร์',         slug: 'software',      icon: '💻', documentCount: 10 },
];

// ====== Categories ======
export const MOCK_CATEGORIES: Category[] = [
  {
    id: 'cat-edu', name: 'การศึกษา', slug: 'education', icon: '🎓',
    color: 'from-pink-200 to-pink-50',
    description: 'สรุปบทเรียน ติวสอบ การบ้าน รายงาน',
    documentCount: 248,
  },
  {
    id: 'cat-biz', name: 'ธุรกิจ', slug: 'business', icon: '💼',
    color: 'from-rose-200 to-pink-50',
    description: 'แผนธุรกิจ พรีเซนเทชัน รายงานวิเคราะห์',
    documentCount: 132,
  },
  {
    id: 'cat-it', name: 'ไอที & โปรแกรมมิ่ง', slug: 'it', icon: '💻',
    color: 'from-fuchsia-200 to-pink-50',
    description: 'คู่มือเขียนโค้ด สถาปัตยกรรมระบบ',
    documentCount: 96,
  },
  {
    id: 'cat-design', name: 'ดีไซน์ & เทมเพลต', slug: 'design', icon: '🎨',
    color: 'from-amber-100 to-pink-50',
    description: 'พรีเซนเทชัน เทมเพลต ใบเสนอราคา',
    documentCount: 174,
  },
  {
    id: 'cat-research', name: 'งานวิจัย', slug: 'research', icon: '🔬',
    color: 'from-violet-200 to-pink-50',
    description: 'งานวิจัย วิทยานิพนธ์ บทความวิชาการ',
    documentCount: 64,
  },
  {
    id: 'cat-lang', name: 'ภาษา', slug: 'language', icon: '🗣️',
    color: 'from-sky-200 to-pink-50',
    description: 'สรุปไวยากรณ์ คำศัพท์ บทเรียนภาษา',
    documentCount: 88,
  },
  {
    id: 'cat-finance', name: 'การเงิน & ลงทุน', slug: 'finance', icon: '💰',
    color: 'from-emerald-200 to-pink-50',
    description: 'วิเคราะห์หุ้น แผนการเงิน บัญชี',
    documentCount: 52,
  },
  {
    id: 'cat-engineer', name: 'วิศวกรรม', slug: 'engineering', icon: '⚙️',
    color: 'from-orange-200 to-pink-50',
    description: 'แบบแปลน คำนวณโครงสร้าง รายงาน',
    documentCount: 41,
  },
].map((cat) => ({
  ...cat,
  subcategories: SUBCATS.filter((s) => s.parentId === cat.id),
}));

export const MOCK_SUBCATEGORIES = SUBCATS;

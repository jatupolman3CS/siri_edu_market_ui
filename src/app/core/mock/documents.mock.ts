import { DocumentItem, GradeLevel, QnAItem, ResourceType } from '../models';
import { MOCK_SELLERS } from './sellers.mock';

const COVERS = [
  'https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1532153975070-2e9ab71f1b14?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1497486751825-1233686d5d80?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1455390582262-044cdead277a?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1516979187457-637abb4f9353?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1517842645767-c639042777db?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&h=1000&fit=crop',
  'https://images.unsplash.com/photo-1471107340929-a87cd0f5b5f3?w=800&h=1000&fit=crop',
];

const REVIEW_AVATARS = [
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=120&h=120&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?w=120&h=120&fit=crop&crop=face',
  'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=120&h=120&fit=crop&crop=face',
];

function pickCover(i: number) {
  return COVERS[i % COVERS.length];
}

function makeReviews(seed: number) {
  const samples = [
    'อ่านง่าย จัดเลย์เอาต์สวย เข้าใจไว แนะนำสำหรับมือใหม่',
    'เนื้อหาแน่น คุ้มราคา จะกลับมาซื้อรอบหน้าแน่นอน',
    'ใช้สรุปก่อนสอบกลางภาค ได้คะแนนดีขึ้นจริง',
    'เทมเพลตสวยมาก ปรับเปลี่ยนได้ง่าย',
    'อยากให้มีตัวอย่างเยอะกว่านี้ แต่ภาพรวมก็ดีนะ',
    'เนื้อหาตรงปก ตามที่บรรยายเลย พอใจมาก',
    'เป็นคนสายต้องเห็นภาพ เล่มนี้ใช้กราฟิกดีมาก',
    'ติวเตอร์อธิบายเข้าใจง่าย เหมาะกับมือใหม่',
  ];
  const names = ['ปุณณ์', 'ฟ้า', 'ตี๋', 'นัท', 'มินนี่', 'ไอซ์', 'แตง', 'พี'];
  const count = 3 + (seed % 3);
  return Array.from({ length: count }, (_, i) => ({
    id: `rv-${seed}-${i}`,
    buyerName: names[(seed + i) % names.length],
    buyerAvatar: REVIEW_AVATARS[(seed + i) % REVIEW_AVATARS.length],
    rating: [5, 5, 4, 5, 4, 5][i % 6],
    comment: samples[(seed + i) % samples.length],
    createdAt: new Date(2026, 3, 15 - i * 3).toISOString(),
    verified: true,
    helpful: Math.floor(Math.random() * 24) + 1,
    sellerReply: i === 0 ? {
      text: 'ขอบคุณมากครับสำหรับรีวิวดีๆ หากต้องการเล่มอื่นๆ ในซีรีส์เดียวกัน ดูได้ในหน้าร้านนะครับ 🌸',
      createdAt: new Date(2026, 3, 14 - i * 3).toISOString(),
    } : undefined,
  }));
}

function makeQnA(seed: number): QnAItem[] {
  const samples: { q: string; a: string }[] = [
    {
      q: 'ไฟล์เป็น PDF ปริ้นได้ใช่ไหมครับ?',
      a: 'ได้ครับ ไฟล์ออกแบบเป็น A4 ปริ้นออกมาเหมือนหนังสือเลยครับ',
    },
    {
      q: 'ถ้าซื้อแล้วดาวน์โหลดได้กี่ครั้งคะ?',
      a: 'ดาวน์โหลดได้ไม่จำกัดครั้งจากคลังของคุณครับ ทุกไฟล์มีลายน้ำชื่อคุณกำกับ',
    },
    {
      q: 'มีตัวอย่างให้ดูก่อนซื้อไหมคะ?',
      a: 'มีครับ กดปุ่มพรีวิวดูได้ฟรี 5-10 หน้าก่อนตัดสินใจครับ',
    },
    {
      q: 'อัปเดตเนื้อหาเพิ่มไหม?',
      a: 'มีครับ ทุกๆ ภาคเรียนผมจะอัปเดตเนื้อหาให้ผู้ที่ซื้อแล้วโดยอัตโนมัติ',
    },
  ];
  const names = ['สมชาย', 'มาลี', 'พีท', 'อิ๋ว', 'แนน'];
  const count = (seed % 3) + 1;
  return Array.from({ length: count }, (_, i) => {
    const s = samples[(seed + i) % samples.length];
    return {
      id: `qna-${seed}-${i}`,
      buyerName: names[(seed + i) % names.length],
      buyerAvatar: REVIEW_AVATARS[(seed + i + 1) % REVIEW_AVATARS.length],
      question: s.q,
      askedAt: new Date(2026, 3, 12 - i * 4).toISOString(),
      answer: i % 2 === 0 ? {
        text: s.a,
        answeredAt: new Date(2026, 3, 11 - i * 4).toISOString(),
      } : undefined,
    };
  });
}

interface SeedDoc {
  title: string;
  shortDescription: string;
  description: string;
  price: number;
  originalPrice?: number;
  format: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'zip';
  pages: number;
  fileSize: string;
  language: 'th' | 'en';
  categoryId: string;
  subcategoryId: string;
  gradeLevels: GradeLevel[];
  resourceType: ResourceType;
  standards?: string[];
  tags: string[];
  rating: number;
  reviewCount: number;
  downloads: number;
  sellerIdx: number;
  isFree?: boolean;
  isBestseller?: boolean;
  isFeatured?: boolean;
  isEditorsPick?: boolean;
  aiSummary: string[];
}

const SEEDS: SeedDoc[] = [
  {
    title: 'สรุปคณิตม.ปลาย ครบ 6 บท ฉบับติวเข้ม',
    shortDescription: 'สรุปคณิต ม.4-6 ทั้งหมด พร้อมตัวอย่างโจทย์ 120 ข้อ',
    description:
      'ครอบคลุมเนื้อหาคณิตม.ปลาย 6 บทใหญ่ ตั้งแต่เซต ฟังก์ชัน ลำดับ-อนุกรม ตรีโกณมิติ พีชคณิตเชิงเส้น และแคลคูลัสเบื้องต้น พร้อมโจทย์ฝึก 120 ข้อ มีเฉลยละเอียด เหมาะใช้ทบทวนก่อนสอบ A-Level / TGAT',
    price: 199, originalPrice: 299,
    format: 'pdf', pages: 84, fileSize: '12.4 MB', language: 'th',
    categoryId: 'cat-edu', subcategoryId: 'sub-edu-alevel',
    gradeLevels: ['secondary-late'], resourceType: 'lesson-summary',
    standards: ['A-Level', 'TGAT', 'TPAT'],
    tags: ['คณิต', 'A-Level', 'ม.ปลาย', 'ติวเข้ม'],
    rating: 4.9, reviewCount: 248, downloads: 1842, sellerIdx: 0,
    isBestseller: true, isFeatured: true,
    aiSummary: [
      'ครอบคลุม 6 บทหลักของคณิตม.ปลาย: เซต ฟังก์ชัน ลำดับอนุกรม ตรีโกณ พีชคณิตเชิงเส้น และแคลคูลัสเบื้องต้น',
      'มีโจทย์ฝึก 120 ข้อพร้อมเฉลยละเอียดทุกข้อ จัดเรียงตามระดับความยาก',
      'จัดรูปแบบให้อ่านง่าย ใช้ทบทวนก่อนสอบ A-Level และ TGAT ได้ทันที',
    ],
  },
  {
    title: 'แผนธุรกิจ Startup Template (Pitch Deck พร้อม Financial Model)',
    shortDescription: 'เทมเพลตแผนธุรกิจ + Pitch Deck + Excel Model พร้อมใช้',
    description:
      'แพ็กเกจครบสำหรับสตาร์ทอัพ ประกอบด้วย: 1) Pitch Deck 12 สไลด์ 2) Business Plan template 30 หน้า 3) Financial Model ใน Excel คำนวณ 5 ปีล่วงหน้า ใช้กับ Y Combinator / 500 Global / VC ในไทยได้',
    price: 590, originalPrice: 890,
    format: 'zip', pages: 42, fileSize: '24.8 MB', language: 'th',
    categoryId: 'cat-biz', subcategoryId: 'sub-biz-pitch',
    gradeLevels: ['adult'], resourceType: 'template',
    tags: ['Startup', 'Pitch Deck', 'Business Plan', 'Excel'],
    rating: 4.8, reviewCount: 96, downloads: 524, sellerIdx: 1,
    isBestseller: true,
    aiSummary: [
      'แพ็กเกจครบ 3 ไฟล์: Pitch Deck 12 สไลด์, Business Plan 30 หน้า, Financial Model 5 ปี',
      'ออกแบบให้ใช้กับ VC / Accelerator ระดับ Y Combinator และ 500 Global ได้ทันที',
      'ไฟล์ Excel คำนวณ Cash Flow, Burn Rate, Break-even Point อัตโนมัติ',
    ],
  },
  {
    title: 'Clean Architecture .NET ฉบับใช้งานจริง',
    shortDescription: 'คู่มือ .NET 9 + Clean Architecture พร้อมโค้ดตัวอย่าง',
    description:
      'อธิบายแนวคิด Clean Architecture, DDD, CQRS พร้อมตัวอย่างโค้ด .NET 9 / EF Core 9 ใช้กับโปรเจกต์ขนาดกลาง-ใหญ่ มีไดอะแกรมและ Solution structure ที่ใช้ได้ทันที',
    price: 349,
    format: 'pdf', pages: 156, fileSize: '18.2 MB', language: 'th',
    categoryId: 'cat-it', subcategoryId: 'sub-it-arch',
    gradeLevels: ['adult'], resourceType: 'guide',
    tags: ['.NET', 'Clean Architecture', 'CQRS', 'DDD', 'EF Core'],
    rating: 4.95, reviewCount: 132, downloads: 712, sellerIdx: 2,
    isEditorsPick: true,
    aiSummary: [
      'อธิบาย Clean Architecture พร้อมตัวอย่างโค้ด .NET 9 + EF Core 9 ใช้งานได้จริง',
      'ครอบคลุม DDD, CQRS, Repository Pattern และ Dependency Injection',
      'มีไดอะแกรมและ Solution Structure พร้อม import เข้าโปรเจกต์ใหม่ได้ทันที',
    ],
  },
  {
    title: 'Pastel Presentation Templates 50 สไลด์',
    shortDescription: 'เทมเพลตพรีเซนต์โทนพาสเทล ปรับเองได้ใน PowerPoint',
    description:
      'เทมเพลต PowerPoint โทนพาสเทล 50 สไลด์ พร้อมไอคอน 80+ ดวง ฟอนต์ฟรีคอมเมอร์เชียล ครอบคลุม 5 หมวด: Pitch, Report, Education, Lookbook, Wedding ปรับสีเองได้',
    price: 290, originalPrice: 450,
    format: 'pptx', pages: 50, fileSize: '34.6 MB', language: 'th',
    categoryId: 'cat-design', subcategoryId: 'sub-dz-ppt',
    gradeLevels: ['all-ages'], resourceType: 'presentation',
    tags: ['PowerPoint', 'Template', 'Pastel', 'Pitch'],
    rating: 4.85, reviewCount: 318, downloads: 1246, sellerIdx: 5,
    isBestseller: true, isFeatured: true,
    aiSummary: [
      '50 สไลด์ครอบคลุม 5 หมวด: Pitch, Report, Education, Lookbook, Wedding',
      'มาพร้อมไอคอน 80+ ดวงและฟอนต์ฟรีคอมเมอร์เชียล',
      'ปรับสี-ฟอนต์ได้ใน PowerPoint ไม่ต้องใช้โปรแกรมอื่น',
    ],
  },
  {
    title: 'รวมไวยากรณ์ TOEIC สอบผ่านใน 7 วัน',
    shortDescription: 'สรุป Grammar TOEIC ครบทุกหัวข้อ พร้อม Practice Test 3 ชุด',
    description:
      'เน้นรูปประโยคและคำศัพท์ที่ออกสอบบ่อยที่สุดใน TOEIC Reading และ Listening รวบรวมเทคนิคสกัดเวลาในแต่ละ Part มี Practice Test 3 ชุดเสมือนจริง พร้อมเฉลยและคำอธิบาย',
    price: 159,
    format: 'pdf', pages: 96, fileSize: '14.2 MB', language: 'th',
    categoryId: 'cat-lang', subcategoryId: 'sub-lang-toeic',
    gradeLevels: ['adult', 'university'], resourceType: 'cheat-sheet',
    standards: ['TOEIC'],
    tags: ['TOEIC', 'English', 'Grammar', 'Practice Test'],
    rating: 4.7, reviewCount: 184, downloads: 1108, sellerIdx: 3,
    isBestseller: true,
    aiSummary: [
      'สรุปไวยากรณ์ TOEIC ครบทุกหัวข้อที่ออกสอบบ่อย พร้อมเทคนิคสกัดเวลาแต่ละ Part',
      'มี Practice Test 3 ชุดเสมือนจริง พร้อมเฉลยและคำอธิบายทุกข้อ',
      'จัดรูปแบบให้อ่านได้ภายใน 7 วัน เหมาะกับคนเตรียมสอบกระชั้น',
    ],
  },
  {
    title: 'Stock Analysis Template (DCF + ratio)',
    shortDescription: 'เทมเพลต Excel วิเคราะห์หุ้นพร้อม DCF และ ratio analysis',
    description:
      'เทมเพลต Excel สำหรับวิเคราะห์หุ้น มี Discounted Cash Flow Model, Valuation Multiples, ratio analysis (P/E, ROE, D/E), Sensitivity Analysis และ Dashboard สรุปผล',
    price: 459,
    format: 'xlsx', pages: 8, fileSize: '4.2 MB', language: 'th',
    categoryId: 'cat-finance', subcategoryId: 'sub-fin-stock',
    gradeLevels: ['adult'], resourceType: 'template',
    tags: ['Excel', 'DCF', 'Stock', 'Valuation'],
    rating: 4.6, reviewCount: 64, downloads: 248, sellerIdx: 4,
    aiSummary: [
      'เทมเพลตวิเคราะห์หุ้นใน Excel ครอบคลุม DCF, ratio analysis, sensitivity',
      'มี Dashboard สรุปผลและ Valuation Multiples (P/E, ROE, D/E)',
      'ใช้กับหุ้นไทยและหุ้นต่างประเทศได้ ปรับ assumption ได้ตามต้องการ',
    ],
  },
  {
    title: 'Mindmap วิทยาศาสตร์ ม.ต้น 3 เล่มจบ',
    shortDescription: 'Mindmap สรุปฟิสิกส์ เคมี ชีวะ ม.ต้น สีสันสวยอ่านง่าย',
    description:
      'รวบรวมเนื้อหาวิทยาศาสตร์ระดับม.ต้นทั้ง 3 สาขา ในรูปแบบ Mindmap ที่อ่านสนุก ใช้ทบทวนก่อนสอบ O-NET ได้ดี เหมาะกับเด็กม.1-ม.3',
    price: 249, originalPrice: 349,
    format: 'pdf', pages: 64, fileSize: '21.8 MB', language: 'th',
    categoryId: 'cat-edu', subcategoryId: 'sub-edu-sec1',
    gradeLevels: ['secondary-early'], resourceType: 'mind-map',
    standards: ['O-NET'],
    tags: ['ม.ต้น', 'Mindmap', 'O-NET', 'วิทยาศาสตร์'],
    rating: 4.8, reviewCount: 92, downloads: 412, sellerIdx: 1,
    isFeatured: true,
    aiSummary: [
      'Mindmap สรุปฟิสิกส์ เคมี ชีวะ ระดับม.ต้น ครบทั้ง 3 สาขา',
      'ใช้สีและภาพช่วยจำ เหมาะกับเด็กที่จำผ่านภาพได้ดี',
      'ครอบคลุมเนื้อหาที่ออกสอบ O-NET ม.3 ทั้งหมด',
    ],
  },
  {
    title: 'TypeScript Design Patterns 23 แบบ ฉบับเข้าใจไว',
    shortDescription: 'รวม Design Pattern 23 แบบใน TypeScript พร้อม use case',
    description:
      'อธิบาย Design Pattern คลาสสิก 23 แบบ (Creational, Structural, Behavioral) พร้อมโค้ดตัวอย่าง TypeScript และ use case จากโปรเจกต์จริง เหมาะกับนักพัฒนาทั้งมือใหม่และมือเก๋า',
    price: 299,
    format: 'pdf', pages: 124, fileSize: '16.4 MB', language: 'th',
    categoryId: 'cat-it', subcategoryId: 'sub-it-web',
    gradeLevels: ['adult'], resourceType: 'guide',
    tags: ['TypeScript', 'Design Pattern', 'OOP', 'Best Practice'],
    rating: 4.9, reviewCount: 76, downloads: 358, sellerIdx: 2,
    isEditorsPick: true,
    aiSummary: [
      '23 Design Patterns ครอบคลุม Creational, Structural, Behavioral',
      'โค้ดตัวอย่าง TypeScript ทุก pattern พร้อม use case จริง',
      'อ่านได้ในเวลา 1 สัปดาห์ เพิ่มทักษะการออกแบบโค้ดทันที',
    ],
  },
  {
    title: 'Wedding Lookbook Template (60 สไลด์)',
    shortDescription: 'เทมเพลตอัลบั้มงานแต่งสไตล์มินิมอล 60 หน้า',
    description:
      'เทมเพลต Adobe InDesign และ PowerPoint สำหรับทำ Lookbook งานแต่ง โทนสีพาสเทล 60 หน้า ครอบคลุมทุกช่วงเวลา ตั้งแต่ Pre-wedding ถึง After party',
    price: 690,
    format: 'zip', pages: 60, fileSize: '78.4 MB', language: 'th',
    categoryId: 'cat-design', subcategoryId: 'sub-dz-wedding',
    gradeLevels: ['adult'], resourceType: 'template',
    tags: ['Wedding', 'Lookbook', 'Pastel', 'InDesign'],
    rating: 4.95, reviewCount: 41, downloads: 184, sellerIdx: 5,
    isFeatured: true,
    aiSummary: [
      'เทมเพลต Lookbook งานแต่ง 60 หน้า โทนสีพาสเทลมินิมอล',
      'มีให้ทั้ง Adobe InDesign และ PowerPoint',
      'ครอบคลุมทุกช่วงเวลา Pre-wedding ถึง After party',
    ],
  },
  {
    title: 'Research Paper Template (Thai/Eng)',
    shortDescription: 'เทมเพลตงานวิจัยตามรูปแบบจุฬา/มศว/มหิดล',
    description:
      'เทมเพลต Word งานวิจัย ทั้งฉบับภาษาไทยและอังกฤษ ตามรูปแบบมหาวิทยาลัยชั้นนำ ครอบคลุมตั้งแต่บทคัดย่อ ถึงเอกสารอ้างอิง พร้อม Style guide',
    price: 199,
    format: 'docx', pages: 28, fileSize: '2.4 MB', language: 'th',
    categoryId: 'cat-research', subcategoryId: 'sub-rs-thesis',
    gradeLevels: ['university'], resourceType: 'template',
    tags: ['Research', 'Thesis', 'University', 'Word'],
    rating: 4.7, reviewCount: 124, downloads: 624, sellerIdx: 0,
    aiSummary: [
      'เทมเพลต Word งานวิจัย ทั้งภาษาไทยและภาษาอังกฤษ',
      'ตามรูปแบบมหาวิทยาลัยชั้นนำ จุฬาฯ มศว มหิดล',
      'ครอบคลุมตั้งแต่บทคัดย่อถึงเอกสารอ้างอิง พร้อม Style guide',
    ],
  },
  {
    title: 'IELTS Writing Task 2 Sample 50 essays',
    shortDescription: 'รวมเรียงความ IELTS Task 2 ระดับ 7.5+ จำนวน 50 ข้อ',
    description:
      'รวบรวมเรียงความ IELTS Writing Task 2 จำนวน 50 ข้อ ระดับ Band 7.5+ พร้อมโครงสร้าง วลี เด็ด และเทคนิคเขียน Cohesive Devices',
    price: 259,
    format: 'pdf', pages: 110, fileSize: '9.8 MB', language: 'en',
    categoryId: 'cat-lang', subcategoryId: 'sub-lang-ielts',
    gradeLevels: ['adult', 'university'], resourceType: 'practice-test',
    standards: ['IELTS'],
    tags: ['IELTS', 'Writing', 'English', 'Essay'],
    rating: 4.6, reviewCount: 88, downloads: 412, sellerIdx: 3,
    aiSummary: [
      '50 ตัวอย่างเรียงความ IELTS Writing Task 2 ระดับ Band 7.5+',
      'มีโครงสร้าง วลีเด็ด และเทคนิคเขียน Cohesive Devices',
      'เหมาะสำหรับผู้สอบ IELTS Academic และ General',
    ],
  },
  // ====== FREE RESOURCES ======
  {
    title: '🆓 Cheat Sheet สูตรคณิต ม.ปลาย (8 หน้า)',
    shortDescription: 'รวมสูตรคณิตม.ปลาย 8 หน้า ดาวน์โหลดฟรี',
    description:
      'ชีทรวมสูตรคณิตม.ปลาย 8 หน้า ครอบคลุมเซต ฟังก์ชัน ตรีโกณ ลำดับ-อนุกรม สถิติ และความน่าจะเป็น พกพาง่าย ปริ้นเก็บไว้ดูเล่นๆ ก่อนสอบ',
    price: 0,
    format: 'pdf', pages: 8, fileSize: '1.2 MB', language: 'th',
    categoryId: 'cat-edu', subcategoryId: 'sub-edu-sec2',
    gradeLevels: ['secondary-late'], resourceType: 'cheat-sheet',
    standards: ['A-Level', 'TGAT'],
    tags: ['ฟรี', 'คณิต', 'สูตร', 'ม.ปลาย'],
    rating: 4.9, reviewCount: 1024, downloads: 8240, sellerIdx: 0,
    isFree: true, isFeatured: true,
    aiSummary: [
      'ชีทสูตรคณิตม.ปลาย 8 หน้า ดาวน์โหลดฟรี',
      'ครอบคลุมเซต ฟังก์ชัน ตรีโกณ ลำดับอนุกรม สถิติ และความน่าจะเป็น',
      'จัดเรียงแบบกระชับ ปริ้น A4 พกได้สะดวก',
    ],
  },
  {
    title: '🆓 Resume Template ขั้นเทพ (Thai/Eng) 1 หน้า',
    shortDescription: 'เทมเพลต Resume 1 หน้าโทนมินิมอล ใช้งานได้ทันที',
    description:
      'เทมเพลต Resume แบบ 1 หน้า ครบทุกส่วนที่ HR ต้องการ ทั้งภาษาไทยและภาษาอังกฤษ มีเวอร์ชัน Word และ Canva — โหลดฟรี!',
    price: 0,
    format: 'docx', pages: 1, fileSize: '0.4 MB', language: 'th',
    categoryId: 'cat-design', subcategoryId: 'sub-dz-resume',
    gradeLevels: ['adult', 'university'], resourceType: 'template',
    tags: ['ฟรี', 'Resume', 'Job', 'CV'],
    rating: 4.85, reviewCount: 624, downloads: 5120, sellerIdx: 5,
    isFree: true, isBestseller: true,
    aiSummary: [
      'เทมเพลต Resume 1 หน้าใช้งานได้ทันที — ฟรี!',
      'มีทั้งเวอร์ชันภาษาไทยและภาษาอังกฤษ',
      'ครอบคลุมทุกส่วนที่ HR ต้องการ จัดเลย์เอาต์ตามเทรนด์ปัจจุบัน',
    ],
  },
  {
    title: '🆓 Pomodoro Planner ใช้ฟรีในกระดาษ A4',
    shortDescription: 'แพลนเนอร์ Pomodoro รายวัน ปริ้น A4 ฟรี',
    description:
      'แพลนเนอร์ Pomodoro แบบรายวัน — ปริ้นเก็บไว้แทร็ก work cycle ของคุณ ลายเส้นมินิมอล โทนพาสเทล',
    price: 0,
    format: 'pdf', pages: 1, fileSize: '0.2 MB', language: 'th',
    categoryId: 'cat-design', subcategoryId: 'sub-dz-print',
    gradeLevels: ['all-ages'], resourceType: 'template',
    tags: ['ฟรี', 'Planner', 'Productivity', 'Printable'],
    rating: 4.7, reviewCount: 218, downloads: 2812, sellerIdx: 5,
    isFree: true,
    aiSummary: [
      'แพลนเนอร์ Pomodoro รายวันแบบปริ้น A4',
      'ออกแบบสไตล์มินิมอล โทนพาสเทล',
      'ใช้แทร็กรอบทำงาน-พัก ได้สูงสุด 8 cycles ต่อวัน',
    ],
  },
];

export const MOCK_DOCUMENTS: DocumentItem[] = SEEDS.map((s, i) => {
  const id = `doc-${String(i + 1).padStart(3, '0')}`;
  const seller = MOCK_SELLERS[s.sellerIdx];
  const cover = pickCover(i);
  return {
    id,
    slug: id,
    title: s.title,
    shortDescription: s.shortDescription,
    description: s.description,
    cover,
    gallery: [cover, pickCover(i + 4), pickCover(i + 8)],
    price: s.price,
    originalPrice: s.originalPrice,
    discountPercent: s.originalPrice
      ? Math.round(((s.originalPrice - s.price) / s.originalPrice) * 100)
      : undefined,
    format: s.format,
    pages: s.pages,
    fileSize: s.fileSize,
    language: s.language,
    categoryIds: [s.categoryId],
    subcategoryId: s.subcategoryId,
    gradeLevels: s.gradeLevels,
    resourceType: s.resourceType,
    standards: s.standards,
    tags: s.tags,
    rating: s.rating,
    reviewCount: s.reviewCount,
    downloads: s.downloads,
    status: 'approved',
    watermarkEnabled: !s.isFree,
    previewPages: s.isFree ? s.pages : Math.max(3, Math.floor(s.pages * 0.1)),
    seller,
    createdAt: new Date(2026, 2, 12 - (i % 5)).toISOString(),
    updatedAt: new Date(2026, 4, 1 - (i % 4)).toISOString(),
    reviews: makeReviews(i),
    qna: makeQnA(i),
    aiSummary: s.aiSummary,
    aiHighlights: s.tags.slice(0, 4),
    isFree: s.isFree,
    isBestseller: s.isBestseller,
    isFeatured: s.isFeatured,
    isEditorsPick: s.isEditorsPick,
  };
});

// Pending docs (สำหรับ Admin Approval)
export const MOCK_PENDING_DOCUMENTS: DocumentItem[] = [
  {
    ...MOCK_DOCUMENTS[0],
    id: 'pending-001',
    slug: 'pending-001',
    title: 'สรุปฟิสิกส์ ม.ปลาย ครบทุกบท',
    shortDescription: 'สรุปฟิสิกส์ม.4-6 พร้อมสูตรและตัวอย่างโจทย์',
    status: 'pending',
    createdAt: new Date(2026, 4, 3).toISOString(),
    cover: COVERS[2],
  },
  {
    ...MOCK_DOCUMENTS[1],
    id: 'pending-002',
    slug: 'pending-002',
    title: 'Marketing Plan Template — ฉบับ SME',
    shortDescription: 'แผนการตลาดสำหรับธุรกิจ SME ใช้ได้ทันที',
    status: 'pending',
    createdAt: new Date(2026, 4, 2).toISOString(),
    cover: COVERS[5],
  },
  {
    ...MOCK_DOCUMENTS[3],
    id: 'pending-003',
    slug: 'pending-003',
    title: 'Resume Templates โทนพาสเทล 12 แบบ',
    shortDescription: 'เทมเพลต Resume สวยๆ พร้อมส่งสมัครงาน',
    status: 'pending',
    createdAt: new Date(2026, 4, 1).toISOString(),
    cover: COVERS[8],
  },
  {
    ...MOCK_DOCUMENTS[5],
    id: 'pending-004',
    slug: 'pending-004',
    title: 'Bond Investment Cheat Sheet',
    shortDescription: 'สรุปเรื่องการลงทุนตราสารหนี้สำหรับมือใหม่',
    status: 'pending',
    createdAt: new Date(2026, 3, 30).toISOString(),
    cover: COVERS[10],
  },
];

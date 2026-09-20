import fs from 'fs';
import path from 'path';

const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const buyerThObj = {
  becomeSeller: {
    alreadySellerTitle: 'คุณเป็นผู้ขายบน SIRIEDUMARKET อยู่แล้ว',
    alreadySellerDesc: 'คุณมีสิทธิ์สร้างผลงาน อัปโหลดเอกสาร และเข้าถึงแดชบอร์ดผู้ขายได้ทันที',
    goToDashboard: 'ไปที่แดชบอร์ด Siri Studio',
    pendingTitle: 'ใบสมัครของคุณกำลังรอทีมงานตรวจสอบ',
    pendingDesc: 'ทีมงานกำลังตรวจสอบข้อมูลการสมัครเปิดร้านของคุณ โดยปกติจะใช้เวลา 1-2 วันทำการ',
    rejectedTitle: 'ใบสมัครของคุณไม่ผ่านการอนุมัติ',
    rejectedReason: 'เหตุผล:',
    rejectedHint: 'คุณสามารถแก้ไขข้อมูลและส่งใบสมัครใหม่อีกครั้งได้เลย',
    studioNameLabel: 'ชื่อร้านค้า / สตูดิโอ',
    studioNamePlaceholder: 'เช่น ติวเตอร์พี่เป้ สรุปสอบครู',
    bioLabel: 'ประวัติและเกี่ยวกับร้านค้า (Bio)',
    bioPlaceholder: 'แนะนำตัว ประสบการณ์ และสไตล์เอกสารของคุณสั้นๆ',
    specialtiesLabel: 'ความถนัด / วิชาหลัก',
    specialtiesHint: 'เลือกวิชาที่คุณถนัดที่สุด 1-3 วิชา',
    specialtiesPlaceholder: 'เช่น คณิตศาสตร์ ม.ปลาย, ภาษาอังกฤษ TOEIC',
    studioNameRequired: 'กรุณากรอกชื่อร้านค้า',
    submitSuccess: 'ส่งใบสมัครเปิดร้านเรียบร้อยแล้ว ทีมงานจะแจ้งผลโดยเร็วที่สุด',
  },
  bundleDetail: {
    breadcrumbBundles: 'แพ็กเกจมัดรวม',
    itemsInBundle: 'เอกสารในแพ็กเกจ {count} รายการ',
    savingsBanner: 'ซื้อเป็นแพ็กเกจมัดรวม ประหยัดกว่าแยกซื้อถึง {amount} บาท!',
    itemsTitle: 'เอกสารทั้งหมดในแพ็กเกจนี้',
    backToBundles: 'กลับสู่รายการแพ็กเกจทั้งหมด',
  },
  product: {
    loginToFollow: 'กรุณาเข้าสู่ระบบเพื่อติดตามร้านค้า',
    cannotFollowOwn: 'ไม่สามารถติดตามร้านค้าของตนเองได้',
    loginToBuy: 'กรุณาเข้าสู่ระบบก่อนสั่งซื้อเอกสาร',
    loginToDownload: 'กรุณาเข้าสู่ระบบเพื่อดาวน์โหลดเอกสารฟรี',
    downloadError: 'เกิดข้อผิดพลาดในการดาวน์โหลดเอกสาร',
    questionTooShort: 'คำถามต้องมีความยาวอย่างน้อย 5 ตัวอักษร',
    questionSubmitted: 'ส่งคำถามถึงผู้ขายเรียบร้อยแล้ว',
    questionSubmitFailed: 'ส่งคำถามไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
  },
  home: {
    recentlyViewedEyebrow: 'ดูเสน่ห์ที่คุณเคยสนใจ',
    recentlyViewedTitle: 'เอกสารที่คุณดูล่าสุด',
    clearRecent: 'ล้างประวัติการดู',
    editorsPicksEyebrow: 'คัดสรรโดยทีมงาน SIRI EDUMARKET',
    editorsPicksTitle: 'เอกสารแนะนำประจำสัปดาห์',
    editorsPicksSubtitle: 'สรุปบทเรียนและข้อสอบคุณภาพสูง ได้รับคะแนนรีวิวดีเยี่ยมจากผู้เรียน',
  },
  storefront: {
    loadingTitle: 'กำลังโหลดหน้าร้านค้า…',
    loadingDesc: 'กรุณารอสักครู่ ระบบกำลังดึงข้อมูลร้านค้าและผลงาน',
    byOwner: 'เจ้าของร้าน:',
    followStore: 'ติดตามร้าน',
    safetyNotice: 'เอกสารทุกชิ้นรับประกันคุณภาพ ดาวน์โหลดได้ทันทีหลังชำระเงิน',
    statSales: 'ยอดขายสะสม',
    statRating: 'คะแนนเฉลี่ย',
    statFollowers: 'ผู้ติดตาม',
    statAvgResponse: 'ตอบกลับเฉลี่ย',
    emptyDocs: 'ร้านค้านี้ยังไม่มีเอกสารที่วางขายในขณะนี้',
    allStoreDocs: 'เอกสารทั้งหมดในร้าน',
    emptyBundles: 'ร้านค้านี้ยังไม่มีแพ็กเกจมัดรวม',
    emptyFree: 'ร้านค้านี้ยังไม่มีเอกสารฟรี',
    backToMarketplace: 'กลับสู่หน้าตลาดเอกสาร',
    tabBundles: 'แพ็กเกจมัดรวม',
    tabTop: 'ยอดนิยม',
    loginToFollow: 'กรุณาเข้าสู่ระบบก่อนกดติดตามร้านค้า',
    cannotFollowSelf: 'คุณเป็นเจ้าของร้านนี้ ไม่สามารถกดติดตามตนเองได้',
  },
  wallet: {
    topUpCreateFailed: 'ไม่สามารถสร้างรายการเติมเงินได้ กรุณาลองใหม่',
    paymentSystemLoadFailed: 'โหลดระบบชำระเงินไม่สำเร็จ กรุณาลองใหม่',
    stripeScriptFailed: 'ไม่สามารถโหลดระบบชำระเงิน Stripe ได้',
    stripeKeyNotConfigured: 'ระบบยังไม่ได้ตั้งค่าคีย์ชำระเงิน',
    topUpSuccess: 'เติมเงินเข้ากระเป๋าเรียบร้อยแล้ว',
    topUpProcessing: 'กำลังตรวจสอบการชำระเงิน…',
  },
};

const buyerEnObj = {
  becomeSeller: {
    alreadySellerTitle: 'You are already a seller on SIRIEDUMARKET',
    alreadySellerDesc: 'You can create content, upload documents, and access your creator studio dashboard immediately.',
    goToDashboard: 'Go to Siri Studio Dashboard',
    pendingTitle: 'Your application is under review',
    pendingDesc: 'Our team is reviewing your seller application. This usually takes 1-2 business days.',
    rejectedTitle: 'Your application was not approved',
    rejectedReason: 'Reason:',
    rejectedHint: 'You can update your store information and resubmit your application anytime.',
    studioNameLabel: 'Store / Studio Name',
    studioNamePlaceholder: 'e.g. Tutor Pae Math Exam Prep',
    bioLabel: 'Store Bio & About You',
    bioPlaceholder: 'Briefly introduce yourself, experience, and document study style.',
    specialtiesLabel: 'Specialty / Primary Subjects',
    specialtiesHint: 'Select 1-3 subjects you excel at.',
    specialtiesPlaceholder: 'e.g. High School Math, TOEIC English',
    studioNameRequired: 'Please enter a store name',
    submitSuccess: 'Seller application submitted successfully. We will notify you of the outcome shortly.',
  },
  bundleDetail: {
    breadcrumbBundles: 'Bundles',
    itemsInBundle: '{count} Documents in Bundle',
    savingsBanner: 'Save up to ฿{amount} when bought together as a bundle!',
    itemsTitle: 'All Documents Included in This Bundle',
    backToBundles: 'Back to All Bundles',
  },
  product: {
    loginToFollow: 'Please sign in to follow this store',
    cannotFollowOwn: 'You cannot follow your own store',
    loginToBuy: 'Please sign in to purchase this document',
    loginToDownload: 'Please sign in to download free documents',
    downloadError: 'An error occurred while downloading the document',
    questionTooShort: 'Question must be at least 5 characters long',
    questionSubmitted: 'Question sent to seller successfully',
    questionSubmitFailed: 'Failed to submit question. Please try again.',
  },
  home: {
    recentlyViewedEyebrow: 'Pick up where you left off',
    recentlyViewedTitle: 'Recently Viewed Documents',
    clearRecent: 'Clear History',
    editorsPicksEyebrow: 'Handpicked by SIRI EDUMARKET',
    editorsPicksTitle: 'Editor\'s Picks of the Week',
    editorsPicksSubtitle: 'High quality summaries and exams top-rated by active learners.',
  },
  storefront: {
    loadingTitle: 'Loading store page…',
    loadingDesc: 'Please wait while we retrieve store information and documents.',
    byOwner: 'Store Owner:',
    followStore: 'Follow Store',
    safetyNotice: 'Quality guaranteed documents. Instant download available after purchase.',
    statSales: 'Total Sales',
    statRating: 'Avg Rating',
    statFollowers: 'Followers',
    statAvgResponse: 'Avg Response',
    emptyDocs: 'This store has no active document listings currently.',
    allStoreDocs: 'All Documents in Store',
    emptyBundles: 'This store has no document bundles available.',
    emptyFree: 'This store has no free documents available.',
    backToMarketplace: 'Back to Marketplace',
    tabBundles: 'Bundles',
    tabTop: 'Top Hits',
    loginToFollow: 'Please sign in before following a store',
    cannotFollowSelf: 'You own this store and cannot follow yourself',
  },
  wallet: {
    topUpCreateFailed: 'Failed to create top-up order. Please try again.',
    paymentSystemLoadFailed: 'Failed to load payment system. Please try again.',
    stripeScriptFailed: 'Unable to load Stripe payment SDK',
    stripeKeyNotConfigured: 'Payment gateway public key is not configured',
    topUpSuccess: 'Wallet top-up completed successfully',
    topUpProcessing: 'Verifying payment status…',
  },
};

function appendTopLevelBlocks(filePath, obj) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Find the last closing brace "};" of the export object
  const lastBraceIdx = content.lastIndexOf('};');
  if (lastBraceIdx === -1) return;

  let appendStr = '\n';
  for (const [blockKey, blockVal] of Object.entries(obj)) {
    // Only append if blockKey does not already exist as a top-level block
    if (content.includes(`  ${blockKey}: {`)) continue;

    appendStr += `  ${blockKey}: {\n`;
    for (const [k, v] of Object.entries(blockVal)) {
      const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
      appendStr += `    ${k}: ${formattedVal},\n`;
    }
    appendStr += `  },\n`;
  }

  content = content.slice(0, lastBraceIdx) + appendStr + content.slice(lastBraceIdx);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Appended top-level blocks to ${filePath}`);
}

appendTopLevelBlocks(thFile, buyerThObj);
appendTopLevelBlocks(enFile, buyerEnObj);

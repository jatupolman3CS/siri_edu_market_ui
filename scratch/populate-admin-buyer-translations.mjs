import fs from 'fs';
import path from 'path';

const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const adminThEntries = {
  loadingFullDetails: 'กำลังโหลดรายละเอียดแบบเต็ม…',
  detailsToPublish: 'ข้อมูลสำหรับแสดงผลบนเว็บไซต์',
  listingCoverAndGallery: 'รูปปกและภาพตัวอย่างแกลเลอรี',
  sellingOriginalFile: 'ไฟล์ขายฉบับจริง (สำหรับผู้ซื้อดาวน์โหลด)',
  sellingFileNotice: 'ไฟล์ขายฉบับจริงจะถูกเข้ารหัสและส่งให้เฉพาะผู้ซื้อที่สั่งซื้อสำเร็จแล้วเท่านั้น',
  watermarkPolicyNotice: 'เอกสารตัวอย่าง (Preview) จะถูกประทับลายน้ำป้องกันการละเมิดลิขสิทธิ์โดยอัตโนมัติ',
  viewDocument: 'ดูเอกสาร',
  noMainFileStorageKey: 'ไม่พบรหัสเก็บไฟล์หลักในระบบ',
  allUploadedMainFiles: 'รายการไฟล์หลักที่เคยอัปโหลด',
  openView: 'เปิดดู',
  gradeLevelColon: 'ระดับชั้น:',
  standardExamColon: 'ข้อสอบมาตรฐาน:',
  detectedRiskFlags: 'รายการตรวจพบความเสี่ยง',
  selectDocToReviewTitle: 'เลือกเอกสารที่ต้องการตรวจสอบ',
  selectDocToReviewDesc: 'คลิกเลือกเอกสารจากรายการด้านซ้ายเพื่อดูรายละเอียดและอนุมัติการเผยแพร่',
  rejectWarningText: 'เมื่อปฏิเสธเอกสารแล้ว ระบบจะส่งอีเมลแจ้งเหตุผลไปยังผู้ขายเพื่อให้แก้ไขและส่งใหม่',
  confirmRejectBtn: 'ยืนยันปฏิเสธเอกสาร',
  backToCrmOverview: 'กลับสู่หน้าภาพรวม CRM',
  reportsModeration: 'รายงานและการตรวจสอบเนื้อหา',
  confirmDeleteAnnouncement: 'ยืนยันลบประกาศ "{title}" หรือไม่? การกระทำนี้ย้อนกลับไม่ได้',
  confirmDeleteCategory: 'ยืนยันลบหมวดหมู่ "{name}" หรือไม่?',
  confirmDeleteSubcategory: 'ยืนยันลบหมวดย่อย "{name}" หรือไม่? การกระทำนี้ย้อนกลับไม่ได้',
  confirmResetConfig: 'คืนค่าการตั้งค่าของ "{label}" กลับเป็นค่าเริ่มต้นของระบบหรือไม่?',
  errLoadReports: 'โหลดรายงานเอกสารไม่สำเร็จ',
  closeReportSuccess: 'ปิดรายงานเรียบร้อยแล้ว',
  errCloseReport: 'ปิดรายงานไม่สำเร็จ',
  errRefund: 'ดำเนินการคืนเงินไม่สำเร็จ',
  affiliatesSaveSuccess: 'บันทึกการตั้งค่าระบบแอฟฟิลิเอตสำเร็จ',
  affiliatesSaveFailed: 'บันทึกการตั้งค่าไม่สำเร็จ',

  // Dashboard & System Status
  dashboardTitle: 'ภาพรวมระบบ Admin Panel',
  dashboardSubtitle: 'สรุปยอดขาย ธุรกรรม การอนุมัติเอกสาร และสถานะระบบ SIRIEDUMARKET',
  statGmvMonth: 'ยอดขายรวมเดือนนี้ (GMV)',
  statPlatformFee: 'รายได้ค่าธรรมเนียมแพลตฟอร์ม',
  statSuccessfulTx: 'รายการสั่งซื้อสำเร็จ',
  statRefunds: 'รายการคืนเงิน',
  pendingDocsCardTitle: 'เอกสารรอตรวจสอบอนุมัติ',
  viewAllArrow: 'ดูทั้งหมด →',
  systemStatusTitle: 'สถานะระบบและบริการ',
  allServicesHealthy: 'บริการทั้งหมดทำงานปกติ',
  recentTransactionsTitle: 'ธุรกรรมล่าสุด',
  noDocsFound: 'ไม่พบเอกสารตามเงื่อนไขที่เลือก',

  // Admin Document Edit Modal
  mainInfo: 'ข้อมูลหลักเอกสาร',
  titleColon: 'ชื่อเอกสาร:',
  shortDescColon: 'คำอธิบายสั้น:',
  descriptionColon: 'รายละเอียดฉบับเต็ม:',
  categoriesMultiple: 'หมวดหมู่หลัก (เลือกได้หลายหมวด)',
  subcategoryOptional: 'หมวดย่อย (ไม่บังคับ)',
  resourceType: 'ประเภททรัพยากร / ชนิดเอกสาร',
  thaiLanguageOption: 'ภาษาไทย',
  removeTagAria: 'ลบแท็ก',
  tagInputPlaceholder: 'เพิ่มแท็กแล้วกด Enter',
  addTagBtn: 'เพิ่มแท็ก',
  extraGradeLevelsLabel: 'ระดับชั้นเพิ่มเติม',
  extraGradeLevelsPlaceholder: 'เช่น ป.4, ม.2',
  standardExamLabel: 'สนามสอบมาตรฐานหลัก',
  extraStandardsLabel: 'สนามสอบมาตรฐานเพิ่มเติม',
  filesAndStorage: 'ไฟล์และการจัดเก็บ',
  galleryUploadDesc: 'รูปปกและแกลเลอรีตัวอย่าง',
  noImagesPlaceholder: 'ยังไม่มีรูปภาพตัวอย่าง',
  mainDocFile: 'ไฟล์เอกสารหลัก (สำหรับขาย)',
  uploadMainFile: 'อัปโหลดไฟล์หลักใหม่',
  openDownloadFile: 'เปิดดาวน์โหลดไฟล์',
  noFileToDownload: 'ยังไม่มีไฟล์หลักในระบบ',
  storageKeyPlaceholder: 'Storage key รหัสไฟล์ในระบบ',
  previewFile: 'ไฟล์พรีวิวตัวอย่าง',
  uploadPreview: 'อัปโหลดไฟล์พรีวิว',
  orPasteKeySelf: 'หรือระบุรหัส Storage key เอง',
  previewPages: 'จำนวนหน้าพรีวิวฟรี',
};

const adminEnEntries = {
  loadingFullDetails: 'Loading full details…',
  detailsToPublish: 'Public Listing Information',
  listingCoverAndGallery: 'Cover Image & Gallery Previews',
  sellingOriginalFile: 'Original Document File (Buyer Download)',
  sellingFileNotice: 'The original file is encrypted and accessible only to buyers who completed purchase.',
  watermarkPolicyNotice: 'Preview files are automatically stamped with copyright protection watermarks.',
  viewDocument: 'View Document',
  noMainFileStorageKey: 'No main file storage key found',
  allUploadedMainFiles: 'Uploaded Main File History',
  openView: 'Open View',
  gradeLevelColon: 'Grade Level:',
  standardExamColon: 'Standard Exam:',
  detectedRiskFlags: 'Detected Risk Flags',
  selectDocToReviewTitle: 'Select Document to Review',
  selectDocToReviewDesc: 'Click a document from the left list to review details and approve publication.',
  rejectWarningText: 'Upon rejection, an email will be sent to the seller with feedback to fix and resubmit.',
  confirmRejectBtn: 'Confirm Document Rejection',
  backToCrmOverview: 'Back to CRM Overview',
  reportsModeration: 'Reports & Content Moderation',
  confirmDeleteAnnouncement: 'Are you sure you want to delete announcement "{title}"? This action cannot be undone.',
  confirmDeleteCategory: 'Are you sure you want to delete category "{name}"?',
  confirmDeleteSubcategory: 'Are you sure you want to delete subcategory "{name}"? This action cannot be undone.',
  confirmResetConfig: 'Reset configuration for "{label}" back to system default?',
  errLoadReports: 'Failed to load document reports',
  closeReportSuccess: 'Report closed successfully',
  errCloseReport: 'Failed to close report',
  errRefund: 'Failed to process refund',
  affiliatesSaveSuccess: 'Affiliate settings saved successfully',
  affiliatesSaveFailed: 'Failed to save affiliate settings',

  // Dashboard & System Status
  dashboardTitle: 'Admin Panel Overview',
  dashboardSubtitle: 'Summary of sales, transactions, document approvals, and system health on SIRIEDUMARKET',
  statGmvMonth: 'Monthly Sales Volume (GMV)',
  statPlatformFee: 'Platform Fee Revenue',
  statSuccessfulTx: 'Successful Orders',
  statRefunds: 'Refunded Transactions',
  pendingDocsCardTitle: 'Documents Awaiting Approval',
  viewAllArrow: 'View All →',
  systemStatusTitle: 'System & Services Status',
  allServicesHealthy: 'All services running normally',
  recentTransactionsTitle: 'Recent Transactions',
  noDocsFound: 'No documents match the filter criteria',

  // Admin Document Edit Modal
  mainInfo: 'Main Document Information',
  titleColon: 'Title:',
  shortDescColon: 'Short Description:',
  descriptionColon: 'Full Description:',
  categoriesMultiple: 'Main Categories (Multiple)',
  subcategoryOptional: 'Subcategory (Optional)',
  resourceType: 'Resource Type',
  thaiLanguageOption: 'Thai',
  removeTagAria: 'Remove tag',
  tagInputPlaceholder: 'Add tag and press Enter',
  addTagBtn: 'Add Tag',
  extraGradeLevelsLabel: 'Additional Grade Levels',
  extraGradeLevelsPlaceholder: 'e.g. Grade 4, Grade 8',
  standardExamLabel: 'Primary Standard Exam',
  extraStandardsLabel: 'Additional Standard Exams',
  filesAndStorage: 'Files & Storage',
  galleryUploadDesc: 'Cover & Gallery Preview Images',
  noImagesPlaceholder: 'No preview images uploaded',
  mainDocFile: 'Main Document File (For Sale)',
  uploadMainFile: 'Upload New Main File',
  openDownloadFile: 'Download Main File',
  noFileToDownload: 'No main file in storage',
  storageKeyPlaceholder: 'Storage Key in Cloud System',
  previewFile: 'Sample Preview File',
  uploadPreview: 'Upload Preview File',
  orPasteKeySelf: 'Or enter Storage Key manually',
  previewPages: 'Free Preview Pages',
};

const buyerThEntries = {
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

const buyerEnEntries = {
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

function injectAdminAndBuyer(filePath, adminObj, buyerObj) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Insert into admin: { ... }
  const adminMatch = content.match(/admin:\s*\{/);
  if (adminMatch) {
    const insertIdx = adminMatch.index + adminMatch[0].length;
    let newAdminStr = '\n';
    for (const [k, v] of Object.entries(adminObj)) {
      const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
      newAdminStr += `    ${k}: ${formattedVal},\n`;
    }
    content = content.slice(0, insertIdx) + newAdminStr + content.slice(insertIdx);
  }

  // Insert top-level buyer sections (becomeSeller, bundleDetail, product, home, storefront, wallet)
  for (const [sectionKey, sectionObj] of Object.entries(buyerObj)) {
    const sectionMatch = content.match(new RegExp(`${sectionKey}:\\s*\\{`));
    if (sectionMatch) {
      const insertIdx = sectionMatch.index + sectionMatch[0].length;
      let newSectionStr = '\n';
      for (const [k, v] of Object.entries(sectionObj)) {
        const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
        newSectionStr += `    ${k}: ${formattedVal},\n`;
      }
      content = content.slice(0, insertIdx) + newSectionStr + content.slice(insertIdx);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Injected Admin & Buyer translations into ${filePath}`);
}

injectAdminAndBuyer(thFile, adminThEntries, buyerThEntries);
injectAdminAndBuyer(enFile, adminEnEntries, buyerEnEntries);

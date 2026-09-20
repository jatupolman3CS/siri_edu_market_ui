import fs from 'fs';
import path from 'path';

const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

let thContent = fs.readFileSync(thFile, 'utf8');
let enContent = fs.readFileSync(enFile, 'utf8');

const sellerThEntries = {
  // Statuses & General
  noWithdrawBalance: 'ไม่พบยอดเงินที่สามารถถอนได้',
  calcPerMonthNet: 'คำนวณจากยอดขายสุทธิของร้านค้าในแต่ละเดือน',
  viewsCol: 'ยอดเข้าชม',
  trafficSearch: 'ค้นหาบนเว็บ',
  trafficCategory: 'หมวดหมู่เอกสาร',
  trafficDirect: 'ลิงก์ตรง / โซเชียล',
  statusApproved: 'อนุมัติแล้ว',
  statusDraft: 'ร่าง',
  searchDocsPlaceholder: 'ค้นหาเอกสารของคุณ…',
  noDocsFilterEmpty: 'ไม่พบเอกสารตามเงื่อนไขที่เลือก',
  viewAria: 'ดูเอกสาร',
  editAria: 'แก้ไขเอกสาร',
  watermarkAria: 'จัดการลายน้ำ',
  deleteAria: 'ลบเอกสาร',

  // Q&A
  qnaTitle: 'คำถามจากผู้ซื้อ',
  qnaSubtitle: 'ตอบคำถามและข้อสงสัยจากผู้ซื้อเพื่อเพิ่มโอกาสในการขาย',
  showAll: 'แสดงทั้งหมด',
  unansweredOnly: 'เฉพาะยังไม่ได้ตอบ',
  noQuestions: 'ยังไม่มีคำถามจากผู้ซื้อ',
  statusUnanswered: 'ยังไม่ได้ตอบ',
  statusAnswered: 'ตอบแล้ว',
  yourAnswer: 'คำตอบของคุณ',
  yourAnswerDesc: 'คำตอบจะแสดงในหน้าเอกสารเพื่อให้ผู้ซื้อท่านอื่นเห็นด้วย',
  aiDrafting: 'กำลังสร้างร่างคำตอบ…',
  aiDraftBtn: 'AI ช่วยร่างคำตอบ',
  answerPlaceholder: 'พิมพ์คำตอบของคุณที่นี่…',
  submitAnswer: 'ส่งคำตอบ',
  editAnswer: 'แก้ไขคำตอบ',
  pinFaq: 'ปักหมุด FAQ',
  pleaseEnterReply: 'กรุณากรอกคำตอบ',
  replySuccess: 'ตอบคำถามเรียบร้อยแล้ว',
  replyFailed: 'ไม่สามารถส่งคำตอบได้ กรุณาลองใหม่',
  savingDots: 'กำลังบันทึก…',

  // Reviews
  reviewedDoc: 'เอกสารที่รีวิว:',
  viewDoc: 'ดูเอกสาร',
  sellerReply: 'การตอบกลับจากผู้ขาย',
  editReplyTitle: 'แก้ไขคำตอบกลับ',
  replyBuyerTitle: 'ตอบกลับรีวิวจากคุณ {name}',
  buyerWillBeNotified: 'ผู้ซื้อจะได้รับการแจ้งเตือนเมื่อคุณตอบกลับ',
  replySubmitting: 'กำลังส่งคำตอบ…',
  saveEditReply: 'บันทึกการแก้ไข',
  sendReply: 'ส่งการตอบกลับ',
  replyCta: 'ตอบกลับรีวิว',
  pleaseEnterReplyReview: 'กรุณากรอกข้อความตอบกลับ',

  // Bundles
  editBundle: 'แก้ไขแพ็กเกจ',
  bundleTitleLabel: 'ชื่อแพ็กเกจ',
  bundleTitlePlaceholder: 'เช่น สรุปวิทยาศาสตร์ ม.ปลาย ครบชุด 3 เล่ม',
  bundleDescLabel: 'รายละเอียดแพ็กเกจ',
  bundleDescPlaceholder: 'อธิบายรายละเอียดของแพ็กเกจ และสิทธิประโยชน์ที่ผู้ซื้อจะได้รับ',
  selectDocs: 'เลือกเอกสารในแพ็กเกจ',
  selectedDocsRequirement: 'เลือกอย่างน้อย 2 เอกสารเพื่อสร้างแพ็กเกจ',
  bundlePrice: 'ราคาแพ็กเกจ (บาท)',
  coverOptional: 'รูปปกแพ็กเกจ (ไม่บังคับ)',
  coverPlaceholder: 'URL รูปภาพ หรืออัปโหลดรูปปก',
  totalOriginalPrice: 'รวมราคาเต็ม:',
  buyerSaves: 'ประหยัดได้:',
  noBundles: 'ยังไม่มีแพ็กเกจ',
  noBundlesDesc: 'สร้างแพ็กเกจมัดรวมเอกสารเพื่อเพิ่มยอดขายและให้ส่วนลดแก่ผู้ซื้อ',
  cannotDeleteTooltip: 'ไม่สามารถลบแพ็กเกจนี้ได้',
  cannotDeleteDesc: 'แพ็กเกจถูกซื้อไปแล้ว ไม่สามารถลบได้เพื่อรักษาสิทธิ์ของผู้ซื้อ',
  noSalesYet: 'ยังไม่มียอดขาย',
  noSalesYetDesc: 'เมื่อมีผู้ซื้อเอกสาร สถิติจะแสดงที่นี่',

  // Settings
  settingsDesc: 'จัดการข้อมูลและตั้งค่าร้านค้าของคุณบน SIRIEDUMARKET',
  shopNameFromSystem: 'ชื่อร้านค้าดึงจากโปรไฟล์บัญชีของคุณ',

  // Upload & Edit Document Flow
  docLoadFailed: 'โหลดข้อมูลเอกสารไม่สำเร็จ',
  serverUploadSuccess: 'อัปโหลดไฟล์เรียบร้อยแล้ว',
  sellingFileChanged: 'เปลี่ยนไฟล์เอกสารขายเรียบร้อย',
  sellingFileSet: 'ตั้งค่าไฟล์เอกสารขายเรียบร้อย',
  uploadImageFailed: 'อัปโหลดรูปภาพไม่สำเร็จ: ',
  uploadImagesSuccess: 'อัปโหลดรูปภาพตัวอย่างเรียบร้อย',
  uploadImagesPartialFail: 'อัปโหลดสำเร็จบางส่วน (ล้มเหลว {count} ภาพ)',
  aiPrefillFailed: 'AI ไม่สามารถวิเคราะห์ข้อมูลเอกสารได้ในขณะนี้',
  aiFallbackShortDesc: 'สรุปเนื้อหาสำคัญสำหรับทบทวนและเตรียมสอบ',
  aiFallbackFullDesc: 'เอกสารคุณภาพสูง รวบรวมเนื้อหาสำคัญ ไฮไลท์จุดออกสอบบ่อย เหมาะสำหรับอ่านทบทวนก่อนสอบ',
  aiWritingSuccess: 'AI ช่วยเขียนข้อความเรียบร้อยแล้ว',
  requireCoverImage: 'กรุณาอัปโหลดรูปปกเอกสารอย่างน้อย 1 รูป',
  requireFieldsError: 'กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน',
  saveWatermarkConfigFailed: 'บันทึกการตั้งค่าลายน้ำไม่สำเร็จ',
  saveDocSuccess: 'บันทึกข้อมูลเอกสารเรียบร้อยแล้ว',
  requireDocFileError: 'กรุณาอัปโหลดไฟล์เอกสารหลักก่อนส่งตรวจสอบ',
  docSubmitSuccess: 'ส่งเอกสารเข้าระบบตรวจสอบเรียบร้อยแล้ว',
  uploadCoverManual: 'อัปโหลดรูปปกเอง',
  generateCoverAuto: 'สร้างปกอัตโนมัติจากหน้าแรก',
  autoCoverTooltip: 'ระบบจะสร้างปกให้อัตโนมัติจากหน้าแรกของเอกสารหลัก',
  useFirstPageAutoCover: 'ใช้รูปหน้าแรกเป็นปกอัตโนมัติ',
  useFirstPageAutoCoverDesc: 'ระบบจะดึงหน้าแรกของเอกสารที่คุณอัปโหลดมาใช้เป็นรูปปกหน้าร้านโดยอัตโนมัติ',
  uploadingImages: 'กำลังอัปโหลดรูปภาพ…',
  orderIndex: 'ลำดับ',
  deleteTitle: 'ลบ',
  clickToSelectImages: 'คลิกหรือลากรูปภาพมาวางที่นี่เพื่ออัปโหลด',
  pageCountPlaceholder: 'ระบุจำนวนหน้า',
  mainFileSizeNotice: 'รองรับไฟล์ PDF, ZIP ขนาดไม่เกิน 100MB',
  docInfoStepTitle: 'ข้อมูลเอกสาร',
  fillDetailsForSales: 'กรอกรายละเอียดเอกสารเพื่อช่วยให้ผู้ซื้อค้นพบและตัดสินใจซื้อได้ง่ายขึ้น',
  aiAutoFillBoxTitle: 'AI ช่วยเติมข้อมูลเอกสาร',
  aiAutoFillBoxDesc: 'ให้ AI วิเคราะห์เนื้อหาจากไฟล์เอกสารเพื่อสร้างชื่อ คำอธิบาย หมวดหมู่ และแท็กให้อัตโนมัติ',
  aiAnalyzing: 'AI กำลังวิเคราะห์เนื้อหา…',
  aiPrefillBtn: 'ให้ AI ช่วยวิเคราะห์และเติมข้อมูล',
  docTitleLabel: 'ชื่อเอกสาร',
  docTitlePlaceholder: 'เช่น สรุปชีววิทยา ม.5 เทอม 1 เรื่อง ระบบประสาท',
  shortDescLabel: 'คำอธิบายสั้น (แสดงในหน้าการ์ด)',
  shortDescPlaceholder: 'สรุปจุดเด่นของเอกสารสั้นๆ 1-2 ประโยค',
  fullDescLabel: 'รายละเอียดเอกสารฉบับเต็ม',
  fullDescPlaceholder: 'อธิบายรายละเอียด สารบัญ ตัวอย่างเนื้อหา และสิ่งที่ผู้ซื้อจะได้รับอย่างละเอียด',
  aiWriteBtn: 'AI เขียนคำอธิบาย',
  aiExpandBtn: 'AI ขยายรายละเอียด',
  selectMultipleCategories: 'เลือกหมวดหมู่หลักและหมวดหมู่ย่อย',
  selectCategoryPlaceholder: 'เลือกหมวดหมู่',
  langThai: 'ภาษาไทย',
  tagsLabel: 'แท็ก / คีย์เวิร์ด',
  tagsPlaceholder: 'พิมพ์แท็กแล้วกด Enter',
  freeDocLabel: 'ตั้งเป็นเอกสารฟรี (฿0)',
  zeroEarningsDesc: 'เอกสารฟรีจะไม่มีรายได้ แต่ช่วยเพิ่มยอดดาวน์โหลดและผู้ติดตามร้าน',
  originalPriceLabel: 'ราคาเต็มก่อนลด (บาท)',
  loadingCompetitorHint: 'กำลังโหลดข้อมูลเปรียบเทียบราคา…',
  updateFileModalTitle: 'อัปเดตไฟล์เอกสาร',
  updateSummaryLabel: 'สรุปการเปลี่ยนแปลง (Changelog)',
  versionHistoryModalTitle: 'ประวัติเวอร์ชันเอกสาร',
  versionNumberLabel: 'เวอร์ชัน {version}',

  // Watermark Editor
  loadingWatermarkSettings: 'กำลังโหลดการตั้งค่าลายน้ำ…',
  backToDocList: 'กลับสู่รายการเอกสาร',
  savingWatermark: 'กำลังบันทึกลายน้ำ…',
  watermarkTemplateSystem: 'ระบบลายน้ำป้องกันการละเมิดลิขสิทธิ์',
  shopTemplateWatermarkDesc: 'ตั้งค่ารูปแบบลายน้ำที่จะประทับลงในเอกสาร preview และเอกสารดาวน์โหลดของคุณ',
  goToUploadNewDoc: 'อัปโหลดเอกสารใหม่',
  watermarkTextPlaceholder: 'กรอกข้อความลายน้ำ เช่น ชื่อร้าน หรือ SIRIEDUMARKET',
  savingTemplate: 'กำลังบันทึกเทมเพลต…',
  saveWatermarkTemplate: 'บันทึกเทมเพลตลายน้ำ',
  templateWatermarkNotice: 'การเปลี่ยนแปลงจะมีผลกับเอกสารทั้งหมดที่ใช้เทมเพลตนี้',
  livePreviewPageAlt: 'ตัวอย่างหน้าเอกสารจริง',
  page1: 'หน้า 1',
  personalizedSubtitle: 'ลายน้ำระบุตัวตนผู้ซื้อแบบไดนามิก',
  downloadPosition: 'ตำแหน่งลายน้ำดาวน์โหลด',
  stampTemplate: 'รูปแบบข้อความประทับตรา',
  clickToInsertVar: 'คลิกเพื่อแทรกตัวแปรไดนามิก:',
  varBuyerEmail: '{email} - อีเมลผู้ซื้อ',
  varForensicToken: '{token} - รหัสติดตาม',
  varDownloadDate: '{date} - วันที่ดาวน์โหลด',
  varPlatform: '{platform} - ชื่อแพลตฟอร์ม',
  downloadTextPlaceholder: 'ตัวอย่าง: ดาวน์โหลดโดย {email} | {token}',
  watermarkFont: 'ฟอนต์ลายน้ำ',
  savePersonalizedSettings: 'บันทึกการตั้งค่า ลายน้ำดาวน์โหลด',
  buyerSimulator: 'จำลองข้อมูลผู้ซื้อ',
  buyerSimulatorDesc: 'ทดสอบแสดงผลข้อความลายน้ำตามข้อมูลจำลองของผู้ซื้อ',
  simBuyerEmail: 'อีเมลผู้ซื้อจำลอง',
  simForensicToken: 'รหัสติดตามจำลอง',
  stampedTextPreview: 'ข้อความที่จะแสดงบนเอกสารจริง:',
  realDocPreview: 'ตัวอย่างจริงบนเว็บไซต์',
  docPreviewWatermarkAlt: 'ตัวอย่างเอกสารพร้อมลายน้ำ',
  defaultPersonalizedText: 'ดาวน์โหลดโดย {email} | รหัส: {token}',
  saveTemplateSuccess: 'บันทึกลายน้ำเรียบร้อยแล้ว',
  saveTemplateFailed: 'บันทึกลายน้ำไม่สำเร็จ กรุณาลองใหม่',
};

const sellerEnEntries = {
  // Statuses & General
  noWithdrawBalance: 'No withdrawable balance found',
  calcPerMonthNet: 'Calculated from the store\'s monthly net sales',
  viewsCol: 'Views',
  trafficSearch: 'Web Search',
  trafficCategory: 'Categories',
  trafficDirect: 'Direct Link / Social',
  statusApproved: 'Approved',
  statusDraft: 'Draft',
  searchDocsPlaceholder: 'Search your documents…',
  noDocsFilterEmpty: 'No documents match the selected filters',
  viewAria: 'View document',
  editAria: 'Edit document',
  watermarkAria: 'Manage watermark',
  deleteAria: 'Delete document',

  // Q&A
  qnaTitle: 'Buyer Questions',
  qnaSubtitle: 'Answer questions from buyers to build trust and boost sales',
  showAll: 'Show All',
  unansweredOnly: 'Unanswered Only',
  noQuestions: 'No questions from buyers yet',
  statusUnanswered: 'Unanswered',
  statusAnswered: 'Answered',
  yourAnswer: 'Your Answer',
  yourAnswerDesc: 'Answers will be displayed on the document page for other buyers to see.',
  aiDrafting: 'Generating AI draft answer…',
  aiDraftBtn: 'AI Draft Answer',
  answerPlaceholder: 'Type your answer here…',
  submitAnswer: 'Submit Answer',
  editAnswer: 'Edit Answer',
  pinFaq: 'Pin to FAQ',
  pleaseEnterReply: 'Please enter an answer',
  replySuccess: 'Answer submitted successfully',
  replyFailed: 'Failed to submit answer. Please try again.',
  savingDots: 'Saving…',

  // Reviews
  reviewedDoc: 'Reviewed Document:',
  viewDoc: 'View Document',
  sellerReply: 'Seller Response',
  editReplyTitle: 'Edit Seller Response',
  replyBuyerTitle: 'Reply to review from {name}',
  buyerWillBeNotified: 'The buyer will be notified when you reply.',
  replySubmitting: 'Submitting reply…',
  saveEditReply: 'Save Changes',
  sendReply: 'Send Reply',
  replyCta: 'Reply to Review',
  pleaseEnterReplyReview: 'Please enter a reply message',

  // Bundles
  editBundle: 'Edit Bundle',
  bundleTitleLabel: 'Bundle Title',
  bundleTitlePlaceholder: 'e.g. Complete High School Biology Summary 3 Volumes',
  bundleDescLabel: 'Bundle Description',
  bundleDescPlaceholder: 'Describe the bundle content and benefits for buyers.',
  selectDocs: 'Select Documents in Bundle',
  selectedDocsRequirement: 'Select at least 2 documents to create a bundle.',
  bundlePrice: 'Bundle Price (THB)',
  coverOptional: 'Bundle Cover Image (Optional)',
  coverPlaceholder: 'Image URL or upload cover image',
  totalOriginalPrice: 'Total Original Price:',
  buyerSaves: 'Buyer Saves:',
  noBundles: 'No Bundles Yet',
  noBundlesDesc: 'Create document bundles to increase sales and offer discounts to buyers.',
  cannotDeleteTooltip: 'Cannot delete this bundle',
  cannotDeleteDesc: 'This bundle has already been purchased and cannot be deleted to protect buyer access.',
  noSalesYet: 'No Sales Yet',
  noSalesYetDesc: 'When buyers purchase your document, sales statistics will appear here.',

  // Settings
  settingsDesc: 'Manage your store details and preferences on SIRIEDUMARKET',
  shopNameFromSystem: 'Store name is synchronized from your user account profile',

  // Upload & Edit Document Flow
  docLoadFailed: 'Failed to load document information',
  serverUploadSuccess: 'File uploaded successfully',
  sellingFileChanged: 'Updated selling document file successfully',
  sellingFileSet: 'Set selling document file successfully',
  uploadImageFailed: 'Failed to upload image: ',
  uploadImagesSuccess: 'Preview images uploaded successfully',
  uploadImagesPartialFail: 'Partial upload success ({count} images failed)',
  aiPrefillFailed: 'AI analysis is currently unavailable',
  aiFallbackShortDesc: 'Key summary points for study review and exam preparation',
  aiFallbackFullDesc: 'High quality document covering essential exam topics with key takeaways highlighted.',
  aiWritingSuccess: 'AI generation complete',
  requireCoverImage: 'Please upload at least 1 cover image',
  requireFieldsError: 'Please complete all required fields',
  saveWatermarkConfigFailed: 'Failed to save watermark settings',
  saveDocSuccess: 'Document saved successfully',
  requireDocFileError: 'Please upload the main document file before submitting',
  docSubmitSuccess: 'Document submitted for review successfully',
  uploadCoverManual: 'Upload Cover Image',
  generateCoverAuto: 'Auto Cover from 1st Page',
  autoCoverTooltip: 'Automatically render cover image from the document\'s first page',
  useFirstPageAutoCover: 'Use First Page as Auto Cover',
  useFirstPageAutoCoverDesc: 'The system will render the first page of your uploaded document as the cover.',
  uploadingImages: 'Uploading images…',
  orderIndex: 'Order',
  deleteTitle: 'Delete',
  clickToSelectImages: 'Click or drag images here to upload',
  pageCountPlaceholder: 'Specify total pages',
  mainFileSizeNotice: 'Supports PDF, ZIP files up to 100MB',
  docInfoStepTitle: 'Document Information',
  fillDetailsForSales: 'Provide clear document details to help buyers find and purchase your document easily',
  aiAutoFillBoxTitle: 'AI Document Information Assistant',
  aiAutoFillBoxDesc: 'Let AI analyze your document to automatically generate title, description, category, and tags.',
  aiAnalyzing: 'AI is analyzing document content…',
  aiPrefillBtn: 'Analyze & Auto-fill with AI',
  docTitleLabel: 'Document Title',
  docTitlePlaceholder: 'e.g. Grade 11 Biology Semester 1 Nervous System Summary',
  shortDescLabel: 'Short Description (Card view)',
  shortDescPlaceholder: 'Summarize key highlights in 1-2 concise sentences',
  fullDescLabel: 'Full Document Description',
  fullDescPlaceholder: 'Provide detailed overview, table of contents, sample pages, and buyer benefits.',
  aiWriteBtn: 'AI Write Description',
  aiExpandBtn: 'AI Expand Details',
  selectMultipleCategories: 'Select main category and subcategory',
  selectCategoryPlaceholder: 'Select category',
  langThai: 'Thai',
  tagsLabel: 'Tags / Keywords',
  tagsPlaceholder: 'Type tag and press Enter',
  freeDocLabel: 'Set as Free Document (฿0)',
  zeroEarningsDesc: 'Free documents yield zero revenue but help boost shop downloads and followers.',
  originalPriceLabel: 'Original Price before discount (THB)',
  loadingCompetitorHint: 'Loading price comparison insights…',
  updateFileModalTitle: 'Update Document File',
  updateSummaryLabel: 'Changelog Summary',
  versionHistoryModalTitle: 'Document Version History',
  versionNumberLabel: 'Version {version}',

  // Watermark Editor
  loadingWatermarkSettings: 'Loading watermark settings…',
  backToDocList: 'Back to Documents',
  savingWatermark: 'Saving watermark…',
  watermarkTemplateSystem: 'Copyright Protection Watermark System',
  shopTemplateWatermarkDesc: 'Configure watermark style for preview pages and buyer download files',
  goToUploadNewDoc: 'Upload New Document',
  watermarkTextPlaceholder: 'Enter watermark text e.g. Shop Name or SIRIEDUMARKET',
  savingTemplate: 'Saving template…',
  saveWatermarkTemplate: 'Save Watermark Template',
  templateWatermarkNotice: 'Changes will apply to all documents using this template.',
  livePreviewPageAlt: 'Sample document page preview',
  page1: 'Page 1',
  personalizedSubtitle: 'Dynamic Forensic Watermark for Buyer Downloads',
  downloadPosition: 'Download Watermark Position',
  stampTemplate: 'Stamped Text Format',
  clickToInsertVar: 'Click to insert dynamic variable:',
  varBuyerEmail: '{email} - Buyer Email',
  varForensicToken: '{token} - Tracking Code',
  varDownloadDate: '{date} - Download Date',
  varPlatform: '{platform} - Platform Name',
  downloadTextPlaceholder: 'Example: Downloaded by {email} | {token}',
  watermarkFont: 'Watermark Font',
  savePersonalizedSettings: 'Save Download Watermark Settings',
  buyerSimulator: 'Buyer Simulator',
  buyerSimulatorDesc: 'Preview watermark text appearance with simulated buyer details',
  simBuyerEmail: 'Simulated Buyer Email',
  simForensicToken: 'Simulated Tracking Token',
  stampedTextPreview: 'Stamped text on actual document:',
  realDocPreview: 'Live Website Preview',
  docPreviewWatermarkAlt: 'Watermarked document preview',
  defaultPersonalizedText: 'Downloaded by {email} | Token: {token}',
  saveTemplateSuccess: 'Watermark saved successfully',
  saveTemplateFailed: 'Failed to save watermark. Please try again.',
};

// Also add sellerAds keys for ads.page.ts
const sellerAdsTh = {
  submitting: 'กำลังส่ง...',
  selectDocument: 'กรุณาเลือกเอกสาร',
  datesFullyBooked: 'ช่วงวันที่เลือกมีวันที่เต็มแล้ว กรุณาเลือกวันอื่น',
  insufficientBalance: 'ยอดคงเหลือไม่พอ กรุณาเลือกช่วงเวลาที่สั้นลงหรือรอรายได้เข้าเพิ่ม',
  cancelConfirmWithRefund: 'ยกเลิกแคมเปญนี้? คุณจะได้รับเงินคืน {amount} บาท สำหรับวันที่ยังไม่ได้ใช้',
  cancelConfirmNoRefund: 'แคมเปญนี้จะสิ้นสุดวันนี้ จึงไม่มีเงินคืน',
  cancelTitle: 'ยกเลิกแคมเปญโฆษณา',
  cancelConfirmOk: 'ยืนยันยกเลิก',
  cancelSuccess: 'ยกเลิกแคมเปญเรียบร้อย คืนเงิน {amount} บาท',
  createSuccess: 'สร้างแคมเปญโฆษณาเรียบร้อย',
};

const sellerAdsEn = {
  submitting: 'Submitting...',
  selectDocument: 'Please select a document',
  datesFullyBooked: 'Selected dates are fully booked. Please choose different dates.',
  insufficientBalance: 'Insufficient balance. Please select a shorter duration or add funds.',
  cancelConfirmWithRefund: 'Cancel this campaign? You will be refunded ฿{amount} for unused days.',
  cancelConfirmNoRefund: 'This campaign ends today, so no refund is available.',
  cancelTitle: 'Cancel Ad Campaign',
  cancelConfirmOk: 'Confirm Cancellation',
  cancelSuccess: 'Campaign cancelled successfully. Refunded ฿{amount}',
  createSuccess: 'Ad campaign created successfully',
};

// Function to inject keys into th.ts under seller: { ... } and sellerAds: { ... }
function updateTranslationFile(filePath, isTh) {
  let content = fs.readFileSync(filePath, 'utf8');
  const entries = isTh ? sellerThEntries : sellerEnEntries;
  const adsEntries = isTh ? sellerAdsTh : sellerAdsEn;

  // Insert entries into seller: { ... } block
  const sellerMatch = content.match(/seller:\s*\{/);
  if (sellerMatch) {
    const insertIdx = sellerMatch.index + sellerMatch[0].length;
    let newEntriesStr = '\n';
    for (const [k, v] of Object.entries(entries)) {
      const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
      newEntriesStr += `    ${k}: ${formattedVal},\n`;
    }
    content = content.slice(0, insertIdx) + newEntriesStr + content.slice(insertIdx);
  }

  // Insert entries into sellerAds: { ... } block
  const adsMatch = content.match(/sellerAds:\s*\{/);
  if (adsMatch) {
    const insertIdx = adsMatch.index + adsMatch[0].length;
    let newAdsStr = '\n';
    for (const [k, v] of Object.entries(adsEntries)) {
      const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
      newAdsStr += `    ${k}: ${formattedVal},\n`;
    }
    content = content.slice(0, insertIdx) + newAdsStr + content.slice(insertIdx);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

updateTranslationFile(thFile, true);
updateTranslationFile(enFile, false);

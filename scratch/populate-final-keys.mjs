import fs from 'fs';
import path from 'path';

const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const thKeys = {
  displayOrder: 'ลำดับการแสดงผล',
  hoursUnit: 'ชม.',
  loadingFileList: 'กำลังโหลดรายการไฟล์…',
  sellingBadge: 'ไฟล์ขาย',
  colDocPrice: 'ราคาขาย',
  priceFree: 'ฟรี',
  colDocFee: 'ค่าธรรมเนียม',
  freeDocFeeNotice: 'ไม่มีค่าธรรมเนียมสำหรับเอกสารฟรี',
  colDocFileSize: 'ขนาดไฟล์',
  minorUpdateTitle: 'อัปเดตเล็กน้อย (Minor Update)',
  minorUpdateDesc: 'แก้ไขคำผิด หรือปรับปรุงเนื้อเล็กน้อย โดยไม่แจ้งเตือนผู้ซื้อเดิม',
  majorUpdateTitle: 'อัปเดตใหญ่ (Major Update)',
  majorUpdateDesc: 'เพิ่มเนื้อหาใหม่ หรือปรับปรุงใหญ่ โดยระบบจะแจ้งเตือนผู้ซื้อเดิมให้อัปเดต',
  notifiedBuyersCount: 'แจ้งเตือนผู้ซื้อแล้ว {count} ราย',
};

const enKeys = {
  displayOrder: 'Display Order',
  hoursUnit: 'hrs',
  loadingFileList: 'Loading file list…',
  sellingBadge: 'Selling File',
  colDocPrice: 'Selling Price',
  priceFree: 'Free',
  colDocFee: 'Platform Fee',
  freeDocFeeNotice: 'No platform fee for free documents',
  colDocFileSize: 'File Size',
  minorUpdateTitle: 'Minor Update',
  minorUpdateDesc: 'Fix typos or minor edits without notifying existing buyers',
  majorUpdateTitle: 'Major Update',
  majorUpdateDesc: 'Add new content or major rewrite; existing buyers will be notified to update',
  notifiedBuyersCount: 'Notified {count} buyers',
};

function appendToSellerBlock(filePath, keysObj) {
  let content = fs.readFileSync(filePath, 'utf8');
  const sellerMatch = content.match(/seller:\s*\{/);
  if (sellerMatch) {
    const insertIdx = sellerMatch.index + sellerMatch[0].length;
    let newEntriesStr = '\n';
    for (const [k, v] of Object.entries(keysObj)) {
      const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
      newEntriesStr += `    ${k}: ${formattedVal},\n`;
    }
    content = content.slice(0, insertIdx) + newEntriesStr + content.slice(insertIdx);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Appended final keys to ${filePath}`);
  }
}

appendToSellerBlock(thFile, thKeys);
appendToSellerBlock(enFile, enKeys);

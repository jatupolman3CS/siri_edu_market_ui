import fs from 'node:fs';
import path from 'node:path';

const thPath = path.resolve('src/app/core/i18n/translations/th.ts');
const enPath = path.resolve('src/app/core/i18n/translations/en.ts');

const serviceTh = {
  wishlist: {
    loadFailed: 'โหลดรายการโปรดไม่สำเร็จ',
    removedSuccess: 'ลบออกจากรายการโปรดแล้ว',
    removeFailed: 'ลบออกจากรายการโปรดไม่สำเร็จ',
    addedSuccess: 'เพิ่มในรายการโปรดแล้ว',
    addFailed: 'เพิ่มในรายการโปรดไม่สำเร็จ',
    clearedSuccess: 'ล้างรายการโปรดแล้ว',
    clearFailed: 'ล้างรายการโปรดไม่สำเร็จ',
  },
  errors: {
    networkError: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ',
    loadBundleFailed: 'โหลดแพ็กเกจไม่สำเร็จ',
    searchBundleFailed: 'ค้นหาแพ็กเกจไม่สำเร็จ',
    loadBundleDetailFailed: 'โหลดรายละเอียดแพ็กเกจไม่สำเร็จ',
    loadCatalogFailed: 'โหลดรายการเอกสารไม่สำเร็จ',
    searchCatalogFailed: 'ค้นหาเอกสารไม่สำเร็จ',
    loadCategoriesFailed: 'โหลดหมวดหมู่ไม่สำเร็จ',
    loadFreeDocsFailed: 'โหลดเอกสารฟรีไม่สำเร็จ',
    loadCategoryDetailFailed: 'โหลดรายละเอียดหมวดหมู่ไม่สำเร็จ',
    loadCategoryDocsFailed: 'โหลดเอกสารในหมวดหมู่ไม่สำเร็จ',
    docNotFound: 'ไม่พบเอกสารนี้',
    loadDocDetailFailed: 'โหลดรายละเอียดเอกสารไม่สำเร็จ',
    loadSellerInfoFailed: 'โหลดข้อมูลผู้ขายไม่สำเร็จ',
    loadSellerDocsFailed: 'โหลดเอกสารของร้านไม่สำเร็จ',
    loadLoyaltyPointsFailed: 'โหลดคะแนนสะสมไม่สำเร็จ',
    loadPlatformStatsFailed: 'โหลดสถิติแพลตฟอร์มไม่สำเร็จ',
    loadDataFailed: 'โหลดข้อมูลไม่สำเร็จ',
  },
  notifications: {
    myNotifs: 'การแจ้งเตือนของฉัน',
    sellerNotifs: 'การแจ้งเตือนของร้าน',
    adminNotifs: 'การแจ้งเตือนของผู้ดูแลระบบ',
  },
  referral: {
    enterCodePrompt: 'กรุณากรอกโค้ดแนะนำเพื่อน',
  },
  watermark: {
    defaultText: 'เอกสารนี้ได้รับสิทธิ์การใช้งานโดย {email} เมื่อ {date} (รหัสตรวจสอบ: {token}) ห้ามทำซ้ำ ดัดแปลง หรือเผยแพร่ต่อ',
  }
};

const serviceEn = {
  wishlist: {
    loadFailed: 'Failed to load wishlist',
    removedSuccess: 'Removed from wishlist',
    removeFailed: 'Failed to remove from wishlist',
    addedSuccess: 'Added to wishlist',
    addFailed: 'Failed to add to wishlist',
    clearedSuccess: 'Wishlist cleared',
    clearFailed: 'Failed to clear wishlist',
  },
  errors: {
    networkError: 'Server connection failed',
    loadBundleFailed: 'Failed to load bundles',
    searchBundleFailed: 'Failed to search bundles',
    loadBundleDetailFailed: 'Failed to load bundle details',
    loadCatalogFailed: 'Failed to load document catalog',
    searchCatalogFailed: 'Failed to search documents',
    loadCategoriesFailed: 'Failed to load categories',
    loadFreeDocsFailed: 'Failed to load free documents',
    loadCategoryDetailFailed: 'Failed to load category details',
    loadCategoryDocsFailed: 'Failed to load category documents',
    docNotFound: 'Document not found',
    loadDocDetailFailed: 'Failed to load document details',
    loadSellerInfoFailed: 'Failed to load seller information',
    loadSellerDocsFailed: 'Failed to load seller documents',
    loadLoyaltyPointsFailed: 'Failed to load loyalty points',
    loadPlatformStatsFailed: 'Failed to load platform stats',
    loadDataFailed: 'Failed to load data',
  },
  notifications: {
    myNotifs: 'My Notifications',
    sellerNotifs: 'Seller Notifications',
    adminNotifs: 'Admin Notifications',
  },
  referral: {
    enterCodePrompt: 'Please enter a referral code',
  },
  watermark: {
    defaultText: 'Licensed to {email} on {date} (Verification Token: {token}). All rights reserved.',
  }
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const thObj = JSON.parse(fs.readFileSync(thPath, 'utf8').replace('export const th = ', '').replace(';\n\nexport type TranslationKeys = typeof th;\n', '').trim());
deepMerge(thObj, serviceTh);
fs.writeFileSync(thPath, `export const th = ${JSON.stringify(thObj, null, 2)};\n\nexport type TranslationKeys = typeof th;\n`, 'utf8');

const enObj = JSON.parse(fs.readFileSync(enPath, 'utf8').replace("import { TranslationKeys } from './th';\n\nexport const en: TranslationKeys = ", '').replace(';\n', '').trim());
deepMerge(enObj, serviceEn);
fs.writeFileSync(enPath, `import { TranslationKeys } from './th';\n\nexport const en: TranslationKeys = ${JSON.stringify(enObj, null, 2)};\n`, 'utf8');

console.log('Successfully updated service keys in th.ts and en.ts');

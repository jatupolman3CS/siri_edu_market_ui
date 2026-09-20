import fs from 'node:fs';
import path from 'node:path';

const thPath = path.resolve('src/app/core/i18n/translations/th.ts');
const enPath = path.resolve('src/app/core/i18n/translations/en.ts');

const newTranslationsTh = {
  auth: {
    resetLinkSentNotice: 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว',
    sendFailed: 'ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้',
    pleaseEnterValidEmail: 'กรุณากรอกอีเมลให้ถูกต้อง',
    afterLoginRedirect: 'เข้าสู่ระบบแล้วจะนำท่านไปยังหน้าที่เลือก',
    cancel: 'ยกเลิก',
    continue: 'ดำเนินการต่อ',
    welcomeBackToast: 'ยินดีต้อนรับกลับเข้าสู่ระบบ',
    socialLoginSuccess: 'เข้าสู่ระบบผ่านโซเชียลสำเร็จ',
    retypePasswordPlaceholder: 'กรอกรหัสผ่านอีกครั้ง',
    artTitleResetPassword: 'ตั้งรหัสผ่านใหม่',
    artDescResetPassword: 'กำหนดรหัสผ่านใหม่สำหรับเข้าใช้งานบัญชีของคุณ',
    atLeast8Chars: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
    invalidTokenNotice: 'ลิงก์รีเซ็ตไม่ถูกต้องหรือหมดอายุ',
    requestNewLink: 'ขอลิงก์ใหม่',
    newPasswordLabel: 'รหัสผ่านใหม่',
    confirmNewPasswordLabel: 'ยืนยันรหัสผ่านใหม่',
    saving: 'กำลังบันทึก…',
    saveNewPassword: 'บันทึกรหัสผ่านใหม่',
    resetPasswordDoneTitle: 'ตั้งรหัสผ่านใหม่เรียบร้อยแล้ว',
    resetPasswordDoneDesc: 'คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที',
    resetPasswordLinkInvalid: 'ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ',
    resetPasswordFailed: 'ตั้งรหัสผ่านใหม่ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
    emailRequiredToVerify: 'กรุณากรอกอีเมลเพื่อยืนยัน',
    otpInvalidOrExpired: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ',
    verifySuccessWelcome: 'ยืนยันอีเมลสำเร็จ ยินดีต้อนรับ!',
    verifyLinkInvalidOrExpired: 'ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ',
    specifyEmailForOtp: 'กรุณาระบุอีเมลสำหรับรับ OTP',
    otpResentSuccess: 'ส่งรหัส OTP ใหม่เรียบร้อยแล้ว',
    resendOtpFailed: 'ไม่สามารถส่ง OTP ใหม่ได้ กรุณาลองใหม่',
  },
  becomeSeller: {
    heroEyebrow: 'เริ่มต้นสร้างรายได้',
    title: 'สมัครเป็นผู้ขายเอกสาร',
    desc: 'เปลี่ยนชีทสรุปและเอกสารการเรียนของคุณให้เป็นรายได้',
    submitting: 'กำลังส่งข้อมูล…',
    submitBtn: 'ส่งใบสมัครผู้ขาย',
  },
  bundleDetail: {
    breadcrumbHome: 'หน้าแรก',
    tag: 'แพ็กเกจสุดคุ้ม',
    savePercent: 'ประหยัด {percent}%',
    reviewsCount: '{count} รีวิว',
    downloadsCount: '{count} ดาวน์โหลด',
    addAllToCart: 'เพิ่มทั้งแพ็กเกจลงตะกร้า',
    buyNow: 'ซื้อทันที',
    viewStore: 'เยี่ยมชมร้านค้า',
    notFoundTitle: 'ไม่พบแพ็กเกจเอกสาร',
    notFoundDesc: 'แพ็กเกจนี้อาจถูกลบหรือปิดการขายไปแล้ว',
  },
  product: {
    followSuccess: 'ติดตามร้านค้าเรียบร้อยแล้ว',
    unfollowSuccess: 'ยกเลิกการติดตามเรียบร้อยแล้ว',
  },
  storefront: {
    manageStore: 'จัดการร้านค้า',
    following: 'กำลังติดตาม',
    statDocs: 'เอกสารทั้งหมด',
    hoursUnit: 'ชม.',
    notFoundTitle: 'ไม่พบร้านค้า',
    notFoundDesc: 'ร้านค้านี้ไม่มีอยู่ในระบบหรือถูกปิดใช้งาน',
    tabAll: 'เอกสารทั้งหมด',
    tabFree: 'แจกฟรี',
    followSuccess: 'ติดตามร้านค้าแล้ว',
    unfollowSuccess: 'เลิกติดตามร้านค้าแล้ว',
  },
  wallet: {
    paymentConfirmFailed: 'ยืนยันการชำระเงินไม่สำเร็จ',
    statusCancelled: 'ยกเลิกแล้ว',
  },
  onboarding: {
    customizeInterests: 'ปรับแต่งความสนใจของคุณ',
    skipForNow: 'ข้ามไปก่อน',
    interestTitle: 'คุณสนใจเรื่องอะไรบ้าง?',
    interestSubtitle: 'เลือกหมวดหมู่ที่คุณสนใจเพื่อรับคำแนะนำเอกสารที่ตรงใจ',
    loadingCategories: 'กำลังโหลดหมวดหมู่…',
    saving: 'กำลังบันทึก…',
    complete: 'เสร็จสิ้น',
    saveInterestsFailed: 'บันทึกความสนใจไม่สำเร็จ',
    skipFailed: 'ไม่สามารถข้ามได้',
    welcomeBadge: 'ยินดีต้อนรับสู่ SIRIEDUMARKET',
    roleTitle: 'เลือกบทบาทการใช้งานของคุณ',
    roleSubtitle: 'คุณสามารถปรับเปลี่ยนได้ทุกเมื่อในภายหลัง',
    buyerCardTitle: 'ผู้ซื้อ / นักเรียน นักศึกษา',
    buyerCardDesc: 'ค้นหาและดาวน์โหลดเอกสารการเรียน สรุปเนื้อหา คุณภาพสูง',
    buyerCardAction: 'เริ่มต้นในฐานะผู้ซื้อ',
    sellerCardTitle: 'ผู้ขาย / สร้างรายได้',
    sellerCardDesc: 'อัปโหลดชีทสรุปและเอกสารการเรียนเพื่อสร้างรายได้จากผลงานของคุณ',
    sellerCardAction: 'เริ่มต้นในฐานะผู้ขาย',
  },
  admin: {
    thaiLanguageOption: 'ภาษาไทย (th)',
    englishLanguageOption: 'English (en)',
    featured: 'รายการแนะนำ (Featured)',
  },
  seller: {
    langThai: 'ภาษาไทย',
    langEnglish: 'English',
  },
  shared: {
    announcementPopup: {
      defaultTitle: 'ประกาศข่าวสาร',
      prevImage: 'ภาพก่อนหน้า',
      nextImage: 'ภาพถัดไป',
      goToImage: 'ไปยังภาพที่ {index}',
      dontShowAgain: 'ไม่ต้องแสดงอีกในวันนี้',
      viewDetail: 'ดูรายละเอียด',
    },
    changePassword: {
      title: 'เปลี่ยนรหัสผ่าน',
      subtitle: 'เพื่อความปลอดภัย กรุณาตั้งรหัสผ่านที่รัดกุม',
      currentPassword: 'รหัสผ่านปัจจุบัน',
      newPassword: 'รหัสผ่านใหม่',
      confirmPassword: 'ยืนยันรหัสผ่านใหม่',
      currentPasswordRequired: 'กรุณากรอกรหัสผ่านปัจจุบัน',
      minLength: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
      notSameAsCurrent: 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านปัจจุบัน',
      confirmMismatch: 'การยืนยันรหัสผ่านไม่ตรงกัน',
      successRelogin: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่',
    },
    feedbackModal: {
      title: 'ส่งข้อเสนอแนะ / แจ้งปัญหา',
      type: 'ประเภทข้อเสนอแนะ',
      titleLabel: 'หัวข้อ',
      titlePlaceholder: 'ระบุหัวข้อสั้นๆ',
      detailLabel: 'รายละเอียด',
      detailPlaceholder: 'อธิบายรายละเอียดปัญหาหรือข้อเสนอแนะของคุณ',
      screenshot: 'ภาพหน้าจอประกอบ',
      attachmentsNote: 'แนบไฟล์ภาพตัวอย่างเพื่อช่วยให้เราแก้ปัญหาได้เร็วขึ้น',
      addPhoto: 'เพิ่มรูปภาพ',
      pdpaNotice: 'ข้อมูลของคุณจะถูกใช้เพื่อการปรับปรุงบริการเท่านั้น',
      submitToTeam: 'ส่งข้อมูลถึงทีมงาน',
    },
    notifications: {
      newBadge: 'ใหม่',
      noNotifsSub: 'ไม่มีรายการแจ้งเตือนใหม่ในขณะนี้',
      viewAll: 'ดูการแจ้งเตือนทั้งหมด',
    },
    pagination: {
      selectPerPageAria: 'เลือกจำนวนรายการต่อหน้า',
      prevAria: 'หน้าก่อนหน้า',
      nextAria: 'หน้าถัดไป',
    },
    payoutAccount: {
      accountNamePlaceholder: 'ระบุชื่อ-นามสกุลเจ้าของบัญชี',
      bank: 'ธนาคาร',
      selectBank: 'เลือกธนาคาร',
      accountNumber: 'เลขที่บัญชี',
      accountNumberDigitsHint: 'กรอกเฉพาะตัวเลข 10-12 หลัก',
      uploading: 'กำลังอัปโหลด…',
      accountHolderNameRequired: 'กรุณากรอกชื่อบัญชี',
      bankRequired: 'กรุณาเลือกธนาคาร',
      accountNumberInvalid: 'เลขที่บัญชีไม่ถูกต้อง',
    },
    profileEditor: {
      title: 'แก้ไขโปรไฟล์',
      subtitle: 'จัดการข้อมูลส่วนตัวและรูปโปรไฟล์ของคุณ',
      profileImageAlt: 'รูปโปรไฟล์',
      uploadProfileImage: 'อัปโหลดรูปโปรไฟล์',
      supportedFormats: 'รองรับ JPG, PNG, WEBP ขนาดไม่เกิน 5MB',
      displayName: 'ชื่อที่แสดง',
      saveProfile: 'บันทึกโปรไฟล์',
      invalidImageType: 'ประเภทไฟล์รูปภาพไม่ถูกต้อง',
      uploadSuccess: 'อัปโหลดรูปภาพสำเร็จ',
      saveSuccess: 'บันทึกข้อมูลโปรไฟล์สำเร็จ',
    },
    quickView: {
      bestseller: 'ขายดี',
      aiSummary: 'สรุปเนื้อหาโดย AI',
      previewPages: 'ตัวอย่างเอกสาร ({pages} หน้า)',
      inCart: 'อยู่ในตะกร้าแล้ว',
      viewFull: 'ดูรายละเอียดเต็ม',
    },
    reportDocument: {
      describePlaceholder: 'กรอกรายละเอียดรายงานปัญหาเอกสาร…',
      max500Chars: 'สูงสุด 500 ตัวอักษร',
      submitting: 'กำลังส่งรายงาน…',
      submitReport: 'ส่งรายงานปัญหา',
      categories: {
        copyright: 'ละเมิดลิขสิทธิ์',
        inappropriate: 'เนื้อหาไม่เหมาะสม',
        inaccurate: 'ข้อมูลไม่ถูกต้อง / ผิดพลาด',
        other: 'อื่นๆ',
      },
      describeRequired: 'กรุณาระบุรายละเอียดการรายงาน',
      submittedSuccess: 'ส่งรายงานปัญหาเรียบร้อยแล้ว ทีมงานจะตรวจสอบโดยเร็วที่สุด',
      alreadyReportedInfo: 'คุณได้เคยรายงานเอกสารฉบับนี้ไปแล้ว',
      submitFailed: 'ไม่สามารถส่งรายงานได้ กรุณาลองใหม่อีกครั้ง',
    },
    savedCards: {
      saveCard: 'บันทึกบัตร',
      savedSuccess: 'บันทึกบัตรชำระเงินเรียบร้อยแล้ว',
      confirmRemoveTitle: 'ยืนยันการลบบัตร',
      confirmRemoveContent: 'คุณต้องการลบบัตรชำระเงินนี้หรือไม่?',
    },
  },
};

const newTranslationsEn = {
  auth: {
    resetLinkSentNotice: 'Password reset link sent to your email',
    sendFailed: 'Failed to send password reset link',
    pleaseEnterValidEmail: 'Please enter a valid email address',
    afterLoginRedirect: 'You will be redirected after login',
    cancel: 'Cancel',
    continue: 'Continue',
    welcomeBackToast: 'Welcome back!',
    socialLoginSuccess: 'Social login successful',
    retypePasswordPlaceholder: 'Retype your password',
    artTitleResetPassword: 'Reset Password',
    artDescResetPassword: 'Set a new password for your account',
    atLeast8Chars: 'Password must be at least 8 characters',
    invalidTokenNotice: 'Reset link is invalid or has expired',
    requestNewLink: 'Request a new link',
    newPasswordLabel: 'New Password',
    confirmNewPasswordLabel: 'Confirm New Password',
    saving: 'Saving…',
    saveNewPassword: 'Save New Password',
    resetPasswordDoneTitle: 'Password Reset Successful',
    resetPasswordDoneDesc: 'You can now log in with your new password.',
    resetPasswordLinkInvalid: 'Reset password link is invalid or expired',
    resetPasswordFailed: 'Failed to reset password. Please try again.',
    emailRequiredToVerify: 'Please enter your email to verify',
    otpInvalidOrExpired: 'OTP code is invalid or has expired',
    verifySuccessWelcome: 'Email verified successfully. Welcome!',
    verifyLinkInvalidOrExpired: 'Verification link is invalid or expired',
    specifyEmailForOtp: 'Please specify email for OTP',
    otpResentSuccess: 'OTP resent successfully',
    resendOtpFailed: 'Failed to resend OTP. Please try again.',
  },
  becomeSeller: {
    heroEyebrow: 'Start Earning',
    title: 'Become a Document Seller',
    desc: 'Turn your study notes and educational materials into income',
    submitting: 'Submitting…',
    submitBtn: 'Submit Seller Application',
  },
  bundleDetail: {
    breadcrumbHome: 'Home',
    tag: 'Value Bundle',
    savePercent: 'Save {percent}%',
    reviewsCount: '{count} reviews',
    downloadsCount: '{count} downloads',
    addAllToCart: 'Add Bundle to Cart',
    buyNow: 'Buy Now',
    viewStore: 'Visit Store',
    notFoundTitle: 'Bundle Not Found',
    notFoundDesc: 'This bundle may have been removed or disabled.',
  },
  product: {
    followSuccess: 'Followed store successfully',
    unfollowSuccess: 'Unfollowed store successfully',
  },
  storefront: {
    manageStore: 'Manage Store',
    following: 'Following',
    statDocs: 'Total Documents',
    hoursUnit: 'hrs',
    notFoundTitle: 'Store Not Found',
    notFoundDesc: 'This store does not exist or is disabled',
    tabAll: 'All Documents',
    tabFree: 'Free Documents',
    followSuccess: 'Followed store successfully',
    unfollowSuccess: 'Unfollowed store successfully',
  },
  wallet: {
    paymentConfirmFailed: 'Payment confirmation failed',
    statusCancelled: 'Cancelled',
  },
  onboarding: {
    customizeInterests: 'Customize your interests',
    skipForNow: 'Skip for now',
    interestTitle: 'What topics interest you?',
    interestSubtitle: 'Select topics to get personalized document recommendations',
    loadingCategories: 'Loading categories…',
    saving: 'Saving…',
    complete: 'Complete',
    saveInterestsFailed: 'Failed to save interests',
    skipFailed: 'Failed to skip',
    welcomeBadge: 'Welcome to SIRIEDUMARKET',
    roleTitle: 'Choose your role',
    roleSubtitle: 'You can change this anytime later',
    buyerCardTitle: 'Buyer / Student',
    buyerCardDesc: 'Discover and download high-quality study materials and notes',
    buyerCardAction: 'Start as a Buyer',
    sellerCardTitle: 'Seller / Earn Income',
    sellerCardDesc: 'Upload notes and study materials to earn income',
    sellerCardAction: 'Start as a Seller',
  },
  admin: {
    thaiLanguageOption: 'Thai (th)',
    englishLanguageOption: 'English (en)',
    featured: 'Featured Item',
  },
  seller: {
    langThai: 'Thai',
    langEnglish: 'English',
  },
  shared: {
    announcementPopup: {
      defaultTitle: 'Announcement',
      prevImage: 'Previous Image',
      nextImage: 'Next Image',
      goToImage: 'Go to image {index}',
      dontShowAgain: "Don't show again today",
      viewDetail: 'View Details',
    },
    changePassword: {
      title: 'Change Password',
      subtitle: 'For security, please use a strong password',
      currentPassword: 'Current Password',
      newPassword: 'New Password',
      confirmPassword: 'Confirm New Password',
      currentPasswordRequired: 'Current password is required',
      minLength: 'Password must be at least 8 characters',
      notSameAsCurrent: 'New password must differ from current password',
      confirmMismatch: 'Passwords do not match',
      successRelogin: 'Password changed successfully. Please log in again.',
    },
    feedbackModal: {
      title: 'Send Feedback / Report Issue',
      type: 'Feedback Type',
      titleLabel: 'Subject',
      titlePlaceholder: 'Enter a brief subject',
      detailLabel: 'Details',
      detailPlaceholder: 'Describe your issue or feedback in detail',
      screenshot: 'Screenshot attachment',
      attachmentsNote: 'Attach images to help us resolve the issue faster',
      addPhoto: 'Add Photo',
      pdpaNotice: 'Your data will only be used to improve service quality.',
      submitToTeam: 'Submit to Team',
    },
    notifications: {
      newBadge: 'New',
      noNotifsSub: 'No new notifications at this time',
      viewAll: 'View all notifications',
    },
    pagination: {
      selectPerPageAria: 'Select items per page',
      prevAria: 'Previous Page',
      nextAria: 'Next Page',
    },
    payoutAccount: {
      accountNamePlaceholder: 'Account holder full name',
      bank: 'Bank',
      selectBank: 'Select Bank',
      accountNumber: 'Account Number',
      accountNumberDigitsHint: 'Enter 10-12 digits only',
      uploading: 'Uploading…',
      accountHolderNameRequired: 'Account holder name is required',
      bankRequired: 'Please select a bank',
      accountNumberInvalid: 'Invalid account number',
    },
    profileEditor: {
      title: 'Edit Profile',
      subtitle: 'Manage your personal info and profile picture',
      profileImageAlt: 'Profile Picture',
      uploadProfileImage: 'Upload Profile Picture',
      supportedFormats: 'Supports JPG, PNG, WEBP up to 5MB',
      displayName: 'Display Name',
      saveProfile: 'Save Profile',
      invalidImageType: 'Invalid image file type',
      uploadSuccess: 'Image uploaded successfully',
      saveSuccess: 'Profile updated successfully',
    },
    quickView: {
      bestseller: 'Bestseller',
      aiSummary: 'AI Content Summary',
      previewPages: 'Document Preview ({pages} pages)',
      inCart: 'In Cart',
      viewFull: 'View Full Details',
    },
    reportDocument: {
      describePlaceholder: 'Describe the document issue…',
      max500Chars: 'Maximum 500 characters',
      submitting: 'Submitting report…',
      submitReport: 'Submit Report',
      categories: {
        copyright: 'Copyright Infringement',
        inappropriate: 'Inappropriate Content',
        inaccurate: 'Inaccurate Information',
        other: 'Other',
      },
      describeRequired: 'Description is required',
      submittedSuccess: 'Report submitted successfully. We will review it shortly.',
      alreadyReportedInfo: 'You have already reported this document.',
      submitFailed: 'Failed to submit report. Please try again.',
    },
    savedCards: {
      saveCard: 'Save Card',
      savedSuccess: 'Payment card saved successfully',
      confirmRemoveTitle: 'Confirm Card Removal',
      confirmRemoveContent: 'Are you sure you want to remove this payment card?',
    },
  },
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

// Helper to update file using ts AST or simple insertion
// We can parse the exported object in th.ts / en.ts using JS Function or Regex or evaluation since it's a TS export

function updateTranslationFile(filePath, varName, newObj) {
  let content = fs.readFileSync(filePath, 'utf8');
  // Strip 'export const th = ... as const;' wrapper to get raw object expression
  const prefix = `export const ${varName} = `;
  const suffix = ` as const;\n`;
  
  const startIdx = content.indexOf(prefix);
  if (startIdx === -1) throw new Error(`Could not find ${prefix} in ${filePath}`);

  const endIdx = content.lastIndexOf(suffix);
  const jsonStr = content.slice(startIdx + prefix.length, endIdx !== -1 ? endIdx : undefined);

  // Evaluate as object using Function
  const dict = eval(`(${jsonStr})`);

  // Merge
  deepMerge(dict, newObj);

  // Re-format cleanly
  const updatedContent = `${prefix}${JSON.stringify(dict, null, 2)}${suffix}`;
  fs.writeFileSync(filePath, updatedContent, 'utf8');
  console.log(`Successfully updated ${filePath}`);
}

updateTranslationFile(thPath, 'th', newTranslationsTh);
updateTranslationFile(enPath, 'en', newTranslationsEn);

import fs from 'node:fs';
import path from 'node:path';

const enPath = path.resolve('src/app/core/i18n/translations/en.ts');

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

function parseFileToObject(filePath, varName) {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const match = fileContent.match(/export const \w+(?:\s*:\s*\w+)?\s*=\s*([\s\S]+?);?$/);
  if (!match) throw new Error(`Could not find export in ${filePath}`);

  let objectExprStr = match[1].trim();
  if (objectExprStr.endsWith(';')) objectExprStr = objectExprStr.slice(0, -1).trim();

  const fn = new Function(`return (${objectExprStr});`);
  return fn();
}

function writeEnToFile(filePath, objectData) {
  const jsonString = JSON.stringify(objectData, null, 2);
  const content = `import { TranslationKeys } from './th';\n\nexport const en: TranslationKeys = ${jsonString};\n`;
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated ${filePath}`);
}

const enObj = parseFileToObject(enPath, 'en');
deepMerge(enObj, newTranslationsEn);
writeEnToFile(enPath, enObj);

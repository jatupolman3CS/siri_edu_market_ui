import fs from 'fs';
import path from 'path';

const adminDir = path.resolve('src/app/features/admin');
const buyerDir = path.resolve('src/app/features/buyer');
const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const thContent = fs.readFileSync(thFile, 'utf8');
const enContent = fs.readFileSync(enFile, 'utf8');

function getAllFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  });
  return arrayOfFiles;
}

const adminFiles = getAllFiles(adminDir);
const buyerFiles = getAllFiles(buyerDir);
const allTargetFiles = [...adminFiles, ...buyerFiles];

console.log(`Scanning ${adminFiles.length} admin files and ${buyerFiles.length} buyer files...`);

const missingMap = new Map();
const hardcodedThai = [];
const untranslatedToastModal = [];

// Values to exclude that are JS literal values rather than keys
const skipLiteralKeys = new Set([
  'auto', 'custom', 'short', 'long', 'web-preview', 'personalized', '2026-12-31',
  'doc-1', 'doc-2', 'file-2', 'search_top', 'galleryItems', 'input', 'span.font-mono',
  'SEC-TEST-999', 'diagonal', 'bottom-right', 'approved', 'rejected', 'pending',
  'active', 'suspended', 'banned', 'buyer', 'seller', 'admin', 'all'
]);

allTargetFiles.forEach(file => {
  if (file.endsWith('.spec.ts') || file.endsWith('.scss')) return;
  const rel = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('import ')) return;

    // 1. Check for used translation keys
    const matches = [...trimmed.matchAll(/(?:t|tp|translate)\(['"]([^'"]+)['"]\)|['"]([^'"]+)['"]\s*\|\s*trans\b/g)];
    for (const m of matches) {
      const key = m[1] || m[2];
      if (skipLiteralKeys.has(key)) continue;

      const lastSeg = key.split('.').pop();
      const inTh = thContent.includes(`${lastSeg}:`) || thContent.includes(`'${lastSeg}':`) || thContent.includes(`"${lastSeg}":`);
      const inEn = enContent.includes(`${lastSeg}:`) || enContent.includes(`'${lastSeg}':`) || enContent.includes(`"${lastSeg}":`);
      if (!inTh || !inEn) {
        if (!missingMap.has(key)) missingMap.set(key, []);
        missingMap.get(key).push({ file: rel, line: idx + 1, content: trimmed });
      }
    }

    // 2. Check for hardcoded Thai in TS
    if (file.endsWith('.ts') && /['"`][^'"`]*[\u0E00-\u0E7F][^'"`]*['"`]/.test(line)) {
      hardcodedThai.push({ file: rel, line: idx + 1, content: trimmed });
    }

    // 3. Check for toast/modal calls without translation
    if (/(?:message|nzMessage|modal|notification)\.(?:success|error|info|warning|confirm|create)\s*\(/i.test(line)) {
      if (!line.includes('trans') && !line.includes('tp(') && !line.includes('t(') && !line.includes('this.t(') && !line.includes('translation.') && !line.includes('i18n.')) {
        untranslatedToastModal.push({ file: rel, line: idx + 1, content: trimmed });
      }
    }
  });
});

console.log(`\n=== 1. MISSING TRANSLATION KEYS (${missingMap.size}) ===`);
for (const [key, usages] of missingMap.entries()) {
  console.log(`Key: "${key}" (${usages.length} usages)`);
  console.log(`  Example: ${usages[0].file}:${usages[0].line} -> ${usages[0].content}`);
}

console.log(`\n=== 2. HARDCODED THAI STRINGS IN TS (${hardcodedThai.length}) ===`);
hardcodedThai.forEach(item => console.log(`  ${item.file}:${item.line} -> ${item.content}`));

console.log(`\n=== 3. UNTRANSLATED TOAST / MODAL MESSAGES (${untranslatedToastModal.length}) ===`);
untranslatedToastModal.forEach(item => console.log(`  ${item.file}:${item.line} -> ${item.content}`));

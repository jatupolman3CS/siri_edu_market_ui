import fs from 'fs';
import path from 'path';

const sellerDir = path.resolve('src/app/features/seller');
const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

function getAllFiles(dirPath, arrayOfFiles = []) {
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

const sellerFiles = getAllFiles(sellerDir);

const thContent = fs.readFileSync(thFile, 'utf8');
const enContent = fs.readFileSync(enFile, 'utf8');

console.log('=== 1. CHECKING EN.TS FOR UNTRANSLATED THAI STRINGS IN SELLER / COMMON / ROUTES ===');
const thLines = thContent.split('\n');
const enLines = enContent.split('\n');

// Find all lines in en.ts containing Thai characters
enLines.forEach((line, idx) => {
  if (/[\u0E00-\u0E7F]/.test(line)) {
    console.log(`[en.ts Thai character at line ${idx+1}]: ${line.trim()}`);
  }
});

console.log('\n=== 2. FINDING ALL TRANSLATION KEYS USED IN SELLER HTML / TS FILES ===');
const keyRegex = /['"]([a-zA-Z0-9_\-\.]+)['"]\s*\|\s*translate/g;
const tsKeyRegex = /t(?:p)?\(['"]([a-zA-Z0-9_\-\.]+)['"]/g;

const usedKeys = new Set();
const keyLocations = {};

sellerFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(process.cwd(), file);

  let match;
  while ((match = keyRegex.exec(content)) !== null) {
    usedKeys.add(match[1]);
    if (!keyLocations[match[1]]) keyLocations[match[1]] = [];
    keyLocations[match[1]].push(relPath);
  }
  while ((match = tsKeyRegex.exec(content)) !== null) {
    usedKeys.add(match[1]);
    if (!keyLocations[match[1]]) keyLocations[match[1]] = [];
    keyLocations[match[1]].push(relPath);
  }
});

console.log(`Found ${usedKeys.size} distinct translation keys used in seller files.`);

console.log('\n=== 3. CHECKING IF USED KEYS ARE IN TH.TS AND EN.TS ===');
const missingInTh = [];
const missingInEn = [];

// Helper to check if property path exists in object string structure (simple substring/regex search)
usedKeys.forEach(key => {
  const lastPart = key.split('.').pop();
  // check if key name is present in thContent and enContent
  const keyInTh = thContent.includes(`${lastPart}:`) || thContent.includes(`'${lastPart}':`) || thContent.includes(`"${lastPart}":`);
  const keyInEn = enContent.includes(`${lastPart}:`) || enContent.includes(`'${lastPart}':`) || enContent.includes(`"${lastPart}":`);

  if (!keyInTh) missingInTh.push(key);
  if (!keyInEn) missingInEn.push(key);
});

console.log(`Missing in th.ts (${missingInTh.length}):`, missingInTh);
console.log(`Missing in en.ts (${missingInEn.length}):`, missingInEn);

console.log('\n=== 4. CHECKING HARDCODED STRINGS IN SELLER TS FILES ===');
const tsFiles = sellerFiles.filter(f => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
tsFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(process.cwd(), file);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('import ')) return;

    // Check for Thai characters in string literals
    if (/['"`][^'"`]*[\u0E00-\u0E7F][^'"`]*['"`]/.test(line)) {
      console.log(`[TS Hardcoded Thai] ${relPath}:${idx+1} -> ${trimmed}`);
    }

    // Check for nzMessage, message.success/error/info/warning, modal.confirm without translation
    if (/(?:message|nzMessage|modal|notification)\.(?:success|error|info|warning|confirm|create)\s*\(/i.test(line)) {
      if (!line.includes('translate') && !line.includes('tp(') && !line.includes('t(')) {
        console.log(`[TS Toast/Modal without translate] ${relPath}:${idx+1} -> ${trimmed}`);
      }
    }
  });
});

console.log('\n=== 5. CHECKING UNTRANSLATED TEXT IN SELLER HTML FILES ===');
const htmlFiles = sellerFiles.filter(f => f.endsWith('.html'));
htmlFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const relPath = path.relative(process.cwd(), file);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('<!--')) return;

    // Look for raw Thai text or raw English text between tags or in attributes like placeholder="...", title="..."
    // Raw Thai text node: >something Thai< or text containing Thai outside {{ }}
    if (/[\u0E00-\u0E7F]/.test(line)) {
      console.log(`[HTML Thai Text] ${relPath}:${idx+1} -> ${trimmed}`);
    }

    // Check for hardcoded English titles/placeholders/labels in HTML that don't have translate pipe
    const hardcodedAttr = /(?:placeholder|title|nzTitle|nzOkText|nzCancelText|label|heading|alt)=["']([^"']+)["']/g;
    let attrMatch;
    while ((attrMatch = hardcodedAttr.exec(line)) !== null) {
      const val = attrMatch[1];
      if (!val.includes('translate') && !val.startsWith('{{') && !val.startsWith('[')) {
        console.log(`[HTML Hardcoded Attr] ${relPath}:${idx+1} -> ${trimmed}`);
      }
    }
  });
});

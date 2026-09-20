import fs from 'fs';
import path from 'path';

const sellerDir = path.resolve('src/app/features/seller');
const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const thContent = fs.readFileSync(thFile, 'utf8');
const enContent = fs.readFileSync(enFile, 'utf8');

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

console.log('=== FULL SELLER I18N AUDIT (PIPE = trans) ===\n');

const missingKeysSet = new Set();

sellerFiles.forEach(file => {
  if (file.endsWith('.spec.ts') || file.endsWith('.scss')) return;
  const rel = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    // Check t('...') or tp('...') or '...' | trans
    const matches = [...trimmed.matchAll(/(?:t|tp|translate)\(['"]([^'"]+)['"]\)|['"]([^'"]+)['"]\s*\|\s*trans\b/g)];
    for (const m of matches) {
      const key = m[1] || m[2];
      const lastSeg = key.split('.').pop();
      const inTh = thContent.includes(`${lastSeg}:`) || thContent.includes(`'${lastSeg}':`) || thContent.includes(`"${lastSeg}":`);
      const inEn = enContent.includes(`${lastSeg}:`) || enContent.includes(`'${lastSeg}':`) || enContent.includes(`"${lastSeg}":`);
      if (!inTh || !inEn) {
        missingKeysSet.add(key);
        console.log(`[MISSING KEY] ${rel}:${idx+1} -> Key "${key}" (inTh: ${inTh}, inEn: ${inEn})`);
      }
    }

    // Check toast/modal/message/alert/confirm calls
    if (/(?:message|nzMessage|modal|notification)\.(?:success|error|info|warning|confirm|create)\s*\(/i.test(line)) {
      if (!line.includes('trans') && !line.includes('tp(') && !line.includes('t(') && !line.includes('this.t(') && !line.includes('translation.')) {
        console.log(`[UNTRANSLATED TOAST/MODAL] ${rel}:${idx+1} -> ${trimmed}`);
      }
    }
  });
});

console.log('\nAll unique missing keys:', Array.from(missingKeysSet));

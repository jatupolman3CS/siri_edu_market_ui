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

const missingMap = new Map();

sellerFiles.forEach(file => {
  if (file.endsWith('.spec.ts') || file.endsWith('.scss')) return;
  const rel = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;

    const matches = [...trimmed.matchAll(/(?:t|tp|translate)\(['"]([^'"]+)['"]\)|['"]([^'"]+)['"]\s*\|\s*trans\b/g)];
    for (const m of matches) {
      const key = m[1] || m[2];
      // Exclude simple JS string literals like 'auto', 'custom', 'short', 'long' which are mode values, not keys
      if (['auto', 'custom', 'short', 'long', 'web-preview', 'personalized', '2026-12-31', 'doc-1', 'doc-2', 'file-2', 'search_top', 'galleryItems', 'input', 'span.font-mono', 'SEC-TEST-999', 'diagonal', 'bottom-right'].includes(key)) {
        continue;
      }
      const lastSeg = key.split('.').pop();
      const inTh = thContent.includes(`${lastSeg}:`) || thContent.includes(`'${lastSeg}':`) || thContent.includes(`"${lastSeg}":`);
      const inEn = enContent.includes(`${lastSeg}:`) || enContent.includes(`'${lastSeg}':`) || enContent.includes(`"${lastSeg}":`);
      if (!inTh || !inEn) {
        if (!missingMap.has(key)) missingMap.set(key, []);
        missingMap.get(key).push({ file: rel, line: idx + 1, content: trimmed });
      }
    }
  });
});

console.log(`Total missing keys: ${missingMap.size}\n`);
const result = {};
for (const [key, usages] of missingMap.entries()) {
  result[key] = usages.map(u => `${u.file}:${u.line}`);
}
fs.writeFileSync('scratch/missing-seller-keys.json', JSON.stringify(result, null, 2));
console.log('Saved to scratch/missing-seller-keys.json');

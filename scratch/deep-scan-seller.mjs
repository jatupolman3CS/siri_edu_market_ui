import fs from 'fs';
import path from 'path';

const sellerDir = path.resolve('src/app/features/seller');
const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const thContent = fs.readFileSync(thFile, 'utf8');
const enContent = fs.readFileSync(enFile, 'utf8');

// Parse keys from th.ts
// We will search all seller keys in thContent
function getKeysInTh() {
  const keys = new Set();
  const matches = thContent.matchAll(/^\s*([a-zA-Z0-9_]+):/gm);
  for (const match of matches) {
    keys.add(match[1]);
  }
  return keys;
}

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

console.log('=== SELLER FILES SCAN DETAILED ===\n');

sellerFiles.forEach(file => {
  const rel = path.relative(process.cwd(), file);
  if (file.endsWith('.spec.ts')) return;

  const content = fs.readFileSync(file, 'utf8');
  
  // Find all t('...'), tp('...'), translatePipe keys
  const keysInFile = [];
  const keyMatches = content.matchAll(/(?:t|tp)\(['"]([^'"]+)['"]\)/g);
  for (const m of keyMatches) {
    keysInFile.push(m[1]);
  }
  const htmlPipeMatches = content.matchAll(/['"]([^'"]+)['"]\s*\|\s*translate/g);
  for (const m of htmlPipeMatches) {
    keysInFile.push(m[1]);
  }

  // Check which keys are missing in th.ts or en.ts
  const missingTh = [];
  const missingEn = [];

  keysInFile.forEach(k => {
    // A key is seller.xyz or common.xyz or nav.xyz
    // Check if thContent contains `'xyz':` or `xyz:` or `xyz:` inside appropriate block
    // We can do a search for the last segment or full structure
    const lastSeg = k.split('.').pop();
    const inTh = thContent.includes(`${lastSeg}:`) || thContent.includes(`'${lastSeg}':`) || thContent.includes(`"${lastSeg}":`);
    const inEn = enContent.includes(`${lastSeg}:`) || enContent.includes(`'${lastSeg}':`) || enContent.includes(`"${lastSeg}":`);

    if (!inTh) missingTh.push(k);
    if (!inEn) missingEn.push(k);
  });

  if (keysInFile.length > 0 || missingTh.length > 0 || missingEn.length > 0) {
    console.log(`File: ${rel}`);
    console.log(`  Total translate keys used: ${keysInFile.length}`);
    if (missingTh.length > 0) console.log(`  MISSING IN TH.TS: ${[...new Set(missingTh)].join(', ')}`);
    if (missingEn.length > 0) console.log(`  MISSING IN EN.TS: ${[...new Set(missingEn)].join(', ')}`);
  }
});

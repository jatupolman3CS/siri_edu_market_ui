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

console.log(`Total missing seller keys: ${missingMap.size}\n`);

const entries = Array.from(missingMap.entries());
entries.sort((a, b) => a[0].localeCompare(b[0]));

entries.forEach(([key, usages]) => {
  console.log(`KEY: ${key}`);
  usages.forEach(u => console.log(`  - ${u.file}:${u.line} -> ${u.content}`));
});

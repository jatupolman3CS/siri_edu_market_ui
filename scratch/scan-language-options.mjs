import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src/app');

function getAllFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const files = getAllFiles(root);

console.log('=== SEARCHING FOR LANGUAGE LABELS, OPTIONS & DROPDOWNS IN ADMIN, BUYER, SELLER ===\n');

for (const file of files) {
  if (file.endsWith('.spec.ts') || file.includes('assets') || file.includes('translations')) continue;
  const relPath = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    if (
      line.includes('language') || 
      line.includes('Language') || 
      line.includes('ภาษาไทย') || 
      line.includes('อังกฤษ') ||
      line.includes('th-TH') ||
      line.includes('en-US')
    ) {
      console.log(`${relPath}:${idx + 1} -> ${line.trim()}`);
    }
  });
}

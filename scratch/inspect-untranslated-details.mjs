import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scratch/deep-scan-untranslated.json', 'utf8'));

console.log('=== HARDCODED THAI IN HTML TEMPLATES ===\n');
data.hardcodedHtmlThai.forEach((item, i) => {
  console.log(`${i + 1}. ${item.file}:${item.line} -> ${item.text}`);
});

console.log('\n=== HARDCODED ENGLISH IN HTML TEMPLATES ===\n');
data.hardcodedHtmlEnglish.forEach((item, i) => {
  console.log(`${i + 1}. ${item.file}:${item.line} [${item.extracted}] -> ${item.text}`);
});

console.log('\n=== SAMPLE HARDCODED THAI IN TS FILES (Top 50) ===\n');
data.hardcodedTsThai.slice(0, 50).forEach((item, i) => {
  console.log(`${i + 1}. ${item.file}:${item.line} -> ${item.text}`);
});

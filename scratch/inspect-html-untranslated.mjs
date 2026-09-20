import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scratch/deep-scan-untranslated.json', 'utf8'));

console.log('=== HARDCODED THAI IN HTML ===');
data.hardcodedHtmlThai.forEach((h, i) => console.log(`${i+1}. ${h.file}:${h.line} -> ${h.text}`));

console.log('\n=== HARDCODED ENGLISH IN HTML ===');
data.hardcodedHtmlEnglish.forEach((h, i) => console.log(`${i+1}. ${h.file}:${h.line} [${h.extracted}] -> ${h.text}`));

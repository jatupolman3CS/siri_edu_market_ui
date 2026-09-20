import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scratch/audit-results.json', 'utf8'));

console.log('=== MISSING KEYS IN DICTIONARY (USED IN CODE) ===\n');

data.missingInTh.forEach((item, i) => {
  console.log(`${i + 1}. Key: "${item.key}"`);
  item.locations.forEach(loc => {
    console.log(`   Location: ${loc.file}:${loc.line}`);
  });
});

import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('scratch/audit-results.json', 'utf8'));

let output = '=== 149 MISSING KEYS USED IN TEMPLATES/TS ===\n\n';

data.missingInTh.forEach((item, i) => {
  output += `${i + 1}. Key: "${item.key}"\n`;
  item.locations.forEach(loc => {
    output += `   Location: ${loc.file}:${loc.line}\n`;
  });
});

fs.writeFileSync('scratch/missing-keys-149.txt', output, 'utf8');
console.log('Saved to scratch/missing-keys-149.txt');

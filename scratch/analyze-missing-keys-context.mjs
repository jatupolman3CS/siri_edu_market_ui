import fs from 'node:fs';
import path from 'node:path';

const data = JSON.parse(fs.readFileSync('scratch/audit-results.json', 'utf8'));

const keyContexts = [];

data.missingInTh.forEach(({ key, locations }) => {
  const loc = locations[0];
  if (!loc) return;
  const filePath = path.resolve(loc.file);
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const lineIdx = loc.line - 1;
  
  const start = Math.max(0, lineIdx - 2);
  const end = Math.min(lines.length, lineIdx + 3);
  const snippet = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');

  keyContexts.push({
    key,
    file: loc.file,
    line: loc.line,
    snippet
  });
});

fs.writeFileSync('scratch/missing-keys-contexts.json', JSON.stringify(keyContexts, null, 2));
console.log(`Extracted contexts for ${keyContexts.length} keys to scratch/missing-keys-contexts.json`);

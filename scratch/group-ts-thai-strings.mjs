import fs from 'node:fs';

const items = JSON.parse(fs.readFileSync('scratch/ts-thai-strings.json', 'utf8'));

const grouped = new Map();

for (const item of items) {
  if (!grouped.has(item.file)) grouped.set(item.file, []);
  grouped.get(item.file).push(item);
}

console.log(`=== TS FILES WITH HARDCODED THAI STRINGS (${grouped.size} files) ===\n`);

for (const [file, list] of grouped.entries()) {
  console.log(`File: ${file} (${list.length} strings)`);
  list.forEach(i => {
    console.log(`  Line ${i.line}: "${i.text}"`);
  });
  console.log('');
}

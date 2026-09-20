import fs from 'fs';
import path from 'path';

const missingKeys = JSON.parse(fs.readFileSync('scratch/missing-seller-keys.json', 'utf8'));

console.log('=== MISSING KEYS WITH CONTEXT ===\n');

for (const [key, locations] of Object.entries(missingKeys)) {
  console.log(`Key: "${key}"`);
  locations.forEach(loc => {
    const [file, lineStr] = loc.split(':');
    const lineNum = parseInt(lineStr, 10);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    console.log(`  Location: ${file}:${lineNum}`);
    const start = Math.max(0, lineNum - 3);
    const end = Math.min(lines.length - 1, lineNum + 2);
    for (let i = start; i <= end; i++) {
      const marker = i + 1 === lineNum ? '>>>' : '   ';
      console.log(`    ${marker} ${i + 1}: ${lines[i].trim()}`);
    }
  });
  console.log('--------------------------------------------------');
}

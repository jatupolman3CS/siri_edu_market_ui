import fs from 'fs';
import path from 'path';

const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

function cleanAllDuplicateKeys(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Track key occurrences per top-level block scope
  let currentBlock = 'root';
  const seenKeys = new Map(); // block -> Set(keys)
  const newLines = [];

  for (const line of lines) {
    const blockMatch = line.match(/^  ([a-zA-Z0-9_]+):\s*\{/);
    if (blockMatch) {
      currentBlock = blockMatch[1];
      if (!seenKeys.has(currentBlock)) {
        seenKeys.set(currentBlock, new Set());
      }
    }

    const keyMatch = line.match(/^\s*([a-zA-Z0-9_]+):/);
    if (keyMatch && currentBlock !== 'root') {
      const key = keyMatch[1];
      const blockSet = seenKeys.get(currentBlock) || new Set();
      if (blockSet.has(key)) {
        console.log(`[Dedupe] Removed duplicate key "${key}" in block "${currentBlock}" from ${path.basename(filePath)}`);
        continue;
      }
      blockSet.add(key);
      seenKeys.set(currentBlock, blockSet);
    }
    newLines.push(line);
  }

  fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
}

cleanAllDuplicateKeys(thFile);
cleanAllDuplicateKeys(enFile);

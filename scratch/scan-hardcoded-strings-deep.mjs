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

const thaiRegex = /[\u0E00-\u0E7F]+/g;

const hardcodedHtmlThai = [];
const hardcodedHtmlEnglish = [];
const hardcodedTsThai = [];

for (const file of files) {
  if (file.endsWith('.spec.ts') || file.includes('assets') || file.includes('translations')) continue;
  const relPath = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (file.endsWith('.html')) {
      // Remove HTML comments
      const lineNoComment = line.replace(/<!--[\s\S]*?-->/g, '').trim();
      if (!lineNoComment) continue;

      // Remove trans expressions: {{ '...' | trans ... }} or [attr]="'...' | trans"
      const cleanedLine = lineNoComment
        .replace(/\{\{\s*['"][^'"]+['"]\s*\|\s*trans[^}]*\}\}/g, '')
        .replace(/\[[^\]]+\]="['"][^'"]+['"]\s*\|\s*trans[^"]*"/g, '')
        .replace(/\[[^\]]+\]='["'][^'"]+["']\s*\|\s*trans[^']*'/g, '');

      // Check Thai text remaining
      if (thaiRegex.test(cleanedLine)) {
        // Exclude inline documentation comments or SVG text if any
        hardcodedHtmlThai.push({ file: relPath, line: lineNum, text: line.trim() });
      }

      // Check common hardcoded English text in HTML tags like >Text< or placeholder="Text" or title="Text"
      const tagTextMatches = lineNoComment.match(/>\s*([A-Za-z0-9\s.,!?:;\-()&'/]+)\s*</g);
      if (tagTextMatches) {
        for (const m of tagTextMatches) {
          const textInside = m.replace(/^>\s*/, '').replace(/\s*<$/, '').trim();
          // Filter out variable interpolations {{...}}, icons, numbers, or short symbols
          if (
            textInside.length > 2 &&
            !textInside.includes('{{') &&
            !textInside.includes('}}') &&
            !/^\d+$/.test(textInside) &&
            !/^[A-Z0-9_\-\.\:\#]+$/.test(textInside) &&
            !['div', 'span', 'button', 'svg', 'path', 'app-icon', 'nz-switch', 'iframe'].includes(textInside.toLowerCase())
          ) {
            // Check if it looks like UI text
            if (/[a-zA-Z]{2,}/.test(textInside)) {
              hardcodedHtmlEnglish.push({ file: relPath, line: lineNum, text: line.trim(), extracted: textInside });
            }
          }
        }
      }
    } else if (file.endsWith('.ts')) {
      // Check Thai text in TS strings (excluding comments)
      const lineNoComment = line.replace(/\/\/.*/, '').replace(/\/\*[\s\S]*?\*\//, '').trim();
      if (thaiRegex.test(lineNoComment)) {
        // Exclude imports or trans.pipe/service definitions
        if (!lineNoComment.includes('i18n/translations')) {
          hardcodedTsThai.push({ file: relPath, line: lineNum, text: line.trim() });
        }
      }
    }
  }
}

const summary = {
  hardcodedHtmlThaiCount: hardcodedHtmlThai.length,
  hardcodedHtmlEnglishCount: hardcodedHtmlEnglish.length,
  hardcodedTsThaiCount: hardcodedTsThai.length,
  hardcodedHtmlThai,
  hardcodedHtmlEnglish: hardcodedHtmlEnglish.slice(0, 50), // sample 50
  hardcodedTsThai,
};

fs.writeFileSync('scratch/deep-scan-untranslated.json', JSON.stringify(summary, null, 2));
console.log(`Scan completed:
- Hardcoded Thai in HTML: ${hardcodedHtmlThai.length} lines
- Hardcoded English in HTML: ${hardcodedHtmlEnglish.length} lines
- Hardcoded Thai in TS: ${hardcodedTsThai.length} lines`);

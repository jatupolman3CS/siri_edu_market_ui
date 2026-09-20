import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src/app');

function getDictionaryKeysAndValues(language) {
  const filePath = path.join(root, 'core/i18n/translations', `${language}.ts`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const keys = new Set();
  const keyValues = new Map();

  function visitObject(object, prefix = '') {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name.getText(source).replace(/^['"]|['"]$/g, '');
      const current = prefix ? `${prefix}.${name}` : name;
      keys.add(current);
      if (ts.isObjectLiteralExpression(property.initializer)) {
        visitObject(property.initializer, current);
      } else if (ts.isStringLiteral(property.initializer) || ts.isNoSubstitutionTemplateLiteral(property.initializer)) {
        keyValues.set(current, property.initializer.text);
      }
    }
  }

  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText(source) !== language || !declaration.initializer) continue;
      const initializer = ts.isAsExpression(declaration.initializer)
        ? declaration.initializer.expression
        : declaration.initializer;
      if (ts.isObjectLiteralExpression(initializer)) visitObject(initializer);
    }
  });

  return { keys, keyValues };
}

const thDict = getDictionaryKeysAndValues('th');
const enDict = getDictionaryKeysAndValues('en');

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

const keyUsageMap = new Map();
const hardcodedThaiLines = [];
const languageLabelUsages = [];

const transPipeRegex = /['"]([a-zA-Z0-9_\-.]+)['"]\s*\|\s*trans\b/g;
const transCallRegex = /\.(?:t|list)\(\s*['"]([a-zA-Z0-9_\-.]+)['"]/g;
const thaiRegex = /[\u0E00-\u0E7F]+/g;

for (const file of files) {
  if (file.endsWith('.spec.ts') || file.includes('assets') || file.includes('translations')) continue;
  const relPath = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Trans pipe
    let match;
    transPipeRegex.lastIndex = 0;
    while ((match = transPipeRegex.exec(line)) !== null) {
      const key = match[1];
      if (!keyUsageMap.has(key)) keyUsageMap.set(key, []);
      keyUsageMap.get(key).push({ file: relPath, line: i + 1, snippet: line.trim() });
    }

    // Trans call
    transCallRegex.lastIndex = 0;
    while ((match = transCallRegex.exec(line)) !== null) {
      const key = match[1];
      if (!keyUsageMap.has(key)) keyUsageMap.set(key, []);
      keyUsageMap.get(key).push({ file: relPath, line: i + 1, snippet: line.trim() });
    }

    // Check language labels / seller.languageLabel / product.languageLabel
    if (line.includes('languageLabel') || line.includes('ภาษา') || line.includes('Language')) {
      languageLabelUsages.push({ file: relPath, line: i + 1, snippet: line.trim() });
    }

    // Check hardcoded Thai in HTML (excluding comments)
    if (file.endsWith('.html')) {
      const lineNoComment = line.replace(/<!--[\s\S]*?-->/g, '');
      // remove {{ 'key' | trans }}
      const cleaned = lineNoComment.replace(/\{\{\s*['"][^'"]+['"]\s*\|\s*trans[^}]*\}\}/g, '')
                                 .replace(/\[[^\]]+\]="['"][^'"]+['"]\s*\|\s*trans"/g, '');
      if (thaiRegex.test(cleaned)) {
        // filter out comments or simple attribute comments
        hardcodedThaiLines.push({ file: relPath, line: i + 1, snippet: line.trim() });
      }
    }
  }
}

console.log('=== SUMMARY OF SCAN ===');
console.log(`Total TH Keys: ${thDict.keys.size}`);
console.log(`Total EN Keys: ${enDict.keys.size}`);
console.log(`Unique Keys Used in Code: ${keyUsageMap.size}`);

const keysMissingInTh = [];
const keysMissingInEn = [];

for (const [key, locs] of keyUsageMap.entries()) {
  if (!thDict.keys.has(key)) {
    keysMissingInTh.push({ key, loc: locs[0] });
  }
  if (!enDict.keys.has(key)) {
    keysMissingInEn.push({ key, loc: locs[0] });
  }
}

console.log(`\n--- KEYS USED IN CODE BUT MISSING IN TH (${keysMissingInTh.length}) ---`);
keysMissingInTh.forEach(k => console.log(`${k.key} -> ${k.loc.file}:${k.loc.line}`));

console.log(`\n--- KEYS USED IN CODE BUT MISSING IN EN (${keysMissingInEn.length}) ---`);
keysMissingInEn.forEach(k => console.log(`${k.key} -> ${k.loc.file}:${k.loc.line}`));

const thKeysNotEn = [...thDict.keys].filter(k => !enDict.keys.has(k));
console.log(`\n--- KEYS DEFINED IN TH BUT MISSING IN EN DICTIONARY (${thKeysNotEn.length}) ---`);
thKeysNotEn.forEach(k => console.log(`  - ${k} (Value TH: "${thDict.keyValues.get(k) || ''}")`));

const enKeysNotTh = [...enDict.keys].filter(k => !thDict.keys.has(k));
console.log(`\n--- KEYS DEFINED IN EN BUT MISSING IN TH DICTIONARY (${enKeysNotTh.length}) ---`);
enKeysNotTh.forEach(k => console.log(`  - ${k} (Value EN: "${enDict.keyValues.get(k) || ''}")`));

console.log(`\n--- HARDCODED THAI STRINGS IN HTML TEMPLATES (${hardcodedThaiLines.length}) ---`);
hardcodedThaiLines.forEach(h => console.log(`${h.file}:${h.line} -> ${h.snippet}`));

console.log(`\n--- LANGUAGE LABEL REFERENCES (${languageLabelUsages.length}) ---`);
languageLabelUsages.forEach(l => console.log(`${l.file}:${l.line} -> ${l.snippet}`));

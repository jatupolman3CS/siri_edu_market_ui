import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src/app');

// Load th and en dictionary objects
function getDictionaryKeysAndValues(language) {
  const filePath = path.join(root, 'core/i18n/translations', `${language}.ts`);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // We can dynamically import or parse AST
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

console.log('=== DICTIONARY COMPARISON ===');
const thOnly = [...thDict.keys].filter(k => !enDict.keys.has(k));
const enOnly = [...enDict.keys].filter(k => !thDict.keys.has(k));

console.log(`Keys in TH but missing in EN (${thOnly.length}):`);
thOnly.slice(0, 20).forEach(k => console.log(`  - ${k}`));
if (thOnly.length > 20) console.log(`  ... and ${thOnly.length - 20} more.`);

console.log(`Keys in EN but missing in TH (${enOnly.length}):`);
enOnly.slice(0, 20).forEach(k => console.log(`  - ${k}`));
if (enOnly.length > 20) console.log(`  ... and ${enOnly.length - 20} more.`);

// Scan key usage in HTML and TS
const keyUsageMap = new Map();
const hardcodedThaiHTML = [];
const hardcodedLanguageLabelUsages = [];

const thaiRegex = /[\u0E00-\u0E7F]+/g;
const transPipeRegex = /['"]([a-zA-Z0-9_\-.]+)['"]\s*\|\s*trans\b/g;
const transCallRegex = /\.(?:t|list)\(\s*['"]([a-zA-Z0-9_\-.]+)['"]/g;

for (const file of files) {
  if (file.endsWith('.spec.ts') || file.includes('assets') || file.includes('translations')) continue;
  const relPath = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  // Check key usages
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Trans pipe
    let match;
    transPipeRegex.lastIndex = 0;
    while ((match = transPipeRegex.exec(line)) !== null) {
      const key = match[1];
      if (!keyUsageMap.has(key)) keyUsageMap.set(key, []);
      keyUsageMap.get(key).push({ file: relPath, line: i + 1 });
    }

    // Trans call
    transCallRegex.lastIndex = 0;
    while ((match = transCallRegex.exec(line)) !== null) {
      const key = match[1];
      if (!keyUsageMap.has(key)) keyUsageMap.set(key, []);
      keyUsageMap.get(key).push({ file: relPath, line: i + 1 });
    }

    // Thai text in HTML
    if (file.endsWith('.html')) {
      const lineWithoutComments = line.replace(/<!--[\s\S]*?-->/g, '');
      // Check if line contains Thai text NOT inside {{ '...' | trans }}
      // Simplified check: line has Thai characters
      const matches = lineWithoutComments.match(thaiRegex);
      if (matches) {
        // Strip trans pipe matches
        const cleaned = lineWithoutComments.replace(/['"][^'"]*[\u0E00-\u0E7F]+[^'"]*['"]\s*\|\s*trans/g, '');
        if (thaiRegex.test(cleaned)) {
          hardcodedThaiHTML.push({ file: relPath, line: i + 1, content: line.trim() });
        }
      }
    }

    // Check language label / seller.languageLabel specifically
    if (line.toLowerCase().includes('language') || line.toLowerCase().includes('ภาษา')) {
      hardcodedLanguageLabelUsages.push({ file: relPath, line: i + 1, content: line.trim() });
    }
  }
}

console.log('\n=== USED KEYS MISSING IN DICTIONARIES ===');
const missingInTh = [];
const missingInEn = [];
for (const [key, locs] of keyUsageMap.entries()) {
  if (!thDict.keys.has(key)) missingInTh.push({ key, loc: locs[0] });
  if (!enDict.keys.has(key)) missingInEn.push({ key, loc: locs[0] });
}

console.log(`Used keys missing in TH (${missingInTh.length}):`);
missingInTh.forEach(item => console.log(`  - ${item.key} at ${item.loc.file}:${item.loc.line}`));

console.log(`Used keys missing in EN (${missingInEn.length}):`);
missingInEn.forEach(item => console.log(`  - ${item.key} at ${item.loc.file}:${item.loc.line}`));

console.log(`\n=== HARDCODED THAI TEXT IN HTML TEMPLATES (${hardcodedThaiHTML.length} lines found) ===`);
hardcodedThaiHTML.slice(0, 30).forEach(item => console.log(`  ${item.file}:${item.line} -> ${item.content.slice(0, 100)}`));

console.log(`\n=== LANGUAGE LABEL / FIELD REFS (${hardcodedLanguageLabelUsages.length} lines found) ===`);
hardcodedLanguageLabelUsages.slice(0, 30).forEach(item => console.log(`  ${item.file}:${item.line} -> ${item.content.slice(0, 100)}`));

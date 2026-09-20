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

const keyUsage = new Map();

const transPipePattern = /['"]([a-zA-Z0-9_\-.]+)['"]\s*\|\s*trans\b/g;
const transCallPattern = /\.(?:t|list)\(\s*['"]([a-zA-Z0-9_\-.]+)['"]/g;

for (const file of files) {
  if (file.endsWith('.spec.ts') || file.includes('assets') || file.includes('translations')) continue;
  const relPath = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, index) => {
    const lineNum = index + 1;

    // Pipe matches
    transPipePattern.lastIndex = 0;
    let match;
    while ((match = transPipePattern.exec(line)) !== null) {
      const k = match[1];
      if (!keyUsage.has(k)) keyUsage.set(k, []);
      keyUsage.get(k).push({ file: relPath, line: lineNum, text: line.trim() });
    }

    // Call matches
    transCallPattern.lastIndex = 0;
    while ((match = transCallPattern.exec(line)) !== null) {
      const k = match[1];
      if (!keyUsage.has(k)) keyUsage.set(k, []);
      keyUsage.get(k).push({ file: relPath, line: lineNum, text: line.trim() });
    }
  });
}

const missingInTh = [];
const missingInEn = [];

for (const [key, locs] of keyUsage.entries()) {
  if (!thDict.keys.has(key)) {
    missingInTh.push({ key, locations: locs });
  }
  if (!enDict.keys.has(key)) {
    missingInEn.push({ key, locations: locs });
  }
}

const thKeysMissingInEnDict = [...thDict.keys].filter(k => !enDict.keys.has(k)).map(k => ({ key: k, valueTh: thDict.keyValues.get(k) }));
const enKeysMissingInThDict = [...enDict.keys].filter(k => !thDict.keys.has(k)).map(k => ({ key: k, valueEn: enDict.keyValues.get(k) }));

const result = {
  stats: {
    thKeysCount: thDict.keys.size,
    enKeysCount: enDict.keys.size,
    uniqueKeysUsedInCode: keyUsage.size,
    usedKeysMissingInTh: missingInTh.length,
    usedKeysMissingInEn: missingInEn.length,
    thKeysMissingInEnDict: thKeysMissingInEnDict.length,
    enKeysMissingInThDict: enKeysMissingInThDict.length,
  },
  missingInTh,
  missingInEn,
  thKeysMissingInEnDict,
  enKeysMissingInThDict
};

fs.writeFileSync('scratch/audit-results.json', JSON.stringify(result, null, 2));
console.log('Audit results saved to scratch/audit-results.json');
console.log(JSON.stringify(result.stats, null, 2));

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = path.resolve('src/app');
const dictionaries = ['th', 'en'];

function dictionaryPaths(language) {
  const file = path.join(root, 'core/i18n/translations', `${language}.ts`);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const paths = new Set();

  function visitObject(object, prefix = '') {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name.getText(source).replace(/^['"]|['"]$/g, '');
      const current = prefix ? `${prefix}.${name}` : name;
      paths.add(current);
      if (ts.isObjectLiteralExpression(property.initializer)) visitObject(property.initializer, current);
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
  return paths;
}

function dictionaryLeaves(language) {
  const file = path.join(root, 'core/i18n/translations', `${language}.ts`);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const leaves = new Map();
  function visitObject(object, prefix = '') {
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const name = property.name.getText(source).replace(/^['"]|['"]$/g, '');
      const current = prefix ? `${prefix}.${name}` : name;
      if (ts.isObjectLiteralExpression(property.initializer)) visitObject(property.initializer, current);
      else {
        const values = leaves.get(name) ?? [];
        values.push({ path: current, value: property.initializer.getText(source) });
        leaves.set(name, values);
      }
    }
  }
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText(source) !== language || !declaration.initializer) continue;
      const initializer = ts.isAsExpression(declaration.initializer) ? declaration.initializer.expression : declaration.initializer;
      if (ts.isObjectLiteralExpression(initializer)) visitObject(initializer);
    }
  });
  return leaves;
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(fullPath) : [fullPath];
  });
}

const available = Object.fromEntries(dictionaries.map((language) => [language, dictionaryPaths(language)]));
const leaves = Object.fromEntries(dictionaries.map((language) => [language, dictionaryLeaves(language)]));
const usages = new Map();
const patterns = [
  /['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]\s*\|\s*trans\b/g,
  /\.(?:t|list)\(\s*['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]/g,
];

for (const file of filesUnder(root)) {
  if (!/\.(?:ts|html)$/.test(file) || file.endsWith('.spec.ts')) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split('\n').length;
      const locations = usages.get(match[1]) ?? [];
      locations.push(`${path.relative(process.cwd(), file)}:${line}`);
      usages.set(match[1], locations);
    }
  }
}

let missingCount = 0;
for (const [key, locations] of [...usages].sort(([left], [right]) => left.localeCompare(right))) {
  const missing = dictionaries.filter((language) => !available[language].has(key));
  if (!missing.length) continue;
  missingCount += 1;
  const leaf = key.split('.').at(-1);
  const candidates = leaves.en.get(leaf) ?? [];
  const candidate = candidates.length === 1 ? ` -> ${candidates[0].path}` : '';
  console.log(`${key} missing in ${missing.join(', ')} (${locations[0]})${candidate}`);
}

console.log(`Checked ${usages.size} static keys; ${missingCount} keys are missing.`);
process.exitCode = missingCount ? 1 : 0;

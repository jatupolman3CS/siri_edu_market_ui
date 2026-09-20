import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

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
const thaiRegex = /[\u0E00-\u0E7F]/;
const tsThaiStrings = [];

for (const file of files) {
  if (!file.endsWith('.ts') || file.endsWith('.spec.ts') || file.includes('translations')) continue;
  const relPath = path.relative(process.cwd(), file);
  const content = fs.readFileSync(file, 'utf8');
  
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (thaiRegex.test(node.text)) {
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        tsThaiStrings.push({
          file: relPath,
          line,
          text: node.text
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

console.log(`Found ${tsThaiStrings.length} Thai string literals in TypeScript files.`);
fs.writeFileSync('scratch/ts-thai-strings.json', JSON.stringify(tsThaiStrings, null, 2));

import fs from 'node:fs';
import path from 'node:path';

const thPath = path.resolve('src/app/core/i18n/translations/th.ts');
const enPath = path.resolve('src/app/core/i18n/translations/en.ts');

const th = JSON.parse(fs.readFileSync(thPath, 'utf8').replace('export const th = ', '').replace(';\n\nexport type TranslationKeys = typeof th;\n', '').trim());
const en = JSON.parse(fs.readFileSync(enPath, 'utf8').replace("import { TranslationKeys } from './th';\n\nexport const en: TranslationKeys = ", '').replace(';\n', '').trim());

console.log('TH gradeLevels:', th.gradeLevels);
console.log('EN gradeLevels:', en.gradeLevels);
console.log('TH resourceTypes:', th.resourceTypes);
console.log('EN resourceTypes:', en.resourceTypes);

import fs from 'node:fs';
import path from 'node:path';

const thPath = path.resolve('src/app/core/i18n/translations/th.ts');
const enPath = path.resolve('src/app/core/i18n/translations/en.ts');

const extraTh = {
  common: {
    edit: 'แก้ไข',
    delete: 'ลบ',
    deleteImage: 'ลบรูปนี้',
  },
  product: {
    preview: 'ตัวอย่างเอกสาร',
  }
};

const extraEn = {
  common: {
    edit: 'Edit',
    delete: 'Delete',
    deleteImage: 'Delete Image',
  },
  product: {
    preview: 'Document Preview',
  }
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

const thObj = JSON.parse(fs.readFileSync(thPath, 'utf8').replace('export const th = ', '').replace(';\n\nexport type TranslationKeys = typeof th;\n', '').trim());
deepMerge(thObj, extraTh);
fs.writeFileSync(thPath, `export const th = ${JSON.stringify(thObj, null, 2)};\n\nexport type TranslationKeys = typeof th;\n`, 'utf8');

const enObj = JSON.parse(fs.readFileSync(enPath, 'utf8').replace("import { TranslationKeys } from './th';\n\nexport const en: TranslationKeys = ", '').replace(';\n', '').trim());
deepMerge(enObj, extraEn);
fs.writeFileSync(enPath, `import { TranslationKeys } from './th';\n\nexport const en: TranslationKeys = ${JSON.stringify(enObj, null, 2)};\n`, 'utf8');

console.log('Successfully added common.edit, common.delete, common.deleteImage, product.preview to th.ts & en.ts');

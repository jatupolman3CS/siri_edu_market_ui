import fs from 'fs';
import path from 'path';

const thFile = path.resolve('src/app/core/i18n/translations/th.ts');
const enFile = path.resolve('src/app/core/i18n/translations/en.ts');

const extraTh = {
  rejectModalTitle: 'ปฏิเสธเอกสาร',
};

const extraEn = {
  rejectModalTitle: 'Reject Document',
};

function insertEntriesIntoAdminBlock(filePath, entriesObj) {
  let content = fs.readFileSync(filePath, 'utf8');
  const adminMatch = content.match(/  admin:\s*\{/);
  if (!adminMatch) return;

  const insertIdx = adminMatch.index + adminMatch[0].length;
  const blockSlice = content.slice(insertIdx, insertIdx + 30000);

  let newStr = '\n';
  for (const [k, v] of Object.entries(entriesObj)) {
    const keyRegex = new RegExp(`\\b${k}:`);
    if (keyRegex.test(blockSlice)) continue;

    const formattedVal = typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : JSON.stringify(v);
    newStr += `    ${k}: ${formattedVal},\n`;
  }

  if (newStr !== '\n') {
    content = content.slice(0, insertIdx) + newStr + content.slice(insertIdx);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Inserted extra keys into ${filePath}`);
  }
}

insertEntriesIntoAdminBlock(thFile, extraTh);
insertEntriesIntoAdminBlock(enFile, extraEn);

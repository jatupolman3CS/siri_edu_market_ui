import fs from 'fs';

const keysObj = JSON.parse(fs.readFileSync('scratch/missing-admin-buyer-keys.json', 'utf8'));
const grouped = {};

for (const key of Object.keys(keysObj)) {
  const prefix = key.includes('.') ? key.split('.')[0] : 'root';
  if (!grouped[prefix]) grouped[prefix] = [];
  grouped[prefix].push(key);
}

for (const [prefix, keys] of Object.entries(grouped)) {
  console.log(`=== Prefix: "${prefix}" (${keys.length} keys) ===`);
  keys.forEach(k => console.log(`  - ${k}`));
}

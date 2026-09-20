import fs from 'node:fs';

const file = 'src/app/core/i18n/translations/th.ts';
let content = fs.readFileSync(file, 'utf8');
const sellerAdsStart = content.indexOf('\n  sellerAds: {');
const becomeSellerStart = content.indexOf('\n  becomeSeller: {', sellerAdsStart);
const statusStart = content.indexOf('\n   statusCancelled:', becomeSellerStart);
const storefrontStart = content.indexOf('\n  storefront: {', statusStart);

if ([sellerAdsStart, becomeSellerStart, statusStart, storefrontStart].some((index) => index < 0)) {
  throw new Error('Expected malformed sellerAds structure was not found');
}

const closingBeforeStorefront = content.lastIndexOf('\n  },', storefrontStart);
const statusLines = content.slice(statusStart + 1, closingBeforeStorefront);
content = content.slice(0, statusStart) + content.slice(closingBeforeStorefront + '\n  },'.length);

const updatedBecomeSellerStart = content.indexOf('\n  becomeSeller: {', sellerAdsStart);
content =
  content.slice(0, updatedBecomeSellerStart) +
  `\n${statusLines}\n  },\n` +
  content.slice(updatedBecomeSellerStart);

fs.writeFileSync(file, content, 'utf8');

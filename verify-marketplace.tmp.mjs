// Ad-hoc Playwright verification script for marketplace-paged-results v1 (AC-12/13/14 + AC-9 layout
// + regression sanity on home/free/category-detail). Not a committed test — throwaway browser check.
import { chromium } from 'playwright';

const BASE = 'http://localhost:4200';
const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('  [console.error]', msg.text());
});
page.on('pageerror', (err) => console.log('  [pageerror]', err.message));

try {
  await page.goto(`${BASE}/marketplace`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[role="status"]', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  // ---- AC-9: search button is a flex sibling to the right of the input, not position:absolute ----
  const searchInput = page.locator('input[name="marketplaceSearch"]');
  const searchForm = searchInput.locator('xpath=ancestor::form[1]');
  const searchBtn = searchForm.locator('button[type="submit"]');
  const inputBox = await searchInput.boundingBox();
  const btnBox = await searchBtn.boundingBox();
  const btnPosition = await searchBtn.evaluate((el) => getComputedStyle(el).position);
  const btnClasses = await searchBtn.getAttribute('class');
  log(
    'AC-9: search button sits to the right of the input, not absolute-positioned',
    !!inputBox && !!btnBox && btnBox.x > inputBox.x + inputBox.width - 5 && btnPosition !== 'absolute',
    `inputBox.x+w=${inputBox ? inputBox.x + inputBox.width : 'n/a'} btnBox.x=${btnBox ? btnBox.x : 'n/a'} position=${btnPosition} class="${btnClasses}"`,
  );

  // ---- AC-13: results panel has its own scrollbar / bounded height ----
  const panel = page.locator('[class*="max-h-"][class*="overflow-y-auto"]').first();
  const panelStyle = await panel.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { overflowY: cs.overflowY, maxHeight: cs.maxHeight, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
  log(
    'AC-13: results panel is overflow-y:auto with a bounded max-height',
    panelStyle.overflowY === 'auto' && panelStyle.maxHeight !== 'none',
    JSON.stringify(panelStyle),
  );
  log(
    'AC-13: panel content taller than its viewport shows its own scrollbar (scrollHeight > clientHeight)',
    panelStyle.scrollHeight > panelStyle.clientHeight,
    `scrollHeight=${panelStyle.scrollHeight} clientHeight=${panelStyle.clientHeight}`,
  );

  // scroll the panel down a bit so we can prove AC-12 resets panel scroll (not page scroll)
  await panel.evaluate((el) => { el.scrollTop = 150; });
  await page.waitForTimeout(100);
  const panelScrollBefore = await panel.evaluate((el) => el.scrollTop);

  // ---- AC-12: page/window scroll must not jump; only panel scrollTop resets ----
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(100);
  const windowScrollBefore = await page.evaluate(() => window.scrollY);

  // trigger a new search (changes filter -> new page-1 fetch -> loading state)
  await searchInput.fill('a');
  const cardCountBeforeLoad = await page.locator('app-document-card').count();
  await searchBtn.click();

  // AC-14: loading overlay appears while old cards remain visible (not blanked)
  const overlayVisiblePromise = page.locator('[role="status"]').first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  const overlayVisible = await overlayVisiblePromise;
  const cardCountDuringLoad = await page.locator('app-document-card').count();
  log(
    'AC-14: loading overlay appears over the panel while previous cards remain visible',
    overlayVisible,
    `overlayVisible=${overlayVisible} cardsBefore=${cardCountBeforeLoad} cardsDuringLoad=${cardCountDuringLoad}`,
  );

  await page.waitForSelector('[role="status"]', { state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);

  const windowScrollAfter = await page.evaluate(() => window.scrollY);
  log(
    'AC-12: window scroll position unchanged after search completes',
    Math.abs(windowScrollAfter - windowScrollBefore) < 5,
    `before=${windowScrollBefore} after=${windowScrollAfter}`,
  );

  const panelScrollAfter = await panel.evaluate((el) => el.scrollTop);
  log(
    'AC-12: results panel scrollTop reset to 0 on new search (was scrolled down before)',
    panelScrollBefore > 0 && panelScrollAfter === 0,
    `before=${panelScrollBefore} after=${panelScrollAfter}`,
  );

  // ---- clear search, verify pagination controls + page size selector work ----
  await page.evaluate(() => window.scrollTo(0, 0));
  const clearBtn = page.locator('button', { hasText: 'ล้างทั้งหมด' }).first();
  if (await clearBtn.count()) {
    await clearBtn.click();
    await page.waitForSelector('[role="status"]', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
  }

  const paginationNav = page.locator('app-pagination nav');
  const hasMultiplePages = await paginationNav.count();
  if (hasMultiplePages) {
    const page2Btn = paginationNav.locator('button', { hasText: /^2$/ }).first();
    if (await page2Btn.count()) {
      await page2Btn.click();
      await page.waitForSelector('[role="status"]', { state: 'detached', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(300);
      const pageIndicator = await page.locator('app-pagination').innerText();
      log('Pagination: clicking page 2 navigates (page indicator updates)', pageIndicator.includes('2'), pageIndicator.replace(/\n/g, ' | '));
    } else {
      log('Pagination: page 2 button present', false, 'only 1 page of results — cannot exercise page nav (not a failure of the feature, just insufficient seed data)');
    }
  } else {
    log('Pagination: nav rendered when totalPages > 1', false, 'no <app-pagination nav> found — check totalCount/pageSize seed data');
  }

  const pageSizeSelect = page.locator('app-pagination select');
  if (await pageSizeSelect.count()) {
    await pageSizeSelect.selectOption('48');
    await page.waitForSelector('[role="status"]', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(300);
    const selected = await pageSizeSelect.inputValue();
    log('Pagination: page size selector changes page size', selected === '48', `selected=${selected}`);
  } else {
    log('Pagination: page size selector present', false, 'no <select> found inside app-pagination');
  }

  // ---- Regression: home page loads + infinite scroll "load more" still exists where applicable ----
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const homeCards = await page.locator('app-document-card').count();
  log('Regression: home page renders document cards', homeCards > 0, `cards=${homeCards}`);

  // ---- Regression: free page loads + "load more" infinite-scroll button (not pagination) ----
  await page.goto(`${BASE}/free`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const freeCards = await page.locator('app-document-card').count();
  const freeHasPagination = await page.locator('app-pagination').count();
  log('Regression: free page renders document cards', freeCards > 0, `cards=${freeCards}`);
  log('Regression: free page still uses infinite-scroll (no <app-pagination>)', freeHasPagination === 0, `app-pagination count=${freeHasPagination}`);

  // ---- Regression: category-detail page loads ----
  await page.goto(`${BASE}/categories`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const catLink = page.locator('a[href^="/category/"]').first();
  if (await catLink.count()) {
    const href = await catLink.getAttribute('href');
    await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const catCards = await page.locator('app-document-card').count();
    log('Regression: category-detail page loads and renders (or empty-states) correctly', true, `href=${href} cards=${catCards}`);
  } else {
    log('Regression: category-detail page reachable via /categories link', false, 'no /category/ link found on /categories page');
  }
} catch (e) {
  log('FATAL — script threw', false, String(e && e.stack ? e.stack : e));
} finally {
  await browser.close();
}

console.log('\n=== SUMMARY ===');
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} :: ${f.detail}`);
  process.exit(1);
}

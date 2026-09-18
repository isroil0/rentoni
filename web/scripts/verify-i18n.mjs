/**
 * Trilingual verification in a real browser.
 *
 * For each language: checks <html lang>, that storefront and admin copy is actually
 * translated, that no `[i18n] missing key` warning fires, and that no page scrolls
 * sideways — longer Russian and Uzbek words are the usual cause of overflow.
 *
 *   npm run verify:i18n        (the app and API must already be running)
 */
import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const problems = [];

const EXPECT = {
  en: { home: /Find your perfect shirt/, shop: /Shop shirts/, dash: /Today's sales/, pos: /Find a product/, reports: /Revenue/ },
  ru: { home: /Найдите свою рубашку/, shop: /Каталог рубашек/, dash: /Продажи сегодня/, pos: /Найти товар/, reports: /Выручка/ },
  uz: { home: /mos ko‘ylakni toping/, shop: /Ko‘ylaklar do‘koni/, dash: /Bugungi sotuvlar/, pos: /Mahsulot topish/, reports: /Tushum/ },
};

for (const loc of ['en', 'ru', 'uz']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => problems.push(`[${loc}] pageerror: ${e.message}`));
  p.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_ABORTED|status of 401/.test(t)) problems.push(`[${loc}] ${t}`);
    // A missing-key warning means a gap in a dictionary — treat it as a failure.
    if (/\[i18n\] missing key/.test(t)) problems.push(`[${loc}] ${t}`);
  });
  await p.addInitScript(l => localStorage.setItem('rentoni.locale', l), loc);

  await p.goto(BASE, { waitUntil: 'networkidle' });
  const lang = await p.evaluate(() => document.documentElement.lang);
  const h1 = (await p.locator('h1').first().textContent())?.trim() ?? '';
  if (lang !== loc) problems.push(`[${loc}] html lang is "${lang}"`);
  if (!EXPECT[loc].home.test(h1)) problems.push(`[${loc}] home h1 "${h1}"`);
  console.log(`[${loc}] lang=${lang} home="${h1}"`);
  await p.screenshot({ path: `${process.env.OUT}/i18n-${loc}-home.png` });

  await p.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  await p.waitForSelector('article'); await p.waitForTimeout(400);
  const shopH1 = (await p.locator('h1').first().textContent())?.trim() ?? '';
  if (!EXPECT[loc].shop.test(shopH1)) problems.push(`[${loc}] shop h1 "${shopH1}"`);
  console.log(`      shop="${shopH1}" cards=${await p.locator('article').count()}`);

  // Admin
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const emailLabel = { en: 'Email', ru: 'Эл. почта', uz: 'Email' }[loc];
  const pwLabel = { en: 'Password', ru: 'Пароль', uz: 'Parol' }[loc];
  // Required fields append an asterisk and an sr-only "(required)", so match loosely.
  await p.getByLabel(new RegExp(emailLabel.replace('.', '\\.'))).first().fill('admin@rentoni.test');
  await p.getByLabel(new RegExp(pwLabel)).first().fill('Admin@12345');
  await p.locator('form button[type=submit]').click();
  await p.waitForURL('**/admin**', { timeout: 20000 });
  await p.waitForTimeout(1800);
  const dashText = await p.locator('body').innerText();
  if (!EXPECT[loc].dash.test(dashText)) problems.push(`[${loc}] dashboard copy not translated`);
  console.log(`      dashboard chart marks=${await p.locator('.recharts-bar-rectangle').count()}`);
  await p.screenshot({ path: `${process.env.OUT}/i18n-${loc}-admin.png` });

  await p.goto(`${BASE}/admin/pos`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(700);
  if (!EXPECT[loc].pos.test(await p.locator('body').innerText())) problems.push(`[${loc}] POS copy not translated`);

  await p.goto(`${BASE}/admin/reports`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(900);
  if (!EXPECT[loc].reports.test(await p.locator('body').innerText())) problems.push(`[${loc}] reports copy not translated`);

  // Nothing should scroll sideways in any language (longer words widen layouts).
  for (const [route, w] of [['/', 390], ['/shop', 390], ['/admin', 390], ['/admin/inventory', 390]]) {
    await p.setViewportSize({ width: w, height: 844 });
    await p.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    const over = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (over) problems.push(`[${loc}] ${route} scrolls horizontally at ${w}px`);
  }
  await ctx.close();
}
await b.close();

if (problems.length) { console.log(`\n❌ ${problems.length} problem(s):`); problems.forEach(p => console.log('   - ' + p)); process.exit(1); }
console.log('\n✅ All three languages render correctly, no missing keys, no overflow.');

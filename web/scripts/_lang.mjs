import { chromium } from 'playwright';
const BASE = 'http://localhost:5173';
const b = await chromium.launch({ channel: 'chrome', headless: true });

for (const [loc, expectHome] of [['en', /Find your perfect shirt/], ['ru', /Найдите свою рубашку/], ['uz', /mos ko‘ylakni toping/]]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type()==='error' && !/ERR_NAME_NOT_RESOLVED|ERR_ABORTED|status of 401/.test(m.text())) errs.push(m.text()); });

  await p.addInitScript(l => localStorage.setItem('rentoni.locale', l), loc);
  await p.goto(BASE, { waitUntil: 'networkidle' });
  const h1 = (await p.locator('h1').first().textContent())?.trim();
  const lang = await p.evaluate(() => document.documentElement.lang);
  console.log(`[${loc}] html lang=${lang}  h1="${h1}"  match=${expectHome.test(h1 ?? '')}`);

  await p.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  await p.waitForSelector('article'); await p.waitForTimeout(400);
  const shopH1 = (await p.locator('h1').first().textContent())?.trim();
  const cards = await p.locator('article').count();
  console.log(`      shop h1="${shopH1}" cards=${cards}`);
  await p.screenshot({ path: `${process.env.OUT}/lang-${loc}-home.png` });
  if (errs.length) console.log('      ERRORS:', errs.slice(0,2).join(' | '));
  await ctx.close();
}
await b.close();

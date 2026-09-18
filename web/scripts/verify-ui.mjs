/**
 * Real-browser verification.
 *
 * Drives the running app in the locally installed Chrome, walks the customer and admin
 * journeys, captures screenshots at desktop and mobile widths, and fails on any console
 * error or failed request. Complements the jsdom suite, which cannot do layout.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://127.0.0.1:5173';
const OUT = process.env.UI_SHOTS ?? './.ui-shots';
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const shots = [];

function watch(page, label) {
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    /**
     * Expected in this environment, and not application faults:
     *  - the seeded catalogue points at cdn.rentoni.test, which does not resolve (the
     *    UI falls back to a placeholder, which is the intended behaviour);
     *  - a 401 from POST /auth/refresh is how an anonymous visit resolves — there is no
     *    session to restore;
     *  - net::ERR_ABORTED is React Query cancelling an in-flight request when the view
     *    unmounts during navigation.
     */
    if (/cdn\.rentoni\.test|ERR_NAME_NOT_RESOLVED|net::ERR_ABORTED/i.test(text)) return;
    if (/status of 401/.test(text)) return;
    problems.push(`[${label}] console error: ${text}`);
  });
  page.on('pageerror', (error) => problems.push(`[${label}] page error: ${error.message}`));
  page.on('requestfailed', (request) => {
    const url = request.url();
    const reason = request.failure()?.errorText ?? '';
    if (/cdn\.rentoni\.test/i.test(url)) return;
    // Cancelled in-flight requests are normal SPA navigation, not failures.
    if (reason.includes('ERR_ABORTED')) return;
    problems.push(`[${label}] request failed: ${url} — ${reason}`);
  });
}

async function shoot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  shots.push(file);
  console.log(`  📸 ${name}`);
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  // ---------------------------------------------------------- customer, desktop ----
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktop.newPage();
  watch(page, 'customer');

  console.log('\nCustomer journey (desktop 1440×900)');

  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (!(await page.getByRole('heading', { name: /Find your perfect shirt/i }).isVisible())) {
    problems.push('home: hero heading missing');
  }
  await shoot(page, '01-home');

  await page.getByRole('link', { name: 'Shop shirts' }).first().click();
  await page.waitForURL('**/shop');
  // Wait for the grid to settle before counting: the list re-renders once the query
  // resolves, and counting mid-render undercounts.
  await page.waitForSelector('article');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  const cardCount = await page.locator('article').count();
  console.log(`  shop: ${cardCount} product cards`);
  if (cardCount === 0) problems.push('shop: no product cards rendered');
  await shoot(page, '02-shop');

  // Filter by colour to prove server-side filtering reaches the UI.
  await page.getByLabel('Colour').first().selectOption({ label: 'Black' });
  await page.waitForTimeout(800);
  await shoot(page, '03-shop-filtered');

  // Open a product and pick a variant.
  await page.goto(`${BASE}/shop`, { waitUntil: 'networkidle' });
  await page.locator('article a').first().click();
  await page.waitForURL('**/products/**');
  // This is a SPA: the URL changes on pushState before React has swapped the view, so
  // wait for a control that only exists on the product page.
  await page.waitForSelector('button:has-text("Add to cart"), button:has-text("Out of stock")', {
    timeout: 15000,
  });
  const productName = await page.locator('h1').first().textContent();
  console.log(`  product: ${productName?.trim()}`);

  const bodyText = await page.locator('body').innerText();
  for (const forbidden of [/cost price/i, /margin/i, /supplier/i, /minimum stock/i]) {
    if (forbidden.test(bodyText)) problems.push(`product page leaks ${forbidden}`);
  }
  await shoot(page, '04-product');

  // Choose colour + size, then add to cart.
  const sizeGroup = page.getByRole('group', { name: /size/i });
  await sizeGroup.getByRole('button').first().click();
  await page.getByRole('button', { name: /^Add to cart$/ }).click();
  await page.waitForTimeout(1200);
  await shoot(page, '05-added-to-cart');

  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shoot(page, '06-cart');

  // Sign in as a customer and check out.
  await signIn(page, 'customer1@rentoni.test', 'Customer@123');
  await page.goto(`${BASE}/cart`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const checkoutLink = page.getByRole('link', { name: 'Checkout' }).first();
  if (await checkoutLink.isVisible()) {
    await checkoutLink.click();
    await page.waitForURL('**/checkout');
    await page.waitForTimeout(800);
    await shoot(page, '07-checkout');

    await page.getByRole('button', { name: 'Place order' }).click();
    await page.waitForURL('**/order-confirmation/**', { timeout: 20000 });
    await page.waitForTimeout(600);
    const confirmation = await page.locator('body').innerText();
    if (!/Order placed successfully/i.test(confirmation)) {
      problems.push('checkout: confirmation message missing');
    }
    console.log('  checkout: order placed');
    await shoot(page, '08-order-confirmation');
  } else {
    problems.push('cart: checkout link not available after sign-in');
  }

  await page.goto(`${BASE}/account/orders`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shoot(page, '09-account-orders');

  // A customer must not reach the admin area.
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  if (new URL(page.url()).pathname.startsWith('/admin')) {
    problems.push('SECURITY: a CUSTOMER stayed on /admin');
  } else {
    console.log(`  guard: customer redirected from /admin to ${new URL(page.url()).pathname}`);
  }
  await shoot(page, '10-customer-blocked-from-admin');

  // ------------------------------------------------------------ customer, mobile ----
  console.log('\nCustomer journey (mobile 390×844)');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  watch(mobilePage, 'mobile');

  for (const [route, name] of [
    ['/', '11-mobile-home'],
    ['/shop', '12-mobile-shop'],
  ]) {
    await mobilePage.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(600);
    const overflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    if (overflow) problems.push(`mobile ${route}: page scrolls horizontally`);
    await shoot(mobilePage, name);
  }
  await mobile.close();

  // ------------------------------------------------------------------ admin ----
  console.log('\nAdmin journey (desktop 1440×900)');
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const admin = await adminContext.newPage();
  watch(admin, 'admin');

  await signIn(admin, 'admin@rentoni.test', 'Admin@12345');
  if (!new URL(admin.url()).pathname.startsWith('/admin')) {
    problems.push('admin sign-in did not land in the back office');
  }
  await admin.waitForTimeout(1500);
  await shoot(admin, '13-admin-dashboard');

  // The dashboard chart must actually paint (this is what jsdom cannot verify).
  const chartSvgs = await admin.locator('.recharts-surface').count();
  console.log(`  dashboard: ${chartSvgs} chart surface(s) rendered`);
  if (chartSvgs === 0) problems.push('dashboard: no chart rendered');
  const bars = await admin.locator('.recharts-bar-rectangle').count();
  console.log(`  dashboard: ${bars} bar mark(s)`);

  // POS: search, add, and read the server-priced total.
  await admin.goto(`${BASE}/admin/pos`, { waitUntil: 'networkidle' });
  await admin.getByLabel('Find a product').fill('Oxford');
  await admin.waitForTimeout(1200);
  const posResults = await admin.locator('li button').count();
  console.log(`  pos: ${posResults} search results`);
  if (posResults === 0) problems.push('pos: search returned nothing');
  await admin.locator('li button').first().click();
  await admin.waitForTimeout(1200);
  const ticket = await admin.locator('body').innerText();
  if (!/Complete sale/i.test(ticket)) problems.push('pos: ticket did not render');
  await shoot(admin, '14-admin-pos');

  for (const [route, name] of [
    ['/admin/products', '15-admin-products'],
    ['/admin/inventory', '16-admin-inventory'],
    ['/admin/purchases', '17-admin-purchases'],
    ['/admin/sales', '18-admin-sales'],
    ['/admin/returns', '19-admin-returns'],
    ['/admin/customers', '20-admin-customers'],
    ['/admin/suppliers', '21-admin-suppliers'],
    ['/admin/reports', '22-admin-reports'],
    ['/admin/audit-logs', '23-admin-audit-logs'],
    ['/admin/settings', '24-admin-settings'],
  ]) {
    await admin.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await admin.waitForTimeout(900);
    await shoot(admin, name);
  }

  // Admin at tablet width — the sidebar should collapse rather than break the layout.
  // Reuses the signed-in page: the API rate-limits auth endpoints, so repeated sign-ins
  // would (correctly) start returning 429.
  await admin.setViewportSize({ width: 820, height: 1180 });
  await admin.goto(`${BASE}/admin/inventory`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(900);
  const adminOverflow = await admin.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (adminOverflow) problems.push('admin tablet: page scrolls horizontally');
  await shoot(admin, '25-admin-tablet-inventory');

  // And at phone width, where the sidebar becomes a drawer.
  await admin.setViewportSize({ width: 390, height: 844 });
  await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await admin.waitForTimeout(900);
  const adminPhoneOverflow = await admin.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (adminPhoneOverflow) problems.push('admin phone: page scrolls horizontally');
  await shoot(admin, '26-admin-mobile-dashboard');

  await adminContext.close();
  await desktop.close();
} finally {
  await browser.close();
}

console.log(`\n${shots.length} screenshots written to ${OUT}`);
if (problems.length) {
  console.log(`\n❌ ${problems.length} problem(s):`);
  for (const problem of problems) console.log(`   - ${problem}`);
  process.exit(1);
}
console.log('\n✅ No console errors, failed requests, layout overflow or access-control failures.');

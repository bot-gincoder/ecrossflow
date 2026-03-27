const fs = require('fs');
const { chromium } = require('playwright');
function envVal(k){ const env = fs.readFileSync('.env','utf8'); const m = env.match(new RegExp(`^${k}=(.*)$`, 'm')); return (m ? m[1] : '').trim(); }

(async() => {
  const base = 'https://ecrossflow.com';
  const login = envVal('ADMIN_SEED_EMAIL') || 'admin@ecrossflow.com';
  const password = envVal('ADMIN_SEED_PASSWORD');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 900 } });

  await context.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/auth/login')) {
      await route.continue();
      return;
    }
    const body = (() => {
      if (url.includes('/api/users/me')) return { id: 'u1', role: 'ADMIN', firstName: 'Test', lastName: 'User', username: 'testuser' };
      if (url.includes('/api/notifications/unread-count')) return { count: 0 };
      if (url.includes('/api/wallet/rates')) return { rates: { USD: 1 } };
      if (url.includes('/api/wallet/circle/config')) return { enabled: true, configured: true };
      if (url.includes('/api/wallet/circle/assets')) return { assets: [{ asset: 'USDC', network: 'POLYGON', blockchain: 'POLYGON' }], enabled: true, configured: true };
      if (url.includes('/api/wallet/circle/address')) return { address: '0x1234', network: 'POLYGON', status: 'ACTIVE' };
      if (url.includes('/api/wallet')) return { balanceUsd: 0, balancePending: 0, balanceReserved: 0, totalBalance: 0 };
      if (url.includes('/api/boards/my-status')) return { statuses: [] };
      if (url.includes('/api/boards')) return { boards: [] };
      if (url.includes('/api/transactions')) return { transactions: [], total: 0, page: 1, totalPages: 1 };
      if (url.includes('/api/referrals')) return { referrals: [], referralCode: 'ECFTEST', referralLink: 'https://ecrossflow.com/auth/register?ref=ECFTEST' };
      return {};
    })();
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  await page.goto(`${base}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[type="password"]', { timeout: 30000 });
  const textInputs = page.locator('input[type="text"], input[type="email"]');
  await textInputs.first().fill(login);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });

  await page.waitForSelector('aside select', { timeout: 30000 });
  await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('aside select'));
    const lang = selects.find((s) => Array.from(s.options).some((o) => o.value === 'de'));
    if (!lang) throw new Error('language select not found');
    lang.value = 'de';
    lang.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.waitForFunction(() => {
    const combo = document.querySelector('.goog-te-combo');
    return combo && combo.value === 'de';
  }, { timeout: 35000 });

  const routes = ['/dashboard','/boards','/wallet','/history','/referrals','/notifications','/profile','/admin'];
  const results = [];
  for (const route of routes) {
    await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try { await page.waitForFunction(() => Boolean(document.querySelector('.goog-te-combo')), { timeout: 10000 }); } catch {}
    await page.waitForTimeout(350);
    const state = await page.evaluate(() => {
      const combo = document.querySelector('.goog-te-combo');
      return {
        url: location.pathname,
        comboExists: Boolean(combo),
        comboValue: combo ? combo.value : null,
        bodyLength: (document.body?.innerText || '').trim().length,
      };
    });
    results.push({ route, ...state });
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
  await browser.close();
})();

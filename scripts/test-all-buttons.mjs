import { chromium } from 'playwright';
import { spawn } from 'child_process';

const BASE_URL = 'http://localhost:3000';

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function run() {
  console.log('Starting local Vite server for button interaction test...');
  const vite = spawn('npx.cmd', ['vite', '--port', '3000'], {
    cwd: 'C:/dev/SimpleITSRQ/simpleitsrq-web',
    stdio: 'ignore',
    shell: true,
  });

  const ready = await waitForServer(BASE_URL);
  if (!ready) {
    console.error('Vite dev server failed to start.');
    vite.kill();
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const issues = [];
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(`[Console Error] ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(`[Page Error] ${err.message}`);
  });

  const routesToTest = [
    '/',
    '/services',
    '/leadgen',
    '/support',
    '/tools',
    '/portal/ops'
  ];

  for (const route of routesToTest) {
    console.log(`\nTesting buttons on route: ${route}`);
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1000);

      const buttons = await page.locator('button, a.btn, [role="button"], .leadgen-tab-pill, .ops-tab-pill').all();
      console.log(`Found ${buttons.length} interactive button elements on ${route}`);

      for (let i = 0; i < buttons.length; i++) {
        const btn = buttons[i];
        const isVisible = await btn.isVisible().catch(() => false);
        if (!isVisible) continue;

        const text = (await btn.innerText().catch(() => '')) || (await btn.getAttribute('aria-label').catch(() => '')) || 'Unlabeled Button';
        const tag = await btn.evaluate((el) => el.tagName.toLowerCase()).catch(() => 'button');
        const href = await btn.getAttribute('href').catch(() => null);
        const onclick = await btn.evaluate((el) => el.hasAttribute('onclick') || el.onclick !== null || el.getAttribute('type') === 'submit' || el.tagName === 'A' || el.tagName === 'BUTTON').catch(() => false);

        // Check for broken links
        if (tag === 'a' && (!href || href === '#' || href === 'javascript:void(0)')) {
          issues.push({
            route,
            buttonText: text.trim().replace(/\s+/g, ' '),
            issue: 'Broken or empty href attribute (# or empty)',
          });
        }

        // Click test
        try {
          const prevUrl = page.url();
          await btn.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(300);

          // Check if page threw uncaught error or navigated to 404
          const currentUrl = page.url();
          if (currentUrl.includes('/404') || currentUrl.includes('error')) {
            issues.push({
              route,
              buttonText: text.trim().replace(/\s+/g, ' '),
              issue: `Navigated to 404/Error page: ${currentUrl}`,
            });
          }

          // Return back to route if navigated away
          if (currentUrl !== prevUrl && !currentUrl.includes(route)) {
            await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(500);
          }
        } catch (clickErr) {
          issues.push({
            route,
            buttonText: text.trim().replace(/\s+/g, ' '),
            issue: `Click failed or unhandled rejection: ${clickErr.message}`,
          });
        }
      }
    } catch (routeErr) {
      issues.push({
        route,
        buttonText: 'N/A',
        issue: `Route load failed: ${routeErr.message}`,
      });
    }
  }

  await browser.close();
  vite.kill();

  console.log('\n--- BUTTON TEST SUMMARY ---');
  console.log(`Total Issues Discovered: ${issues.length}`);
  console.log(`Total Console Errors: ${consoleErrors.length}`);

  console.log(JSON.stringify({ issues, consoleErrors }, null, 2));
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error in button test:', err);
  process.exit(1);
});

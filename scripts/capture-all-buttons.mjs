import { chromium } from 'playwright';
import path from 'path';
import { spawn } from 'child_process';

const ARTIFACT_DIR = 'C:/Users/wowbr/.gemini/antigravity/brain/8e632a93-2bbe-4233-a225-cb5734dcbf13';
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
  console.log('Starting local Vite dev server...');
  const vite = spawn('npx.cmd', ['vite', '--port', '3000'], {
    cwd: 'C:/dev/SimpleITSRQ/simpleitsrq-web',
    stdio: 'ignore',
    shell: true,
  });

  const ready = await waitForServer(BASE_URL);
  if (!ready) {
    console.error('Vite dev server failed to start in time.');
    vite.kill();
    process.exit(1);
  }

  console.log('Vite server is live! Starting Playwright screenshot capture...');
  const browser = await chromium.launch({ headless: true });
  
  // Desktop Context
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // 1. Homepage
  console.log('Capturing Homepage...');
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_01_homepage.png'), fullPage: true });

  // 2. Services
  console.log('Capturing Services...');
  await page.goto(`${BASE_URL}/services`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_02_services.png'), fullPage: true });

  // 3. Leadgen (Desktop)
  console.log('Capturing Leadgen (Desktop)...');
  await page.goto(`${BASE_URL}/leadgen`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_03_leadgen_desktop.png'), fullPage: true });

  // 4. Support
  console.log('Capturing Support...');
  await page.goto(`${BASE_URL}/support`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_04_support.png'), fullPage: true });

  // 5. Tools / Recommended Gear
  console.log('Capturing Tools...');
  await page.goto(`${BASE_URL}/tools`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_05_tools.png'), fullPage: true });

  // 6. Admin Ops Portal
  console.log('Capturing Admin Ops Portal...');
  await page.goto(`${BASE_URL}/portal/ops`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_06_admin_ops.png'), fullPage: true });

  // 7. Mobile Leadgen (Phone Viewport 390x844)
  console.log('Capturing Mobile Leadgen...');
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE_URL}/leadgen`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_07_leadgen_mobile.png'), fullPage: true });

  // 8. Mobile Homepage Header & Nav
  console.log('Capturing Mobile Homepage...');
  await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, 'buttons_08_homepage_mobile.png'), fullPage: true });

  await browser.close();
  vite.kill();
  console.log('Successfully captured all screenshots to artifact directory!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Error taking screenshots:', err);
  process.exit(1);
});

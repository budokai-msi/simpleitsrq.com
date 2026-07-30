
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  
  await page.goto('http://localhost:3000/');
  await page.waitForTimeout(2000);

  const navbarElement = await page.locator('.navbar');
  await navbarElement.screenshot({ path: 'C:/Users/wowbr/.gemini/antigravity/brain/8e632a93-2bbe-4233-a225-cb5734dcbf13/navbar_desktop.png' });

  // Use a precise locator
  const servicesBtn = await page.locator('.nav-group-btn').first();
  await servicesBtn.hover(); 
  await page.waitForTimeout(1000);
  
  await navbarElement.screenshot({ path: 'C:/Users/wowbr/.gemini/antigravity/brain/8e632a93-2bbe-4233-a225-cb5734dcbf13/navbar_desktop_mega.png' });

  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(1000);
  
  await navbarElement.screenshot({ path: 'C:/Users/wowbr/.gemini/antigravity/brain/8e632a93-2bbe-4233-a225-cb5734dcbf13/navbar_mobile.png' });
  
  const menuBtn = await page.locator('.menu-btn');
  await menuBtn.click();
  await page.waitForTimeout(1000);
  
  await navbarElement.screenshot({ path: 'C:/Users/wowbr/.gemini/antigravity/brain/8e632a93-2bbe-4233-a225-cb5734dcbf13/navbar_mobile_open.png' });

  await browser.close();
  console.log('Screenshots taken');
})();


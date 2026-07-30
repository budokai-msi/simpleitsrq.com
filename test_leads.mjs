import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    await page.goto('http://localhost:3000/portal/ops');
    await page.waitForTimeout(1000);
    const bodyText = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/portal?action=leads-inbox');
        const text = await res.text();
        return `API RESPONSE: ${res.status} ${text}`;
      } catch (e) {
        return `API ERROR: ${e.message}`;
      }
    });
    console.log(bodyText);
    
    console.log("Checking leads tab rendering...");
    await page.click('text=Leads');
    await page.waitForTimeout(500);
    const tabHtml = await page.evaluate(() => document.querySelector('.admin-leadgen-tab-body').innerHTML);
    console.log("Tab HTML:", tabHtml.substring(0, 500));
  } catch (err) {
    console.error('SCRIPT ERROR:', err);
  } finally {
    await browser.close();
  }
})();

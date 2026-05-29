import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";

const base = process.env.UI_AUDIT_BASE_URL || "http://127.0.0.1:5177";
const outDir =
  process.env.UI_AUDIT_OUT_DIR ||
  "C:/Users/wowbr/AppData/Local/Temp/simpleitsrq-qa/full-ui-audit-2026-05-29";

await fs.mkdir(outDir, { recursive: true });

const routes = [
  "/",
  "/blog",
  "/blog/msp-pricing-sarasota",
  "/services",
  "/book",
  "/support",
  "/tools",
  "/stack",
  "/advertise",
  "/compare",
  "/compare/1password-vs-bitwarden",
  "/why",
  "/why/vs-tampa-msps",
  "/leadgen",
  "/glossary",
  "/glossary/hipaa",
  "/exposure-scan",
  "/password-check",
  "/service-area",
  "/partners",
  "/industries",
  "/sarasota-it-support",
  "/bradenton-it-support",
  "/lakewood-ranch-it-support",
  "/venice-it-support",
  "/medical-it-sarasota",
  "/law-firm-it-venice",
  "/privacy",
  "/terms",
  "/accessibility",
  "/not-a-real-page",
];

const contexts = [
  { name: "desktop-light", width: 1440, height: 900, dark: false },
  { name: "desktop-dark", width: 1440, height: 900, dark: true },
  { name: "mobile-light", width: 390, height: 844, dark: false },
  { name: "mobile-dark", width: 390, height: 844, dark: true },
];

const browser = await chromium.launch({ headless: true });
const results = [];

function safeName(route) {
  return route.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "home";
}

for (const ctx of contexts) {
  const context = await browser.newContext({
    viewport: { width: ctx.width, height: ctx.height },
  });
  const page = await context.newPage();

  for (const route of routes) {
    const entry = { route, context: ctx.name, checks: {}, axe: null, errors: [] };
    try {
      await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(450);
      await page.emulateMedia({ colorScheme: ctx.dark ? "dark" : "light" });

      const hasThemeToggle =
        (await page.locator('.theme-toggle, button[aria-label*="mode"]').count()) > 0;
      if (hasThemeToggle) {
        const label = ctx.dark ? "Switch to light mode" : "Switch to dark mode";
        const btn = page.getByRole("button", { name: label });
        if (await btn.count()) {
          await btn.first().click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(220);
        }
      }

      const snapshot = await page.evaluate(() => {
        const h1Count = document.querySelectorAll("h1").length;
        const buttonCount = document.querySelectorAll("button, [role='button'], a.btn").length;
        const linkCount = document.querySelectorAll("a[href]").length;
        const inputCount = document.querySelectorAll("input, select, textarea").length;
        const doc = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(doc.scrollWidth, body ? body.scrollWidth : 0);
        const overflowX = scrollWidth - window.innerWidth;
        return { h1Count, buttonCount, linkCount, inputCount, overflowX };
      });

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      entry.checks = snapshot;
      entry.axe = {
        violations: axe.violations.length,
        seriousOrWorse: axe.violations.reduce(
          (n, v) => n + (["serious", "critical"].includes(v.impact) ? 1 : 0),
          0,
        ),
        ids: axe.violations
          .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))
          .slice(0, 10),
      };
      entry.flags = {
        missingH1: snapshot.h1Count === 0,
        overflow: snapshot.overflowX > 0,
        noPrimaryActions: snapshot.buttonCount < 1 && route !== "/not-a-real-page",
        a11yRisk: axe.violations.length > 0,
      };

      const shotPath = path.join(outDir, `${ctx.name}__${safeName(route)}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });
      entry.screenshot = shotPath;
    } catch (err) {
      entry.errors.push(String(err?.message || err));
    }
    results.push(entry);
  }

  await context.close();
}

await browser.close();

const summary = {
  total: results.length,
  byContext: Object.fromEntries(
    contexts.map((c) => [c.name, results.filter((r) => r.context === c.name).length]),
  ),
  missingH1: results
    .filter((r) => r.flags?.missingH1)
    .map((r) => ({ route: r.route, context: r.context })),
  overflow: results
    .filter((r) => r.flags?.overflow)
    .map((r) => ({ route: r.route, context: r.context, overflowX: r.checks?.overflowX })),
  a11yViolations: results
    .filter((r) => (r.axe?.violations || 0) > 0)
    .map((r) => ({
      route: r.route,
      context: r.context,
      violations: r.axe.violations,
      seriousOrWorse: r.axe.seriousOrWorse,
    })),
  errors: results.filter((r) => r.errors.length),
};

await fs.writeFile(path.join(outDir, "ui-audit-results.json"), JSON.stringify(results, null, 2));
await fs.writeFile(path.join(outDir, "ui-audit-summary.json"), JSON.stringify(summary, null, 2));

console.log(JSON.stringify({ outDir, summary }, null, 2));

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility smoke test.
 *
 * Visits the five most important user-facing routes and runs axe-core
 * against each. We fail the build for "critical" and "serious" violations
 * and log (but tolerate) "moderate" and "minor" findings so authors can
 * triage incrementally without blocking shipping.
 */
const ROUTES = ['/', '/store', '/blog', '/support', '/book'];

const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

test.describe('a11y smoke', () => {
  for (const route of ROUTES) {
    test(`${route} has no critical or serious a11y violations`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' });

      const results = await new AxeBuilder({ page }).analyze();

      const blocking = results.violations.filter((v) =>
        BLOCKING_IMPACTS.has(v.impact ?? '')
      );
      const advisory = results.violations.filter(
        (v) => !BLOCKING_IMPACTS.has(v.impact ?? '')
      );

      for (const v of advisory) {
        // eslint-disable-next-line no-console
        console.log(
          `[a11y] ${route} advisory (${v.impact}): ${v.id} — ${v.help} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})`
        );
      }

      if (blocking.length > 0) {
        const msg = blocking
          .map(
            (v) =>
              `  - [${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)\n    ${v.helpUrl}`
          )
          .join('\n');
        throw new Error(
          `Accessibility violations on ${route}:\n${msg}`
        );
      }

      expect(blocking).toHaveLength(0);
    });
  }
});

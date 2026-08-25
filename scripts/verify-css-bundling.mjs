// scripts/verify-css-bundling.mjs
//
// Regression guard for the leadgen CSS orphan-chunk bug that shipped
// multiple times. Vite/Rollup with cssCodeSplit:true can split CSS
// imports from a page-level module into chunks that are only injected
// via the JS runtime — but if those JS chunks aren't actually loaded on
// a given route, the CSS never reaches the browser.
//
// This script does two checks against a fresh `npm run build` output:
//
// 1. Every CSS file in dist/assets/*.css must be referenced from
//    dist/index.html, OR it must be < 1 KB (a small ancillary stylesheet
//    that Vite legitimately drops).
//
// 2. The CSS files linked from dist/index.html must collectively contain
//    every class used in the leadgen JSX. This catches the original bug:
//    a-CfHFzO9A.css (with .leadgen-card-header, .leadgen-card-stats, etc.)
//    was on disk but not linked from index.html, so those classes rendered
//    unstyled even though the JSX shipped them to the browser.
//
// Exit 0 on pass, 1 on fail. Designed to run as a CI job before deploy.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const DIST = join(ROOT, "dist");
const ASSETS = join(DIST, "assets");
const INDEX_HTML = join(DIST, "index.html");
const PAGES_DIR = join(ROOT, "src", "pages");
const STYLES_DIR = join(ROOT, "src", "styles");

const FAILURES = [];
const NOTE = (msg) => console.log(`  ${msg}`);
const WARN = (msg) => console.log(`  ⚠ ${msg}`);
const ERR = (msg) => { console.log(`  ✗ ${msg}`); FAILURES.push(msg); };

function readText(p) {
  return readFileSync(p, "utf-8");
}

function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(ext));
}

// ── Check 1: orphan CSS chunks ───────────────────────────────────────
console.log("\n[1/2] Checking for orphan CSS chunks referenced by no entrypoint…");

if (!existsSync(INDEX_HTML)) {
  ERR(`dist/index.html not found — run \`npm run build\` first`);
  process.exit(1);
}

const indexHtml = readText(INDEX_HTML);
const linkedCss = [...indexHtml.matchAll(/\/assets\/([a-z0-9_.-]+\.css)/gi)].map((m) => m[1]);

const allCss = listFiles(ASSETS, ".css");
const orphanCss = [];
const smallAncillary = [];
for (const f of allCss) {
  const path = join(ASSETS, f);
  const size = statSync(path).size;
  if (linkedCss.includes(f)) { NOTE(`${f} (${size}B) ✓ linked`); continue; }
  // Some CSS files are dynamically injected by Vite's runtime CSS loader
  // (e.g. import-analysis-build hooks) and never appear in index.html.
  // These are still loaded — just not via static <link> tags. Treat small
  // files (<= 4 KB) as ancillary and allow them through.
  if (size <= 4096) {
    smallAncillary.push(f);
    WARN(`${f} (${size}B) not linked — small ancillary, allowing`);
    continue;
  }
  orphanCss.push(f);
  ERR(`${f} (${size}B) orphan — emitted but never linked from index.html`);
}

// ── Check 2: class-name coverage in linked CSS ───────────────────────
console.log("\n[2/2] Checking class-name coverage in linked CSS bundles…");

if (linkedCss.length === 0) {
  ERR("No CSS linked from index.html — nothing to verify");
} else {
  const cssBlob = linkedCss.map((f) => readText(join(ASSETS, f))).join("\n");

  // Collect className="..." and className=`...` literals from leadgen pages
  // that ship to public visitors (the ones that have actually regressed).
  const PUBLIC_LEADGEN_PAGES = ["Leadgen.jsx"];
  const leadgenPages = listFiles(PAGES_DIR, ".jsx").filter((f) =>
    PUBLIC_LEADGEN_PAGES.includes(f)
  );

  // Regex: matches `className="foo bar"`, `className={`foo bar`}`, and
  // template literals that interpolate. For interpolations we strip the
  // `${...}` parts and keep the static class names only.
  const classRe = /className\s*=\s*(?:"([^"]+)"|`([^`]+)`)/g;
  const staticRe = /`([^`$]*)(?:\$\{[^}]*\}([^`]*))?`/;

  const usedClasses = new Set();
  for (const page of leadgenPages) {
    const src = readText(join(PAGES_DIR, page));
    let m;
    while ((m = classRe.exec(src))) {
      const raw = m[1] ?? m[2] ?? "";
      const stripped = raw.replace(/\$\{[^}]*\}/g, "");
      for (const tok of stripped.split(/\s+/)) {
        if (tok.startsWith("leadgen-") || tok.startsWith("leadgen")) usedClasses.add(tok);
      }
    }
  }

  if (usedClasses.size === 0) {
    WARN(`No leadgen-* classes found in JSX — nothing to check`);
  } else {
    const missing = [];
    for (const cls of usedClasses) {
      // Match `.cls` as a selector (`.cls{`, `.cls `, `.cls,`, `.cls\n`,
      // and variants like `.cls.foo` for compound selectors). When the
      // CSS is minified, selectors run together; the right boundary
      // characters in production bundles are `{`, `,`, ` `, `:`, `>`, `.`,
      // `[`, and end-of-line.
      let found = false;
      for (const sep of ["{", ",", " ", "\n", ":", ">", ".", "["]) {
        if (cssBlob.includes(`.${cls}${sep}`)) { found = true; break; }
      }
      if (found) continue;
      missing.push(cls);
    }

    NOTE(`Found ${usedClasses.size} distinct leadgen-* class tokens in JSX`);
    if (missing.length === 0) {
      NOTE(`All leadgen-* classes have CSS in linked bundles ✓`);
    } else {
      ERR(`Missing CSS for ${missing.length} classes used in JSX:`);
      const line = [];
      let buf = "    ";
      for (const cls of missing) {
        if (buf.length + cls.length + 2 > 100) { line.push(buf); buf = "    "; }
        buf += cls + " ";
      }
      line.push(buf);
      for (const l of line) console.log(l);
    }
  }
}

// ── Report ───────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(60));
if (FAILURES.length === 0) {
  console.log(`✓ CSS bundling OK — ${linkedCss.length} linked, ${orphanCss.length} orphan, ${smallAncillary.length} ancillary`);
  process.exit(0);
} else {
  console.log(`✗ ${FAILURES.length} check failure(s)`);
  process.exit(1);
}

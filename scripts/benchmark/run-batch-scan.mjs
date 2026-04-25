// scripts/benchmark/run-batch-scan.mjs
//
// Runs the production /exposure-scan engine over a curated cohort of
// domains, writes per-domain results + an aggregate summary to disk.
//
// This is the data-collection step for the quarterly Sarasota Small-
// Business Security Benchmark report. The output of this script feeds
// scripts/benchmark/generate-report.mjs which renders an MDX blog
// post draft with anonymized aggregate stats.
//
// Important boundaries:
//   - The scan itself is the same passive-OSINT call any visitor can
//     run via the public /exposure-scan page. No new data is collected
//     beyond what's already exposed in public DNS + Cert Transparency.
//   - Per-domain results are stored locally in data/benchmark-results/
//     for the operator's reference (so they can send a personalized
//     email to each business). They are NEVER published.
//   - The aggregate summary is what appears in the public report —
//     no domain names, only counts + percentages.
//
// Usage:
//   node scripts/benchmark/run-batch-scan.mjs --cohort dev-test
//   node scripts/benchmark/run-batch-scan.mjs --cohort dental-sarasota
//
// Rate-limiting: 2-second delay between scans so we don't hammer
// Cloudflare DoH or crt.sh. A 25-domain cohort takes ~1 minute end-to-
// end. crt.sh is the slowest leg (~6 sec timeout).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runExposureScan } from "../../api/_lib/exposure.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const COHORTS_DIR = join(__dirname, "cohorts");
const OUTPUT_DIR = join(ROOT, "data", "benchmark-results");

mkdirSync(OUTPUT_DIR, { recursive: true });

const args = process.argv.slice(2);
const cohortIdx = args.indexOf("--cohort");
const cohortName = cohortIdx >= 0 ? args[cohortIdx + 1] : "dev-test";
const cohortPath = join(COHORTS_DIR, `${cohortName}.json`);

if (!existsSync(cohortPath)) {
  console.error(`✗ cohort file not found: ${cohortPath}`);
  console.error(`  available cohorts:`);
  for (const f of (await import("node:fs")).readdirSync(COHORTS_DIR)) {
    console.error(`    - ${f.replace(/\.json$/, "")}`);
  }
  process.exit(1);
}

const cohort = JSON.parse(readFileSync(cohortPath, "utf8"));
const domains = (cohort.domains || []).filter(
  (d) => d && !d.includes("REPLACE_THIS"),
);

if (domains.length === 0) {
  console.error(`✗ cohort "${cohortName}" has no real domains. Edit ${cohortPath} first.`);
  process.exit(1);
}

console.log(`\n=== Benchmark scan: ${cohort.label} ===`);
console.log(`  cohort:  ${cohortName}`);
console.log(`  domains: ${domains.length}`);
console.log(`  intent:  ${cohort.intent}\n`);

const perDomain = [];
const errors = [];

for (let i = 0; i < domains.length; i++) {
  const d = domains[i];
  process.stdout.write(`  [${String(i + 1).padStart(2)}/${domains.length}] ${d.padEnd(40)} `);
  try {
    const t0 = Date.now();
    const result = await runExposureScan(d);
    const ms = Date.now() - t0;
    if (result.ok) {
      perDomain.push({ domain: d, scan: result, durationMs: ms });
      console.log(`${result.grade}  (${ms} ms)`);
    } else {
      errors.push({ domain: d, error: result.error });
      console.log(`SKIP  (${result.error})`);
    }
  } catch (err) {
    errors.push({ domain: d, error: String(err.message || err) });
    console.log(`ERR   (${err.message || err})`);
  }
  // Rate-limit to be a good citizen of public DNS + crt.sh.
  if (i < domains.length - 1) await new Promise((r) => setTimeout(r, 2000));
}

// ---------- Aggregate ----------------------------------------------

const grades = { A: 0, B: 0, C: 0, D: 0, F: 0 };
const findingByArea = {};
const findingBySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
let dmarcMissing = 0, dmarcWeak = 0, spfMissing = 0, spfWeak = 0,
    mxMissing = 0, dkimFound = 0, ipv6Present = 0;
const subdomainCountBuckets = { "0": 0, "1-5": 0, "6-15": 0, "16-30": 0, "30+": 0 };

for (const { scan } of perDomain) {
  grades[scan.grade] = (grades[scan.grade] || 0) + 1;
  for (const f of scan.findings || []) {
    findingByArea[f.area] = (findingByArea[f.area] || 0) + 1;
    findingBySeverity[f.severity] = (findingBySeverity[f.severity] || 0) + 1;
  }
  // Specific control failures (counted once per domain even if a
  // single finding covers multiple — that's how each domain "fails"
  // a category).
  const findings = scan.findings || [];
  if (findings.some((f) => /No MX records/.test(f.title))) mxMissing += 1;
  if (findings.some((f) => /No SPF/.test(f.title))) spfMissing += 1;
  if (findings.some((f) => /SPF exists but doesn't enforce/.test(f.title))) spfWeak += 1;
  if (findings.some((f) => /No DMARC record/.test(f.title))) dmarcMissing += 1;
  if (findings.some((f) => /DMARC is in monitoring mode/.test(f.title))) dmarcWeak += 1;
  if ((scan.records?.dkimSelectors || []).length > 0) dkimFound += 1;
  if ((scan.records?.aaaa || []).length > 0) ipv6Present += 1;

  const subCount = (scan.subdomains || []).length;
  if (subCount === 0) subdomainCountBuckets["0"] += 1;
  else if (subCount <= 5) subdomainCountBuckets["1-5"] += 1;
  else if (subCount <= 15) subdomainCountBuckets["6-15"] += 1;
  else if (subCount <= 30) subdomainCountBuckets["16-30"] += 1;
  else subdomainCountBuckets["30+"] += 1;
}

const n = perDomain.length;
const pct = (count) => n === 0 ? 0 : Math.round((count / n) * 1000) / 10;

const aggregate = {
  cohort: cohortName,
  label: cohort.label,
  publishedQuarter: cohort.publishedQuarter,
  generatedAt: new Date().toISOString(),
  totalScanned: n,
  errors: errors.length,
  grades,
  gradeDistribution: Object.fromEntries(
    Object.entries(grades).map(([g, c]) => [g, { count: c, pct: pct(c) }]),
  ),
  emailAuth: {
    mxMissing:   { count: mxMissing,  pct: pct(mxMissing) },
    spfMissing:  { count: spfMissing, pct: pct(spfMissing) },
    spfWeak:     { count: spfWeak,    pct: pct(spfWeak) },
    dmarcMissing:{ count: dmarcMissing,pct: pct(dmarcMissing) },
    dmarcWeak:   { count: dmarcWeak,   pct: pct(dmarcWeak) },
    dkimFound:   { count: dkimFound,   pct: pct(dkimFound) },
  },
  modernReadiness: {
    ipv6Present: { count: ipv6Present, pct: pct(ipv6Present) },
  },
  subdomainExposure: subdomainCountBuckets,
  findingsBySeverity: findingBySeverity,
  findingsByArea: findingByArea,
};

// ---------- Persist ------------------------------------------------

const stamp = new Date().toISOString().slice(0, 10);
const perDomainPath = join(OUTPUT_DIR, `${cohortName}-${stamp}-per-domain.json`);
const aggregatePath = join(OUTPUT_DIR, `${cohortName}-${stamp}-aggregate.json`);

writeFileSync(perDomainPath, JSON.stringify({ cohort, scans: perDomain, errors }, null, 2));
writeFileSync(aggregatePath, JSON.stringify(aggregate, null, 2));

console.log(`\n=== Done ===`);
console.log(`  scanned:        ${n}`);
console.log(`  errors:         ${errors.length}`);
console.log(`  grade A/B/C/D/F: ${grades.A}/${grades.B}/${grades.C}/${grades.D}/${grades.F}`);
console.log(`  per-domain:     ${perDomainPath.replace(ROOT + "/", "")}`);
console.log(`  aggregate:      ${aggregatePath.replace(ROOT + "/", "")}`);
console.log(`\n  Next: node scripts/benchmark/generate-report.mjs --cohort ${cohortName} --date ${stamp}\n`);

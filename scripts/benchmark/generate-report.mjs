// scripts/benchmark/generate-report.mjs
//
// Reads an aggregate JSON file produced by run-batch-scan.mjs and
// renders an MDX blog-post DRAFT to content/posts/. The draft is
// intentionally an editable starting point — the operator should
// tighten the headline + intro before publishing.
//
// CRITICAL: this script only ever reads the aggregate file (no
// individual domain names). Per-domain data lives in a sibling JSON
// the operator uses for personalized email outreach but never
// publishes.
//
// Usage:
//   node scripts/benchmark/generate-report.mjs --cohort dental-sarasota --date 2026-04-25

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const RESULTS_DIR = join(ROOT, "data", "benchmark-results");
const POSTS_DIR = join(ROOT, "content", "posts");

const args = process.argv.slice(2);
const cohort = args[args.indexOf("--cohort") + 1] || "dev-test";
const date = args[args.indexOf("--date") + 1] || new Date().toISOString().slice(0, 10);

const aggregatePath = join(RESULTS_DIR, `${cohort}-${date}-aggregate.json`);
if (!existsSync(aggregatePath)) {
  console.error(`✗ aggregate not found: ${aggregatePath}`);
  console.error(`  run: node scripts/benchmark/run-batch-scan.mjs --cohort ${cohort}`);
  process.exit(1);
}

const a = JSON.parse(readFileSync(aggregatePath, "utf8"));
const quarter = a.publishedQuarter || `${new Date().getUTCFullYear()}-Q${Math.ceil((new Date().getUTCMonth() + 1) / 3)}`;
const slug = `florida-small-business-security-benchmark-${cohort}-${quarter.toLowerCase()}`;
const title = `Florida Small-Business Security Benchmark — ${a.label} (${quarter})`;

// Headline number for the metaDescription / excerpt — pick the most
// dramatic single stat from emailAuth that has the highest %.
const dramaticStat = (() => {
  const candidates = [
    { key: "dmarcMissing",  copy: `${a.emailAuth.dmarcMissing.pct}% have no DMARC record at all` },
    { key: "spfMissing",    copy: `${a.emailAuth.spfMissing.pct}% have no SPF record` },
    { key: "mxMissing",     copy: `${a.emailAuth.mxMissing.pct}% can't even receive email` },
    { key: "dmarcWeak",     copy: `${a.emailAuth.dmarcWeak.pct}% have DMARC set to monitoring-only (no real protection)` },
  ].filter((c) => a.emailAuth[c.key].pct > 0)
    .sort((x, y) => a.emailAuth[y.key].pct - a.emailAuth[x.key].pct);
  return candidates[0]?.copy || `every domain we scanned passed at least one critical check`;
})();

const today = new Date().toISOString().slice(0, 10);

const body = `---
slug: "${slug}"
title: "${title.replace(/"/g, '\\"')}"
metaDescription: "We ran our free Exposure Scan against ${a.totalScanned} ${a.label.toLowerCase()}. ${dramaticStat}. The full breakdown — and what to do about it — below."
date: "${today}"
author: "Simple IT SRQ Team"
category: "Cybersecurity"
tags:
  - benchmark
  - florida
  - sarasota
  - bradenton
  - email-security
  - compliance
excerpt: "We scanned ${a.totalScanned} ${a.label.toLowerCase()} with the same passive-OSINT engine that powers our free Exposure Scan. Aggregate findings — no individual business named — show that ${dramaticStat.toLowerCase()}. Here's what the cohort got right, where the gaps are, and the remediation path that takes most offices from F to C in two weeks."
heroAlt: "An aggregate report card showing the security grade distribution across Sarasota-area small businesses for ${quarter}."
---

## What we did

In ${quarter} we ran our [free Exposure Scan](/exposure-scan) against ${a.totalScanned} websites in our ${a.label.toLowerCase().replace(/^.+ — /, "")} cohort. The same passive checks any visitor can run on a single domain — DNS lookups via Cloudflare DoH, public Certificate Transparency log search, common DKIM-selector probing — repeated at batch scale.

Every business in this cohort was contacted privately by email with their individual results. **No individual business is named in this public report.** Only aggregate counts and percentages. That's the deal.

## The grade distribution

Out of ${a.totalScanned} domains scanned:

| Grade | Count | % of cohort | What it means |
|---|---:|---:|---|
| **A** | ${a.gradeDistribution.A.count} | ${a.gradeDistribution.A.pct}% | Email auth + modern hygiene fully in place. |
| **B** | ${a.gradeDistribution.B.count} | ${a.gradeDistribution.B.pct}% | Basics covered. A few quality tweaks remaining. |
| **C** | ${a.gradeDistribution.C.count} | ${a.gradeDistribution.C.pct}% | One important gap in email authentication. |
| **D** | ${a.gradeDistribution.D.count} | ${a.gradeDistribution.D.pct}% | Multiple weak controls — convincingly spoofable. |
| **F** | ${a.gradeDistribution.F.count} | ${a.gradeDistribution.F.pct}% | Critical exposure — a real attacker would notice. |

## Email authentication — where the cohort is weakest

Email is where Florida small businesses get hit hardest in 2026. Cyber-insurance carriers ask about every one of the controls below on the renewal questionnaire. Here's how the cohort scored:

- **${a.emailAuth.mxMissing.pct}%** can't receive email at all — no MX records (${a.emailAuth.mxMissing.count} domains).
- **${a.emailAuth.spfMissing.pct}%** have no SPF record. Anyone in the world can spoof their domain.
- **${a.emailAuth.spfWeak.pct}%** have an SPF record but it's set to soft-fail or no-fail — effectively worthless.
- **${a.emailAuth.dmarcMissing.pct}%** have no DMARC record at all.
- **${a.emailAuth.dmarcWeak.pct}%** have DMARC at \`p=none\` — monitoring only, no actual blocking.
- **${a.emailAuth.dkimFound.pct}%** have at least one detectable DKIM signing key (we probed 15 common selectors).

For Florida medical, legal, and financial offices specifically, missing DMARC is the single most common reason a phishing email lands in your client's inbox claiming to be you. We see it nearly every onboarding.

## Subdomain exposure (Certificate Transparency)

Every TLS certificate ever issued for a domain is logged publicly in CT logs. We pulled the public list per domain and bucketed:

| Subdomains visible | Domains | % of cohort |
|---|---:|---:|
| 0 (or only the root) | ${a.subdomainExposure["0"]} | ${pct(a.subdomainExposure["0"], a.totalScanned)}% |
| 1–5 | ${a.subdomainExposure["1-5"]} | ${pct(a.subdomainExposure["1-5"], a.totalScanned)}% |
| 6–15 | ${a.subdomainExposure["6-15"]} | ${pct(a.subdomainExposure["6-15"], a.totalScanned)}% |
| 16–30 | ${a.subdomainExposure["16-30"]} | ${pct(a.subdomainExposure["16-30"], a.totalScanned)}% |
| 30+ | ${a.subdomainExposure["30+"]} | ${pct(a.subdomainExposure["30+"], a.totalScanned)}% |

The 16+ category is where attackers find soft targets. Old staging sites, abandoned admin portals, forgotten test domains — every one is a potential entry point.

## Modern readiness

- **${a.modernReadiness.ipv6Present.pct}%** of cohort sites have IPv6 (AAAA) records. The majority don't — cosmetic, not a security issue, but it's the cleanest single signal of an actively maintained DNS configuration.

## What to do if your business is in this cohort

If you're in this cohort, you got a personal email from us this week with your specific findings. The fix paths are usually one of three:

1. **Missing MX** — set up Cloudflare Email Routing or ImprovMX. Free, ~10 minutes. Gets you a working inbox.
2. **Weak SPF + missing DMARC** — add the right TXT records, then run DMARC at \`p=none\` for 2-4 weeks of monitoring before tightening to \`p=quarantine\`. Requires that you actually know who sends mail on your behalf (Google Workspace, Mailchimp, your CRM, etc.).
3. **Subdomain sprawl** — audit what's actually live, take down anything that doesn't need to be public, put internal tools behind auth.

Most offices we onboard go from a Grade F to a Grade C in two weeks of cleanup, and to a Grade A within 90 days once DMARC is fully enforcing.

## Run your own scan

Don't wait for the next quarterly report. The same engine that produced these stats is available right now:

[**Run a free passive scan of your domain →**](/exposure-scan)

Takes 10 seconds. No signup. We'll send you the personalized findings + a remediation path tailored to your specific gaps.

---

*This is the ${quarter} edition of our quarterly Florida Small-Business Security Benchmark. The next edition (${nextQuarter(quarter)}) will cover a different vertical. If you want your industry / city included, [tell us](/book).*

*Methodology: passive OSINT only — DNS lookups via Cloudflare DoH, Certificate Transparency log search via crt.sh, common DKIM-selector probing. No port scanning, no authenticated requests, nothing that touches the targets' servers. Same checks any visitor can run on a single domain via our public [Exposure Scan](/exposure-scan).*
`;

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}
function nextQuarter(q) {
  const m = q.match(/^(\d{4})-Q([1-4])$/);
  if (!m) return q;
  let year = Number(m[1]);
  let qn = Number(m[2]) + 1;
  if (qn > 4) { qn = 1; year += 1; }
  return `${year}-Q${qn}`;
}

mkdirSync(POSTS_DIR, { recursive: true });
const outPath = join(POSTS_DIR, `${slug}.mdx`);
writeFileSync(outPath, body);
console.log(`✓ wrote ${outPath.replace(ROOT + "/", "")}`);
console.log(`  Edit, regen prebuild artifacts (npm run prebuild), then commit + push to publish.`);

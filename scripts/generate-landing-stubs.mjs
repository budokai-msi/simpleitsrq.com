#!/usr/bin/env node
// Per-city / per-industry static stub generator. Runs after `vite build`
// (chained in package.json "build" after generate-blog-stubs.mjs).
//
// WHY THIS EXISTS:
// The city landing pages (/sarasota-it-support) and industry landing pages
// (/medical-it-sarasota) are pure client-side React. When Googlebot or the
// AdSense reviewer fetches them with JS disabled they get the same 742-word
// SPA shell as every other route — zero of the unique copy (the intro, the
// local patterns, the emphasis bullets, the FAQs). That made 38 pages look
// like near-duplicate empty shells, which is exactly what Google's
// "low value content" / "thin content" AdSense flag is about.
//
// This script clones dist/index.html for every city + industry landing URL
// and patches:
//   - <title>, <meta name="description">, <link rel="canonical">, og:*
//   - injects the page's unique content as static HTML inside #root
//   - injects LocalBusiness / Service / FAQ JSON-LD
//
// The React SPA still hydrates on top, so real users get the same experience
// — but crawlers that don't run JS now see 1,500+ words of unique, relevant
// content per page instead of a bare shell.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cities, cityList } from "../src/data/cities.js";
import { industries, industryCityPairs, matchIndustryPattern } from "../src/data/industries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");
const SHELL = path.join(DIST, "index.html");
const SITE_URL = "https://simpleitsrq.com";

const escAttr = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const escText = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// ---------- City landing page ----------

function renderCityBody(city) {
  const patterns = (city.localPatterns || [])
    .map(
      (p) => `
      <div style="border:1px solid #e5e7eb;border-left:4px solid #111827;border-radius:8px;padding:16px 18px;margin:12px 0;background:#f9fafb">
        <h3 style="margin:0 0 6px;font-size:1.05rem">${escText(p.title)}</h3>
        <p style="margin:0;line-height:1.6">${escText(p.body)}</p>
      </div>`,
    )
    .join("");

  const whyLocal = (city.whyLocal || [])
    .map((w) => `<li style="margin:6px 0">${escText(w)}</li>`)
    .join("");

  const faqs = (city.faqs || [])
    .map(
      (f) => `
      <details style="padding:14px 18px;border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;background:#fff">
        <summary style="cursor:pointer;font-weight:600">${escText(f.q)}</summary>
        <p style="margin:10px 0 0;line-height:1.6;color:#4b5563">${escText(f.a)}</p>
      </details>`,
    )
    .join("");

  return `
    <article class="static-landing-article" data-prerendered="true">
      <header>
        <h1>${escText(city.h1 || `${city.city} IT Support`)}</h1>
        ${city.intro ? `<p style="font-size:1.1rem;line-height:1.6">${escText(city.intro)}</p>` : ""}
      </header>
      ${city.servicesIntro ? `<p style="line-height:1.6">${escText(city.servicesIntro)}</p>` : ""}
      ${patterns ? `<h2>How we work with ${escText(city.city)} businesses</h2>${patterns}` : ""}
      ${whyLocal ? `<h2>Why local ${escText(city.city)} businesses choose us</h2><ul>${whyLocal}</ul>` : ""}
      ${faqs ? `<h2>Frequently asked — ${escText(city.city)}</h2>${faqs}` : ""}
    </article>
  `;
}

function buildCityLd(city, url) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}${url}#business`,
    name: `Simple IT SRQ - ${city.city}`,
    url: `${SITE_URL}${url}`,
    email: "hello@simpleitsrq.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: city.city,
      addressRegion: "FL",
      addressCountry: "US",
      ...(city.postalCode ? { postalCode: city.postalCode } : {}),
    },
    areaServed: city.city,
    priceRange: "$$",
    description: city.metaDescription,
    ...(typeof city.lat === "number" && typeof city.lng === "number"
      ? { geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng } }
      : {}),
  };
}

function buildCityFaqLd(city) {
  if (!Array.isArray(city.faqs) || city.faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: city.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// ---------- Industry landing page ----------

function renderIndustryBody(industry, city, pattern) {
  const emphasis = (industry.emphasis || [])
    .map((e) => `<li style="margin:6px 0">${escText(e)}</li>`)
    .join("");

  const faqs = (industry.faqs || [])
    .map(
      (f) => `
      <details style="padding:14px 18px;border:1px solid #e5e7eb;border-radius:8px;margin:10px 0;background:#fff">
        <summary style="cursor:pointer;font-weight:600">${escText(f.q)}</summary>
        <p style="margin:10px 0 0;line-height:1.6;color:#4b5563">${escText(f.a)}</p>
      </details>`,
    )
    .join("");

  return `
    <article class="static-landing-article" data-prerendered="true">
      <header>
        <h1>${escText(industry.h1Prefix)} <span>in ${escText(city.city)}</span></h1>
        ${industry.intro ? `<p style="font-size:1.1rem;line-height:1.6">${escText(industry.intro)}</p>` : ""}
      </header>
      ${pattern ? `
        <h2>What we deliver for ${escText(industry.displayName.toLowerCase())} in ${escText(city.city)}</h2>
        <div style="border:1px solid #e5e7eb;border-left:4px solid #111827;border-radius:8px;padding:16px 18px;margin:12px 0;background:#f9fafb">
          <h3 style="margin:0 0 6px;font-size:1.05rem">${escText(pattern.title)}</h3>
          <p style="margin:0;line-height:1.6">${escText(pattern.body)}</p>
        </div>` : ""}
      ${emphasis ? `<h2>Where we focus for this industry</h2><ul>${emphasis}</ul>` : ""}
      ${faqs ? `<h2>Frequently asked — ${escText(industry.displayName.toLowerCase())}</h2>${faqs}` : ""}
    </article>
  `;
}

function buildIndustryLd(industry, city, url) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${SITE_URL}${url}#business`,
    name: `Simple IT SRQ - ${industry.displayName} in ${city.city}`,
    url: `${SITE_URL}${url}`,
    email: "hello@simpleitsrq.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: city.city,
      addressRegion: "FL",
      addressCountry: "US",
      ...(city.postalCode ? { postalCode: city.postalCode } : {}),
    },
    areaServed: city.city,
    priceRange: "$$",
    description: `${industry.displayName} IT support in ${city.city} - ${industry.serviceType}. ${city.metaDescription}`,
    ...(typeof city.lat === "number" && typeof city.lng === "number"
      ? { geo: { "@type": "GeoCoordinates", latitude: city.lat, longitude: city.lng } }
      : {}),
  };
}

function buildIndustryFaqLd(industry) {
  if (!Array.isArray(industry.faqs) || industry.faqs.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: industry.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

// ---------- Shared shell patching ----------

function injectStaticContent(html, content) {
  if (!content) return html;
  if (/<div\s+id="root"\s*><\/div>/.test(html)) {
    return html.replace(/<div\s+id="root"\s*><\/div>/, `<div id="root">${content}</div>`);
  }
  return html.replace(/<body([^>]*)>/, `<body$1>${content}`);
}

function patchHead(shell, { url, title, description, ogImage, ldBlocks }) {
  let html = shell;

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escText(title)}</title>`);
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${escAttr(description)}" />`,
  );
  html = html.replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`);
  html = html.replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`);
  html = html.replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escAttr(title)}" />`);
  html = html.replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escAttr(description)}" />`);
  if (ogImage) {
    html = html.replace(/<meta\s+property="og:image"\s+content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${escAttr(ogImage)}" />`);
    html = html.replace(/<meta\s+name="twitter:image"\s+content="[^"]*"\s*\/?>/, `<meta name="twitter:image" content="${escAttr(ogImage)}" />`);
  }

  const ldScripts = (ldBlocks || [])
    .filter(Boolean)
    .map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`)
    .join("\n    ");
  if (ldScripts) {
    html = html.replace(/<\/head>/, `    ${ldScripts}\n  </head>`);
  }

  return html;
}

function writeStub(url, html) {
  const clean = url.replace(/^\//, "").replace(/\/$/, "");
  const flatPath = path.join(DIST, `${clean}.html`);
  const dirPath = path.join(DIST, clean, "index.html");
  fs.mkdirSync(path.dirname(flatPath), { recursive: true });
  fs.mkdirSync(path.dirname(dirPath), { recursive: true });
  fs.writeFileSync(flatPath, html, "utf8");
  fs.writeFileSync(dirPath, html, "utf8");
}

// ---------- Main ----------

function main() {
  if (!fs.existsSync(SHELL)) {
    console.error(`generate-landing-stubs: ${SHELL} missing — run 'vite build' first.`);
    process.exit(1);
  }
  const shell = fs.readFileSync(SHELL, "utf8");
  let written = 0;

  // City landing pages
  for (const city of cityList) {
    const url = `/${city.slug}`;
    const title = city.title || `${city.city} IT Support | Simple IT SRQ`;
    const description = city.metaDescription || city.intro || "";
    const ogImage = `${SITE_URL}/og-city-${city.slug}.png`;
    const html = patchHead(shell, {
      url: `${SITE_URL}${url}`,
      title,
      description,
      ogImage,
      ldBlocks: [buildCityLd(city, url), buildCityFaqLd(city)],
    });
    writeStub(url, injectStaticContent(html, renderCityBody(city)));
    written++;
  }

  // Industry landing pages
  for (const pair of industryCityPairs(cities)) {
    const { industry, city, url } = pair;
    const pattern = matchIndustryPattern(industry, city);
    const title = `${industry.displayName} IT Support in ${city.city} | Simple IT SRQ`;
    const description = `${industry.displayName} IT support in ${city.city}, FL. ${industry.intro.slice(0, 140)}…`;
    const ogImage = `${SITE_URL}/og-industry-${industry.slug}-${pair.cityKey}.png`;
    const html = patchHead(shell, {
      url: `${SITE_URL}${url}`,
      title,
      description,
      ogImage,
      ldBlocks: [buildIndustryLd(industry, city, url), buildIndustryFaqLd(industry)],
    });
    writeStub(url, injectStaticContent(html, renderIndustryBody(industry, city, pattern)));
    written++;
  }

  console.log(`generate-landing-stubs: wrote ${written} landing pages (${cityList.length} city + ${written - cityList.length} industry)`);

  // Sentinel for prod debug: confirms postbuild output reaches deployed dist
  fs.writeFileSync(path.join(DIST, "_landing_sentinel.txt"), `built ${new Date().toISOString()}\n${written} landing pages\n`, "utf8");
}

main();

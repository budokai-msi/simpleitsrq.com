#!/usr/bin/env node
// SEO + meta + backlinks audit for the blog corpus.
//
// Checks per-post:
//   - title          (≤ 60 chars ideal, hard fail > 70)
//   - metaDescription (120-160 ideal, hard fail < 50 or > 200)
//   - excerpt         (1-2 sentences, ≤ 250)
//   - tags            (3-8 ideal)
//   - canonical-able slug
//   - presence of at least one internal link (/blog or /service area)
//   - presence of at least one CTA link (/store, /book, /#contact, /tools)
//   - heading hierarchy (no h1 inside body — frontmatter title becomes h1)
//   - publishDate / date present
//
// Run: node scripts/audit-seo.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, "..", "content", "posts");

function parseFrontmatter(src) {
  // Normalize CRLF early so all line-anchored matching works regardless
  // of how git served the file.
  src = src.replace(/\r\n/g, "\n");
  if (!src.startsWith("---")) return { fm: {}, body: src };
  const end = src.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, body: src };
  const block = src.slice(3, end);
  const body = src.slice(end + 4);
  const fm = {};
  const lines = block.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!m) { i++; continue; }
    const key = m[1];
    let v = m[2].trim();
    // multiline YAML list: blank value, followed by "  - x" lines
    if (v === "") {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, "").trim());
        j++;
      }
      if (items.length) {
        fm[key] = items;
        i = j;
        continue;
      }
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (v.startsWith("[") && v.endsWith("]")) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    }
    fm[key] = v;
    i++;
  }
  return { fm, body };
}

const PROBLEMS = {
  E_TITLE_MISSING:        "title missing",
  E_TITLE_TOO_LONG:       "title > 70 chars",
  W_TITLE_LONG:           "title > 60 chars",
  E_META_MISSING:         "metaDescription missing",
  E_META_TOO_SHORT:       "metaDescription < 50 chars",
  E_META_TOO_LONG:        "metaDescription > 200 chars",
  W_META_NOT_IDEAL:       "metaDescription not in 120-160",
  E_SLUG_MISSING:         "slug missing",
  W_EXCERPT_MISSING:      "excerpt missing",
  W_TAGS_MISSING:         "tags missing",
  W_TAGS_TOO_FEW:         "tags < 3",
  W_TAGS_TOO_MANY:        "tags > 8",
  E_DATE_MISSING:         "date/publishDate missing",
  W_NO_INTERNAL_LINK:     "no internal link to /blog/* or /sarasota etc.",
  W_NO_CTA_LINK:          "no CTA link (/store, /book, /#contact, /tools, /portal)",
  W_HAS_BODY_H1:          "body uses # h1 (should start at h2)",
};

function audit(filename, src) {
  const { fm, body } = parseFrontmatter(src);
  const issues = [];
  const add = (k) => issues.push(k);

  const title = String(fm.title || "");
  if (!title) add("E_TITLE_MISSING");
  else if (title.length > 70) add("E_TITLE_TOO_LONG");
  else if (title.length > 60) add("W_TITLE_LONG");

  const meta = String(fm.metaDescription || fm.description || "");
  if (!meta) add("E_META_MISSING");
  else if (meta.length < 50) add("E_META_TOO_SHORT");
  else if (meta.length > 200) add("E_META_TOO_LONG");
  else if (meta.length < 120 || meta.length > 160) add("W_META_NOT_IDEAL");

  if (!fm.slug) add("E_SLUG_MISSING");
  if (!fm.excerpt) add("W_EXCERPT_MISSING");

  const tags = Array.isArray(fm.tags) ? fm.tags : (fm.tags ? [fm.tags] : []);
  if (!tags.length) add("W_TAGS_MISSING");
  else if (tags.length < 3) add("W_TAGS_TOO_FEW");
  else if (tags.length > 8) add("W_TAGS_TOO_MANY");

  if (!fm.publishDate && !fm.date && !fm.published) add("E_DATE_MISSING");

  // Body link analysis. /sarasota, /bradenton, /venice etc. count as
  // internal "service area" backlinks, /blog/... as content backlinks.
  const internal = /\]\((\/(?:blog|sarasota|bradenton|venice|nokomis|lakewood-ranch|industries|service-area|glossary)[^\)]*)\)/i.test(body);
  if (!internal) add("W_NO_INTERNAL_LINK");

  const cta = /\]\((\/(?:store|book|tools|portal|#contact|contact)[^\)]*)\)/i.test(body);
  if (!cta) add("W_NO_CTA_LINK");

  if (/^# /m.test(body)) add("W_HAS_BODY_H1");

  return { filename, fm, body, issues, title, metaLen: meta.length, tagCount: tags.length };
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  const results = files.map((f) => audit(f, fs.readFileSync(path.join(POSTS_DIR, f), "utf8")));

  const errCount = results.filter((r) => r.issues.some((k) => k.startsWith("E_"))).length;
  const warnCount = results.filter((r) => r.issues.some((k) => k.startsWith("W_"))).length;

  // Group by problem code so the fix-pass can target each one
  const byProblem = {};
  for (const r of results) {
    for (const k of r.issues) {
      (byProblem[k] = byProblem[k] || []).push(r.filename);
    }
  }
  const problemEntries = Object.entries(byProblem).sort((a, b) => b[1].length - a[1].length);

  console.log(`\nSEO audit — ${results.length} posts: ${errCount} with errors, ${warnCount} with warnings\n`);
  console.log("By problem (most common first):\n");
  for (const [code, files] of problemEntries) {
    const isErr = code.startsWith("E_");
    console.log(`${isErr ? "❌" : "⚠ "} ${code.padEnd(22)} ${PROBLEMS[code].padEnd(45)} ${files.length} posts`);
  }

  console.log(`\nTop 15 worst posts:\n`);
  results.sort((a, b) => b.issues.length - a.issues.length);
  for (const r of results.slice(0, 15)) {
    if (!r.issues.length) break;
    console.log(`  ${String(r.issues.length).padStart(2)} issues  ${r.filename}`);
    console.log(`            ${r.issues.join(", ")}`);
  }
}

main();

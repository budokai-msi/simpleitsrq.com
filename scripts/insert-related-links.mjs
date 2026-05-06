#!/usr/bin/env node
// Auto-insert a "Related reading" footer to any post that has no internal
// /blog/* link in its body. Picks the 3 best-matching posts by tag-overlap
// (Jaccard similarity), or falls back to category match.
//
// Run: node scripts/insert-related-links.mjs           (dry)
//      node scripts/insert-related-links.mjs --write   (apply)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, "..", "content", "posts");
const WRITE = process.argv.includes("--write");

function parseFm(src) {
  src = src.replace(/\r\n/g, "\n");
  if (!src.startsWith("---")) return { fm: {}, body: src, raw: src };
  const end = src.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, body: src, raw: src };
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
    if (v === "") {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s+-\s+/.test(lines[j])) {
        items.push(lines[j].replace(/^\s+-\s+/, "").replace(/^["']|["']$/g, "").trim());
        j++;
      }
      if (items.length) { fm[key] = items; i = j; continue; }
    }
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    fm[key] = v;
    i++;
  }
  return { fm, body, raw: src };
}

function jaccard(a, b) {
  if (!a?.length || !b?.length) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function loadAll() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  return files.map((f) => {
    const { fm, body, raw } = parseFm(fs.readFileSync(path.join(POSTS_DIR, f), "utf8"));
    return {
      file: f,
      slug: fm.slug || f.replace(/\.mdx$/, ""),
      title: fm.title || "",
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      category: fm.category || "",
      body,
      raw,
    };
  });
}

function pickRelated(target, all, n = 3) {
  const scored = all
    .filter((p) => p.slug !== target.slug && p.title)
    .map((p) => ({
      ...p,
      score:
        jaccard(target.tags, p.tags) * 10 +
        (p.category && p.category === target.category ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  // Need at least one positive-score match; fall back to category-only if none
  return scored.slice(0, n).filter((p) => p.score > 0);
}

function buildSection(related) {
  if (!related.length) return "";
  const items = related.map((p) => `- [${p.title}](/blog/${p.slug})`).join("\n");
  // Prefixed with single-newline + blank-line so it merges cleanly
  // even if the post doesn't end with a trailing newline.
  return `\n\n## Related reading\n\n${items}\n`;
}

function hasInternal(body) {
  return /\]\((\/(?:blog|sarasota|bradenton|venice|nokomis|lakewood-ranch|industries|service-area|glossary)[^\)]*)\)/i.test(body);
}

function main() {
  const all = loadAll();
  const targets = all.filter((p) => !hasInternal(p.body));
  console.log(`${targets.length} posts have no internal link.\n`);

  let written = 0;
  for (const t of targets) {
    const rel = pickRelated(t, all);
    if (!rel.length) {
      console.log(`  skip (no related): ${t.file}`);
      continue;
    }
    const section = buildSection(rel);
    const newRaw = t.raw.replace(/\s*$/, "") + section;
    if (newRaw === t.raw) continue;
    if (WRITE) {
      fs.writeFileSync(path.join(POSTS_DIR, t.file), newRaw, "utf8");
    }
    written++;
    console.log(`  ${WRITE ? "wrote" : "would write"}: ${t.file}`);
    for (const r of rel) console.log(`     → ${r.title}  (score ${r.score.toFixed(2)})`);
  }
  console.log(`\n${WRITE ? "Wrote" : "Would write"} ${written} files.`);
  if (!WRITE) console.log("Re-run with --write to apply.");
}

main();

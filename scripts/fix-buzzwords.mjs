#!/usr/bin/env node
// Buzzword scrubber. Targets a small allowlist of high-confidence
// AI-tells where a 1:1 replacement is safe in essentially every
// English context. Anything ambiguous is left alone for a human pass.
//
// Run: node scripts/fix-buzzwords.mjs           (dry)
//      node scripts/fix-buzzwords.mjs --write   (apply)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, "..", "content", "posts");
const WRITE = process.argv.includes("--write");

// [pattern, replacement, label]. Patterns are case-insensitive but the
// replacement preserves leading capital if the matched first char was
// uppercase. Replacements chosen to be drop-in safe.
const SUBS = [
  [/\bleverages?\b/gi, "uses", "leverage"],
  [/\bleveraged\b/gi, "used", "leveraged"],
  [/\bleveraging\b/gi, "using", "leveraging"],
  [/\bbest[- ]in[- ]class\b/gi, "good", "best-in-class"],
  [/\bcutting[- ]edge\b/gi, "modern", "cutting-edge"],
  [/\bstate[- ]of[- ]the[- ]art\b/gi, "modern", "state-of-the-art"],
  [/\bof utmost importance\b/gi, "important", "of utmost importance"],
  [/\bparamount\b/gi, "important", "paramount"],
  [/\bseamlessly\b/gi, "cleanly", "seamlessly"],
  [/\bseamless\b/gi, "clean", "seamless"],
  [/\bdelve into\b/gi, "look at", "delve into"],
  [/\bin essence\b/gi, "basically", "in essence"],
  [/\bplethora of\b/gi, "lot of", "plethora of"],
  [/\bmyriad of\b/gi, "lot of", "myriad of"],
  [/\bunparalleled\b/gi, "strong", "unparalleled"],
  [/\bsynergy\b/gi, "fit", "synergy"],
];

function preserveCase(orig, replacement) {
  if (!orig || !replacement) return replacement;
  const c = orig[0];
  if (c >= "A" && c <= "Z") return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function maskRegions(src) {
  const masks = [];
  let masked = src;
  if (masked.startsWith("---")) {
    const end = masked.indexOf("\n---", 3);
    if (end > 0) {
      const stop = end + 4;
      masks.push({ start: 0, end: stop, text: masked.slice(0, stop) });
      masked = "\u0000".repeat(stop) + masked.slice(stop);
    }
  }
  for (const m of [...masked.matchAll(/```[\s\S]*?```/g)]) {
    masks.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    masked = masked.slice(0, m.index) + "\u0000".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  for (const m of [...masked.matchAll(/`[^`\n]+`/g)]) {
    masks.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    masked = masked.slice(0, m.index) + "\u0000".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }
  return { masked, masks };
}

function unmask(masked, masks) {
  let out = masked;
  for (const m of masks) {
    out = out.slice(0, m.start) + m.text + out.slice(m.end);
  }
  return out;
}

function fix(src) {
  const { masked, masks } = maskRegions(src);
  let body = masked;
  const hits = {};
  for (const [re, rep, label] of SUBS) {
    body = body.replace(re, (m) => {
      hits[label] = (hits[label] || 0) + 1;
      return preserveCase(m, rep);
    });
  }
  return { out: unmask(body, masks), hits };
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  let totalFiles = 0;
  let totalSubs = 0;
  for (const f of files) {
    const p = path.join(POSTS_DIR, f);
    const src = fs.readFileSync(p, "utf8");
    const { out, hits } = fix(src);
    if (out === src) continue;
    const n = Object.values(hits).reduce((a, b) => a + b, 0);
    totalFiles++;
    totalSubs += n;
    const summary = Object.entries(hits).map(([k, v]) => `${k}×${v}`).join(", ");
    if (WRITE) {
      fs.writeFileSync(p, out, "utf8");
      console.log(`fixed ${f}  (${summary})`);
    } else {
      console.log(`would fix ${f}  (${summary})`);
    }
  }
  console.log(`\n${WRITE ? "Wrote" : "Would write"} ${totalFiles} files, ${totalSubs} total substitutions.`);
  if (!WRITE) console.log("Re-run with --write to apply.");
}

main();

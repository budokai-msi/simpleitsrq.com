#!/usr/bin/env node
// De-em-dasher. Walks every .mdx in content/posts and replaces em-dashes
// (—) with either a period or a comma based on what comes next:
//   "X — Y"   → if Y starts capital → "X. Y" (sentence break)
//             → if Y starts lowercase → "X, Y" (clause separator)
//   "X—Y" (no spaces) → "X-Y" (hyphenated compound)
//
// Skips:
//   - YAML frontmatter (between leading --- pairs)
//   - Fenced code blocks (``` ... ```)
//   - Inline code (`...`)
//
// Run with: node scripts/fix-em-dashes.mjs        (dry run)
//           node scripts/fix-em-dashes.mjs --write (apply)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, "..", "content", "posts");
const WRITE = process.argv.includes("--write");

function maskRegions(src) {
  // Replace protected regions with same-length placeholders so offsets
  // stay aligned, then unmask after edits.
  const masks = [];
  let masked = src;

  // Frontmatter
  if (masked.startsWith("---")) {
    const end = masked.indexOf("\n---", 3);
    if (end > 0) {
      const stop = end + 4;
      masks.push({ start: 0, end: stop, text: masked.slice(0, stop) });
      masked = "\u0000".repeat(stop) + masked.slice(stop);
    }
  }

  // Fenced code blocks
  for (const m of [...masked.matchAll(/```[\s\S]*?```/g)]) {
    masks.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
    masked = masked.slice(0, m.index) + "\u0000".repeat(m[0].length) + masked.slice(m.index + m[0].length);
  }

  // Inline code
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
  let count = 0;

  // Pattern A: " — " (spaced em-dash, by far the most common)
  // Replace with ". " if next non-space char is capital; ", " otherwise.
  body = body.replace(/\s—\s/g, (_m, _o, _s) => {
    count++;
    return "::EMDASH_SPACED::";
  });

  // Pattern B: "—" with no surrounding space → range or compound
  body = body.replace(/(\w)—(\w)/g, (_m, a, b) => {
    count++;
    return `${a}-${b}`;
  });

  // Pattern C: leading-em-dash dialogue/quote attribution → comma+space
  body = body.replace(/^—\s/gm, () => {
    count++;
    return "- ";
  });

  // Pattern D: trailing/orphan em-dash (parenthetical) →  comma
  body = body.replace(/—/g, () => {
    count++;
    return ",";
  });

  // Now resolve each placeholder by looking at the next non-space char.
  body = body.replace(/::EMDASH_SPACED::(\s*)([^\s])/g, (_m, ws, ch) => {
    if (/[A-Z]/.test(ch)) return `. ${ws}${ch}`;
    if (/[0-9]/.test(ch)) return `. ${ws}${ch}`;
    return `, ${ws}${ch}`;
  });
  // Stragglers (em-dash at end of paragraph):
  body = body.replace(/::EMDASH_SPACED::/g, ", ");

  return { out: unmask(body, masks), count };
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  let totalFiles = 0;
  let totalSubs = 0;
  for (const f of files) {
    const p = path.join(POSTS_DIR, f);
    const src = fs.readFileSync(p, "utf8");
    if (!src.includes("—")) continue;
    const { out, count } = fix(src);
    if (out === src || count === 0) continue;
    totalFiles++;
    totalSubs += count;
    if (WRITE) {
      fs.writeFileSync(p, out, "utf8");
      console.log(`fixed ${f}  (${count} substitutions)`);
    } else {
      console.log(`would fix ${f}  (${count} substitutions)`);
    }
  }
  console.log(`\n${WRITE ? "Wrote" : "Would write"} ${totalFiles} files, ${totalSubs} total substitutions.`);
  if (!WRITE) console.log("Re-run with --write to apply.");
}

main();

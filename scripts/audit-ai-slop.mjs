#!/usr/bin/env node
// Detect AI-generated tells in blog posts. Outputs a per-file score + the
// specific phrases that triggered, sorted worst-first. Run with:
//   node scripts/audit-ai-slop.mjs
//
// Scoring is heuristic, not gospel — a high score means "needs review",
// not "definitely AI". A clean score (< 5) almost certainly is fine.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(__dirname, "..", "content", "posts");

// Each rule has a label, a regex (case-insensitive), a per-match weight,
// and an optional cap (so one post repeating "leverage" 30 times doesn't
// dominate the leaderboard with a single rule).
const RULES = [
  // High-weight: smoking guns
  { label: "em-dash",                     re: /—/g,                                          weight: 2, cap: 30 },
  { label: "double-hyphen-as-em",         re: / -- /g,                                       weight: 2, cap: 10 },
  { label: "as-a-X-you-know",             re: /\bas an? [a-z]+ (?:owner|operator|leader|professional|user)[, ]/gi, weight: 5, cap: 5 },
  { label: "in-todays-X-landscape",       re: /\bin today'?s (?:fast-paced|digital|business|competitive|ever-evolving|complex|modern) [a-z ]*landscape\b/gi, weight: 8, cap: 5 },
  { label: "navigate-the-X",              re: /\bnavigate the (?:complex|complexities|challenges|landscape|world)\b/gi, weight: 5, cap: 5 },
  { label: "delve-into",                  re: /\bdelve\s+into\b/gi,                          weight: 4, cap: 5 },
  { label: "tapestry",                    re: /\btapestry\b/gi,                              weight: 6, cap: 5 },
  { label: "embark",                      re: /\bembark\b/gi,                                weight: 4, cap: 5 },
  { label: "in-the-realm-of",             re: /\bin the realm of\b/gi,                       weight: 6, cap: 5 },
  { label: "it-is-important-to-note",     re: /\b(?:it is important to note|it'?s important to note|it should be noted)\b/gi, weight: 4, cap: 5 },
  { label: "in-conclusion",               re: /\b(?:in conclusion|to conclude|in summary)\b/gi, weight: 3, cap: 5 },
  { label: "leverage",                    re: /\bleverag(?:e|es|ed|ing)\b/gi,                weight: 3, cap: 8 },
  { label: "synergy",                     re: /\bsynerg(?:y|ies|istic)\b/gi,                 weight: 4, cap: 5 },
  { label: "robust",                      re: /\brobust\b/gi,                                weight: 2, cap: 8 },
  { label: "cutting-edge",                re: /\bcutting[- ]edge\b/gi,                       weight: 3, cap: 5 },
  { label: "seamless",                    re: /\bseamless(?:ly)?\b/gi,                       weight: 2, cap: 8 },
  { label: "streamline",                  re: /\bstreamlin(?:e|es|ed|ing)\b/gi,              weight: 2, cap: 8 },
  { label: "best-in-class",               re: /\bbest[- ]in[- ]class\b/gi,                   weight: 3, cap: 5 },
  { label: "unlock-the-power",            re: /\bunlock(?:ing)? the (?:power|potential|secrets?)\b/gi, weight: 5, cap: 5 },
  { label: "empower",                     re: /\bempower(?:s|ed|ing|ment)?\b/gi,             weight: 2, cap: 8 },
  { label: "tailored-solution",           re: /\btailored (?:solution|approach|strategy|service)/gi, weight: 3, cap: 5 },
  { label: "peace-of-mind",               re: /\bpeace of mind\b/gi,                         weight: 1, cap: 5 },
  { label: "ever-evolving",               re: /\bever[- ]evolving\b/gi,                      weight: 4, cap: 5 },
  { label: "fast-paced",                  re: /\bfast[- ]paced\b/gi,                         weight: 3, cap: 5 },
  { label: "moreover-furthermore",        re: /\b(?:moreover|furthermore|in addition,)/gi,   weight: 1, cap: 8 },
  { label: "crucial-paramount-vital",     re: /\b(?:crucial|paramount|of utmost importance)\b/gi, weight: 1, cap: 8 },
  { label: "hope-this-finds-you",         re: /\bhope this (?:email )?finds you (?:well|doing well)\b/gi, weight: 6, cap: 3 },
  { label: "just-wanted-to",              re: /\bjust wanted to (?:reach out|check in|follow up)\b/gi, weight: 4, cap: 5 },
  { label: "consider-reaching-out",       re: /\bconsider reaching out\b/gi,                 weight: 5, cap: 5 },
  { label: "feel-free-to",                re: /\bfeel free to\b/gi,                          weight: 2, cap: 5 },
  { label: "dont-hesitate",               re: /\bdon'?t hesitate\b/gi,                       weight: 3, cap: 5 },
  { label: "in-the-fast-paced-world",     re: /\bin the (?:fast-paced|ever-changing|dynamic) world\b/gi, weight: 6, cap: 3 },
  { label: "the-rise-of-X",               re: /\bthe rise of [a-z]+ (?:has|is|continues)/gi, weight: 3, cap: 5 },
  { label: "comprehensive-guide",         re: /\bcomprehensive guide\b/gi,                   weight: 2, cap: 5 },
  { label: "deep-dive",                   re: /\bdeep dive\b/gi,                             weight: 1, cap: 5 },
  { label: "game-changer",                re: /\bgame[- ]changer\b/gi,                       weight: 3, cap: 3 },
  { label: "unparalleled",                re: /\bunparalleled\b/gi,                          weight: 3, cap: 5 },
  { label: "myriad",                      re: /\bmyriad\b/gi,                                weight: 2, cap: 5 },
  { label: "plethora",                    re: /\bplethora\b/gi,                              weight: 4, cap: 5 },
  { label: "in-essence",                  re: /\bin essence\b/gi,                            weight: 3, cap: 5 },
  { label: "ultimately",                  re: /\bultimately,/gi,                             weight: 1, cap: 5 },
  // Structural tells (heading every 100 words, listicle pattern, X is more than just Y)
  { label: "X-is-more-than-just",         re: /\b[A-Z][a-z]+ is more than just\b/g,          weight: 4, cap: 3 },
  { label: "not-only-X-but-also",         re: /\bnot only [a-z]+ but also\b/gi,              weight: 2, cap: 5 },
  { label: "whether-youre-X-or-Y",        re: /\bwhether you'?re [a-z]+ or [a-z]+,/gi,       weight: 2, cap: 5 },
  { label: "in-the-ever-changing",        re: /\bin the ever[- ]changing\b/gi,               weight: 5, cap: 3 },
];

function stripFrontmatter(src) {
  if (!src.startsWith("---")) return { fm: "", body: src };
  const end = src.indexOf("\n---", 3);
  if (end < 0) return { fm: "", body: src };
  return { fm: src.slice(0, end + 4), body: src.slice(end + 4) };
}

function scorePost(filename, body) {
  const hits = [];
  let total = 0;
  for (const rule of RULES) {
    const matches = body.match(rule.re) || [];
    if (!matches.length) continue;
    const counted = Math.min(matches.length, rule.cap);
    const score = counted * rule.weight;
    total += score;
    hits.push({ label: rule.label, n: matches.length, score });
  }

  // Structural heuristics
  const wc = body.split(/\s+/).filter(Boolean).length;
  const headings = (body.match(/^#{1,6} /gm) || []).length;
  const headingDensity = wc > 0 ? (headings / wc) * 1000 : 0; // headings per 1k words
  if (wc > 400 && headingDensity > 25) {
    const bonus = Math.round((headingDensity - 25) * 0.5);
    total += bonus;
    hits.push({ label: "high-heading-density", n: headings, score: bonus });
  }

  // First-person presence is a strong "human" signal — penalize its absence
  // in posts long enough to plausibly need it.
  const firstPersonHits = (body.match(/\b(?:I |I'm |I've |I'd |my |me )/g) || []).length;
  if (wc > 600 && firstPersonHits < 3) {
    total += 6;
    hits.push({ label: "no-first-person", n: firstPersonHits, score: 6 });
  }

  return { filename, wc, score: total, hits };
}

function main() {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  const results = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(POSTS_DIR, f), "utf8");
    const { body } = stripFrontmatter(src);
    results.push(scorePost(f, body));
  }
  results.sort((a, b) => b.score - a.score);

  console.log(`\nAI-slop audit — ${results.length} posts\n`);
  console.log("score  wc     file                                                  top hits");
  console.log("─".repeat(110));
  for (const r of results) {
    const top = r.hits
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((h) => `${h.label}×${h.n}`)
      .join(", ");
    const flag = r.score >= 25 ? "🚨" : r.score >= 12 ? "⚠ " : "  ";
    console.log(
      `${flag} ${String(r.score).padStart(3)}  ${String(r.wc).padStart(5)}  ${r.filename.padEnd(54)} ${top}`
    );
  }
  const high = results.filter((r) => r.score >= 25).length;
  const mid = results.filter((r) => r.score >= 12 && r.score < 25).length;
  const ok = results.filter((r) => r.score < 12).length;
  console.log(`\nSummary: ${high} high-risk · ${mid} medium · ${ok} probably ok\n`);
}

main();

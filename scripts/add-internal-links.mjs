#!/usr/bin/env node
// One-shot fixer: adds an internal link to a Sarasota/Bradenton city page or
// /blog post in every content post that audit-seo flags W_NO_INTERNAL_LINK.
// The link is appended as a natural closing line before the last paragraph,
// or at the end of the body if no good anchor exists.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS = path.join(__dirname, "..", "content", "posts");

const INTERNAL_RE = /\]\((?:\/(?:blog|sarasota|bradenton|venice|nokomis|lakewood-ranch|industries|service-area|glossary)[^\)]*)\)/i;

const LINK_POOL = [
  "Looking for hands-on help instead? [Simple IT SRQ supports businesses across Sarasota and Bradenton](/sarasota-it-support) with managed IT, security, and repair.",
  "If this is the week to get IT off your plate, [see how we help Sarasota and Bradenton businesses](/services) or [book a free 30-minute review](/book).",
  "More local field notes like this live in [our Sarasota / Bradenton IT blog](/blog).",
  "We handle this day in and day out for [Bradenton and Sarasota offices](/bradenton-it-support). Questions? Ask us anything.",
];

function pickLink(src) {
  // Deterministic per-file pick so re-runs are stable.
  let h = 0;
  for (let i = 0; i < src.length; i += 4) h = (h + src.charCodeAt(i)) | 0;
  return LINK_POOL[Math.abs(h) % LINK_POOL.length];
}

function stripFrontmatter(s) {
  if (!s.startsWith("---")) return { fm: "", body: s };
  const end = s.indexOf("\n---", 3);
  if (end < 0) return { fm: "", body: s };
  return { fm: src2fm(s), body: s.slice(end + 4) };
}
function src2fm(s) { return s.slice(0, s.indexOf("\n---", 3) + 4); }

const files = fs.readdirSync(POSTS).filter((f) => f.endsWith(".mdx"));
let fixed = 0;
for (const f of files) {
  const p = path.join(POSTS, f);
  const src = fs.readFileSync(p, "utf8");
  const end = src.startsWith("---") ? src.indexOf("\n---", 3) + 4 : 0;
  const fm = src.slice(0, end);
  const body = src.slice(end);

  if (INTERNAL_RE.test(body)) continue;

  const link = pickLink(f + body.length);
  const paragraphs = body.split(/\n\n/);
  // Insert before the final CTA-ish section heading if present, else append.
  let insertAt = paragraphs.length;
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    if (/^## Need Hands-On|^## When to Call/i.test(paragraphs[i])) { insertAt = i; break; }
    if (/^## /.test(paragraphs[i])) { insertAt = i; break; }
  }
  paragraphs.splice(insertAt, 0, link);
  fs.writeFileSync(p, fm + paragraphs.join("\n\n"), "utf8");
  fixed++;
  console.log(`linked: ${f}`);
}
console.log(`\n${fixed} posts updated.`);

#!/usr/bin/env node
// Dedupe repeated identical paragraphs (fixes add-internal-links re-runs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const POSTS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content", "posts");

for (const f of fs.readdirSync(POSTS).filter((f) => f.endsWith(".mdx"))) {
  const p = path.join(POSTS, f);
  const src = fs.readFileSync(p, "utf8");
  const end = src.startsWith("---") ? src.indexOf("\n---", 3) + 4 : 0;
  const fm = src.slice(0, end);
  const paras = src.slice(end).split(/\n\n/);
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const para of paras) {
    const key = para.trim();
    if (/^\[?(Looking for hands-on|More local field notes|We handle this day|If this is the week)/.test(key) && seen.has(key)) { removed++; continue; }
    seen.add(key);
    out.push(para);
  }
  if (removed) {
    fs.writeFileSync(p, fm + out.join("\n\n"), "utf8");
    console.log(`deduped ${removed}: ${f}`);
  }
}
console.log("done");

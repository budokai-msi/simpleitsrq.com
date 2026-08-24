import 'dotenv/config';
import { sql } from '../api/_lib/db.js';
import { publishDraftToGitHub } from '../api/_lib/publish-draft.js';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const WRITER_MODEL  = process.env.LOCAL_LLM_WRITER  || 'qwen3.6:35b';
const CRITIC_MODEL  = process.env.LOCAL_LLM_CRITIC  || 'gemma4:12b';
const MAX_REVISIONS = Number(process.env.LOCAL_LLM_MAX_REVISIONS || 2);
// Slop score at or below which a post is allowed to publish.
const SLOP_THRESHOLD = Number(process.env.BLOG_SLOP_THRESHOLD || 8);

const HN_RELEVANT = /security|hack|breach|password|backup|cloud|aws|azure|vpn|firewall|malware|ransomware|phishing|privacy|encryption|network|server|infrastructure|devops|saas|outage|pricing|ai|llm|openai|chatgpt|microsoft|google|apple|linux|windows|update|patch|vulnerability|cve|zero.day|exploit|incident|response|disaster|recovery|continuity|legal|finance|healthcare|construction|real\.estate|remote|work|wifi|router|switch|camera|surveillance|ups|battery|power|hardware|laptop|dock|nas/i;
const HN_BANNED_TITLE = /who is hiring|ask hn|show hn|launch hn|tell hn|poll:|job:|hiring/i;

// ---------------------------------------------------------------
// Ollama helpers
// ---------------------------------------------------------------

async function ollamaGenerate(model, system, prompt, { timeoutMs = 20 * 60 * 1000 } = {}) {
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // think:false — thinking models (qwen3.6) otherwise spend the whole budget
    // reasoning and return an empty `response` field.
    body: JSON.stringify({ model, system, prompt, stream: false, format: 'json', think: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Ollama ${model} error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.response || '';
}

function parseJsonLoose(text, fallbackAttempt = 0) {
  try {
    return JSON.parse(text);
  } catch {
    // Some models wrap JSON in prose or fences despite format:json — recover.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); }
      catch { /* fall through to repair */ }
    }
  }
  // Last resort: common LLM JSON breakages — raw newlines/tabs inside strings
  // and unescaped quotes. Escape control chars inside string bodies.
  const m2 = text.match(/\{[\s\S]*\}/);
  const raw = m2 ? m2[0] : text;
  const repaired = raw
    .replace(/"(?:[^"\\]|\\.)*"/g, (s) => s.replace(/[\b\f\n\r\t\v]/g, (c) => ({ '\b':'\\b','\f':'\\f','\n':'\\n','\r':'\\r','\t':'\\t','\v':'\\u000b' }[c])))
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  try {
    return JSON.parse(repaired);
  } catch (err) {
    throw new Error(`Unparseable JSON (${err.message.slice(0, 120)}): ${raw.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------
// Story selection
// ---------------------------------------------------------------

async function fetchHNTopStory() {
  try {
    const topRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topIds = await topRes.json();
    const candidates = await Promise.all(
      topIds.slice(0, 30).map(async (id) => {
        const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return res.json();
      })
    );

    // Don't repeat stories already covered by published drafts.
    let seenUrls = new Set();
    try {
      const rows = await sql`SELECT source_url FROM draft_posts WHERE source_url IS NOT NULL`;
      seenUrls = new Set(rows.map((r) => r.source_url));
    } catch { /* table column may not exist yet */ }

    const scored = candidates
      .filter((s) => s && s.type === 'story' && s.score > 80 && s.title && s.url)
      .filter((s) => !HN_BANNED_TITLE.test(s.title))
      .filter((s) => !seenUrls.has(s.url))
      .filter((s) => HN_RELEVANT.test(`${s.title} ${s.url || ''}`))
      .map((s) => ({ ...s, weight: s.score * (HN_RELEVANT.test(s.title) ? 2 : 1) }))
      .sort((a, b) => b.weight - a.weight);

    return scored[0] || null;
  } catch (err) {
    console.error('[hn] fetch error', err);
    return null;
  }
}

// ---------------------------------------------------------------
// Slop scoring — same rules as scripts/audit-ai-slop.mjs
// ---------------------------------------------------------------

const SLOP_RULES = [
  { label: 'em-dash', re: /—/g, weight: 2, cap: 30 },
  { label: 'double-hyphen-as-em', re: / -- /g, weight: 2, cap: 10 },
  { label: 'as-a-X-you-know', re: /\bas an? [a-z]+ (?:owner|operator|leader|professional|user)[, ]/gi, weight: 5, cap: 5 },
  { label: 'in-todays-X-landscape', re: /\bin today'?s (?:fast-paced|digital|business|competitive|ever-evolving|complex|modern) [a-z ]*landscape\b/gi, weight: 8, cap: 5 },
  { label: 'navigate-the-X', re: /\bnavigate the (?:complex|complexities|challenges|landscape|world)\b/gi, weight: 5, cap: 5 },
  { label: 'delve-into', re: /\bdelve\s+into\b/gi, weight: 4, cap: 5 },
  { label: 'tapestry', re: /\btapestry\b/gi, weight: 6, cap: 5 },
  { label: 'embark', re: /\bembark\b/gi, weight: 4, cap: 5 },
  { label: 'in-the-realm-of', re: /\bin the realm of\b/gi, weight: 6, cap: 5 },
  { label: 'it-is-important-to-note', re: /\b(?:it is important to note|it'?s important to note|it should be noted)\b/gi, weight: 4, cap: 5 },
  { label: 'in-conclusion', re: /\b(?:in conclusion|to conclude|in summary)\b/gi, weight: 3, cap: 5 },
  { label: 'leverage', re: /\bleverag(?:e|es|ed|ing)\b/gi, weight: 3, cap: 8 },
  { label: 'synergy', re: /\bsynerg(?:y|ies|istic)\b/gi, weight: 4, cap: 5 },
  { label: 'robust', re: /\brobust\b/gi, weight: 2, cap: 8 },
  { label: 'cutting-edge', re: /\bcutting[- ]edge\b/gi, weight: 3, cap: 5 },
  { label: 'seamless', re: /\bseamless(?:ly)?\b/gi, weight: 2, cap: 8 },
  { label: 'streamline', re: /\bstreamlin(?:e|es|ed|ing)\b/gi, weight: 2, cap: 8 },
  { label: 'best-in-class', re: /\bbest[- ]in[- ]class\b/gi, weight: 3, cap: 5 },
  { label: 'unlock-the-power', re: /\bunlock(?:ing)? the (?:power|potential|secrets?)\b/gi, weight: 5, cap: 5 },
  { label: 'empower', re: /\bempower(?:s|ed|ing|ment)?\b/gi, weight: 2, cap: 8 },
  { label: 'tailored-solution', re: /\btailored (?:solution|approach|strategy|service)/gi, weight: 3, cap: 5 },
  { label: 'peace-of-mind', re: /\bpeace of mind\b/gi, weight: 1, cap: 5 },
  { label: 'ever-evolving', re: /\bever[- ]evolving\b/gi, weight: 4, cap: 5 },
  { label: 'fast-paced', re: /\bfast[- ]paced\b/gi, weight: 3, cap: 5 },
  { label: 'moreover-furthermore', re: /\b(?:moreover|furthermore|in addition,)/gi, weight: 1, cap: 8 },
  { label: 'crucial-paramount-vital', re: /\b(?:crucial|paramount|of utmost importance)\b/gi, weight: 1, cap: 8 },
  { label: 'feel-free-to', re: /\bfeel free to\b/gi, weight: 2, cap: 5 },
  { label: 'dont-hesitate', re: /\bdon'?t hesitate\b/gi, weight: 3, cap: 5 },
  { label: 'game-changer', re: /\bgame[- ]changer\b/gi, weight: 3, cap: 3 },
  { label: 'unparalleled', re: /\bunparalleled\b/gi, weight: 3, cap: 5 },
  { label: 'plethora', re: /\bplethora\b/gi, weight: 4, cap: 5 },
  { label: 'X-is-more-than-just', re: /\b[A-Z][a-z]+ is more than just\b/g, weight: 4, cap: 3 },
  { label: 'whether-youre-X-or-Y', re: /\bwhether you'?re [a-z]+ or [a-z]+,/gi, weight: 2, cap: 5 },
];

function slopScore(body) {
  const hits = [];
  let total = 0;
  for (const rule of SLOP_RULES) {
    const matches = body.match(rule.re) || [];
    if (!matches.length) continue;
    const counted = Math.min(matches.length, rule.cap);
    total += counted * rule.weight;
    hits.push(`${rule.label}×${matches.length}`);
  }
  const wc = body.split(/\s+/).filter(Boolean).length;
  const firstPerson = (body.match(/\b(?:I |I'm |I've |I'd |my |me )/g) || []).length;
  if (wc > 600 && firstPerson < 3) {
    total += 6;
    hits.push('no-first-person');
  }
  return { score: total, wc, hits };
}

// ---------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------

const WRITER_SYSTEM = `You are Dancho Ivanov, founder of Simple IT SRQ — a managed IT services and computer repair company serving Sarasota and Bradenton, Florida. You have run this business for years: you've pulled dead drives out of flooded offices after hurricanes, cleaned up after ransomware at law firms on Main St, and talked worried practice managers near Sarasota Memorial through backup restores at 7am.

Write like that person writes: specific, first-person, practical, occasionally opinionated. Reference real local context (Manatee County, Lakewood Ranch, SRQ, seasonal snowbirds, hurricane season). Never generic.

HARD BANS — these phrases mark text as AI-generated and will get the post rejected:
- "navigate the complexities", "in today's fast-paced world", "delve into", "game-changer", "seamless", "leverage" (as a verb), "robust", "peace of mind", "crucial", "cutting-edge", "it's important to note", "feel free to", "don't hesitate to"
- Em dashes (—). Use commas, periods, or parentheses instead.
- Opening with "As a business owner..."

STRUCTURE (exact Markdown H2 headings):
## The Short Answer
## Local Impact for Sarasota & Bradenton Businesses
## Recommended Gear & Solutions
(pick 2-3 concrete products that fit this topic — e.g. Ubiquiti UniFi, Synology NAS, YubiKey, Bitwarden, Malwarebytes — say who each is for and why, plainly)
## Action Plan for This Week
(numbered, concrete, do-this-then-this)
## Need Hands-On Help in SRQ?
(close by inviting readers to book a free 30-minute strategy call at /book or browse /services)

Use "I" naturally at least 5 times. Include one short anecdote or field observation that sounds lived-in. 800-1100 words.

Respond with ONLY valid JSON, no markdown fencing:
{"title": "...", "slug": "kebab-case-slug", "category": "Cybersecurity|AI & Productivity|Cloud|Business Tech", "excerpt": "...", "metaDescription": "<=155 chars", "body": "markdown body"}`;

const CRITIC_SYSTEM = `You are a ruthless blog editor for a local IT services company. You receive a draft post as JSON. Your job:

1. Score AI-sounding tells. Count instances of: em dashes, "delve", "leverage" (verb), "seamless", "robust", "crucial", "navigate the", "game-changer", "in today's...", "it's important to note", "peace of mind", "feel free to". Also check: does it use first person ("I") at least 5 times? Does it contain at least one concrete anecdote? Does it mention Sarasota/Bradenton naturally more than once?

2. Check facts lightly: does the advice match the story it's based on? Any claim that seems wrong or dangerous for a small business to follow?

3. Check structure: all six required H2 sections present? Word count 700-1200?

Respond with ONLY valid JSON:
{"verdict": "accept" | "revise",
 "issues": ["specific problem 1", "problem 2"],
 "rewrite_instructions": "if revise: one paragraph of concrete, prioritized instructions for what to change"}`;

function revisionPrompt(post, issues) {
  return `Here is your previous draft:

${JSON.stringify(post)}

Your editor rejected it with these issues:
${issues.map((i, n) => `${n + 1}. ${i}`).join('\n')}

Rewrite the FULL post fixing every issue. Keep what works; cut everything the editor flagged. Same JSON schema, no fencing.`;
}

// ---------------------------------------------------------------
// Slug + persistence
// ---------------------------------------------------------------

// Return the slug only if it is free. On collision, return null so the
// caller SKIPS the story entirely — we never publish -NNNN numbered
// duplicate variants of an existing post.
async function pickFreeSlug(base) {
  const attempt = String(base || 'post').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || 'post';
  const existing = await sql`SELECT 1 FROM draft_posts WHERE slug = ${attempt} LIMIT 1`;
  if (existing.length === 0) return attempt;
  console.log(`[blog] Slug already exists: ${attempt}. Skipping story instead of creating a numbered variant.`);
  return null;
}

// ---------------------------------------------------------------
// Main pipeline: story → write → critique → revise → publish
// ---------------------------------------------------------------

export async function generateLocalDraft() {
  console.log(`[blog] writer=${WRITER_MODEL} critic=${CRITIC_MODEL} slop_threshold=${SLOP_THRESHOLD}`);

  const story = await fetchHNTopStory();
  if (!story) {
    console.log('[blog] No fresh relevant HN story. Skipping.');
    return { ok: false, reason: 'no_story' };
  }
  const hnUrl = `https://news.ycombinator.com/item?id=${story.id}`;
  console.log(`[blog] Story: ${story.title} (score ${story.score})`);

  const userPrompt = `Rewrite this Hacker News story for the Simple IT SRQ blog.
Title: ${story.title}
URL: ${story.url}
HN discussion: ${hnUrl}
Score: ${story.score}`;

  // --- Write ---
  console.log(`[blog] Drafting with ${WRITER_MODEL}...`);
  let post = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      post = parseJsonLoose(await ollamaGenerate(WRITER_MODEL, WRITER_SYSTEM, userPrompt));
      if (post.title && post.body) break;
      console.warn(`[blog] Attempt ${attempt}: writer JSON missing title/body (got keys: ${Object.keys(post || {}).join(',')})`);
    } catch (err) {
      console.warn(`[blog] Attempt ${attempt}: writer failed: ${String(err.message).slice(0, 160)}`);
    }
    post = null;
  }
  if (!post) throw new Error('Writer returned no usable post after 3 attempts');

  // --- Critique loop ---
  for (let round = 1; round <= MAX_REVISIONS + 1; round++) {
    const slop = slopScore(post.body || '');
    console.log(`[blog] Round ${round}: slop score ${slop.score} (${slop.hits.slice(0, 4).join(', ') || 'clean'}), ${slop.wc} words`);

    let critique;
    try {
      critique = parseJsonLoose(await ollamaGenerate(
        CRITIC_MODEL,
        CRITIC_SYSTEM,
        `Draft:\n${JSON.stringify(post)}\n\nHeuristic slop scan found: ${slop.hits.join(', ') || 'nothing'}. Slop score ${slop.score}/100-ish (lower is better, under ${SLOP_THRESHOLD} publishes).`,
      ));
    } catch (err) {
      console.warn('[blog] Critic failed, relying on heuristic alone:', err.message);
      critique = { verdict: slop.score <= SLOP_THRESHOLD ? 'accept' : 'revise', issues: slop.hits, rewrite_instructions: 'Remove every flagged phrase; replace with plain talk.' };
    }

    if (critique.verdict === 'accept' && slop.score <= SLOP_THRESHOLD) {
      console.log('[blog] Critic accepted the draft.');
      break;
    }
    if (round > MAX_REVISIONS) {
      if (slop.score <= SLOP_THRESHOLD + 4) {
        console.log(`[blog] Max revisions reached; slop ${slop.score} within grace margin. Publishing anyway.`);
        break;
      }
      console.error(`[blog] Draft still too sloppy after ${MAX_REVISIONS} revisions (score ${slop.score}). Aborting without publishing.`);
      return { ok: false, reason: 'quality_gate', slop: slop.score };
    }

    console.log(`[blog] Revising per critic: ${critique.rewrite_instructions?.slice(0, 140) || '(heuristic flags)'}`);
    post = parseJsonLoose(await ollamaGenerate(WRITER_MODEL, WRITER_SYSTEM, revisionPrompt(post, [...(critique.issues || []), ...slop.hits])));
  }

  // --- Persist + publish ---
  const finalSlug = await pickFreeSlug(post.slug);
  if (!finalSlug) {
    console.log('[blog] Slug collision — skipping story entirely.');
    return { ok: false, reason: 'slug_collision', slug: post.slug };
  }

  const inserted = await sql`
    INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
    VALUES (${post.title}, ${finalSlug}, ${post.category || 'Business Tech'},
            ${post.excerpt || ''}, ${post.body}, ${post.metaDescription || ''},
            ${`${WRITER_MODEL}+${CRITIC_MODEL}`})
    RETURNING id`;
  console.log(`[blog] Draft ID ${inserted[0].id}: ${post.title}`);

  const publishResult = await publishDraftToGitHub({
    title: post.title,
    slug: finalSlug,
    category: post.category || 'Business Tech',
    excerpt: post.excerpt || '',
    body: post.body,
    meta_desc: post.metaDescription || '',
    tags: ['hacker-news', 'local-it'],
    sourceUrl: story.url,
  });

  if (publishResult.ok) {
    await sql`UPDATE draft_posts SET status='published', reviewed_at=now(), published_at=now() WHERE id=${inserted[0].id}`;
    console.log(`[blog] Published to GitHub → Vercel deploy triggered. ${publishResult.htmlUrl || ''}`);
    return { ok: true, slug: finalSlug };
  }
  console.error('[blog] GitHub publish failed:', publishResult.error, publishResult.detail);
  return { ok: false, reason: 'publish_failed' };
}

// CLI entry: `node scripts/local-publisher.mjs`
if (process.argv[1] && process.argv[1].endsWith('local-publisher.mjs')) {
  generateLocalDraft()
    .then((r) => { process.exit(r.ok ? 0 : 1); })
    .catch((err) => { console.error('[blog] Fatal:', err); process.exit(1); });
}

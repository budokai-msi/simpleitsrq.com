import 'dotenv/config';
import { sql } from '../api/_lib/db.js';
import { publishDraftToGitHub } from '../api/_lib/publish-draft.js';

const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = process.env.LOCAL_LLM_MODEL || 'gemma2:9b';

const HN_RELEVANT = /security|hack|breach|password|backup|cloud|aws|azure|vpn|firewall|malware|ransomware|phishing|privacy|encryption|network|server|infrastructure|devops|saas|outage|pricing|ai|llm|openai|chatgpt|microsoft|google|apple|linux|windows|update|patch|vulnerability|cve|zero.day|exploit|incident|response|disaster|recovery|continuity|legal|finance|healthcare|construction|real\.estate|remote|work|wifi|router|switch|camera|surveillance|ups|battery|power|hardware|laptop|dock|nas/i;
const HN_BANNED_TITLE = /who is hiring|ask hn|show hn|launch hn|tell hn|poll:|job:|hiring/i;

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

    const scored = candidates
      .filter((s) => s && s.type === 'story' && s.score > 80 && s.title && s.url)
      .filter((s) => !HN_BANNED_TITLE.test(s.title))
      .filter((s) => HN_RELEVANT.test(`${s.title} ${s.url || ''}`))
      .map((s) => {
        const relevance = HN_RELEVANT.test(s.title) ? 2 : 1;
        return { ...s, weight: s.score * relevance };
      })
      .sort((a, b) => b.weight - a.weight);

    return scored[0] || null;
  } catch (err) {
    console.error('[hn] fetch error', err);
    return null;
  }
}

async function pickFreeSlug(base) {
  let attempt = base;
  for (let i = 0; i < 5; i++) {
    const existing = await sql`SELECT 1 FROM draft_posts WHERE slug = ${attempt} LIMIT 1`;
    if (existing.length === 0) return attempt;
    attempt = `${base}-${Math.floor(Math.random() * 1000)}`;
  }
  return null;
}

async function generateLocalDraft() {
  console.log(`[cron] Waking up to generate today's blog post...`);
  const story = await fetchHNTopStory();
  if (!story) {
    console.log('[cron] No relevant HN story found today. Will try again tomorrow.');
    return;
  }

  const hnUrl = `https://news.ycombinator.com/item?id=${story.id}`;
  const systemPrompt = `You are Dancho Ivanov, founder of Simple IT SRQ—the premier managed IT services, cybersecurity, and computer repair provider in Sarasota and Bradenton, Florida. Write a high-converting, deeply authoritative, SEO-optimized local affiliate blog post.
  
  CRITICAL REVENUE & MONETIZATION REQUIREMENTS:
  - Your goal is twofold: (1) Rank #1 on Google Search and Google Maps for Sarasota and Bradenton IT & computer repair keywords, and (2) Generate affiliate revenue and local client leads.
  - Include a dedicated section titled "## Recommended Gear & Solutions" featuring 2-3 specific, high-quality hardware/software recommendations (e.g., Ubiquiti UniFi gateways, Synology NAS backup, YubiKey hardware tokens, Bitwarden, or Malwarebytes) with compelling buyer reasoning and affiliate purchase callouts.
  
  LOCAL SEO KEYWORDS & RELEVANCE:
  - Naturally weave in localized keywords: "Sarasota", "Bradenton", "Lakewood Ranch", "Manatee County", "SRQ", "computer repair near me", "local IT support".
  - Mention local business contexts (e.g., law firms on Main St, medical practices near Sarasota Memorial, contractors in Bradenton).
  
  VOICE AND STRUCTURE:
  - Write like a trusted local IT expert talking to a business owner over coffee: authoritative, practical, zero fluff.
  - Required Markdown H2 sections:
    "## The Short Answer"
    "## Local Impact for Sarasota & Bradenton Businesses"
    "## Recommended Gear & Solutions" (include affiliate recommendations)
    "## Action Plan for This Week"
    "## Need Hands-On Help in SRQ?"
  - End with a strong CTA to book a free 30-minute strategy call at /book or explore /services and /leadgen.
  - Word count: 800-1100 words.
  
  Respond with ONLY a valid JSON object matching this schema (do NOT use markdown fencing for the JSON):
  {
    "title": "string",
    "slug": "string",
    "category": "Cybersecurity | AI & Productivity | Cloud | Business Tech",
    "excerpt": "string",
    "metaDescription": "string",
    "body": "string"
  }`;

  const userPrompt = `Rewrite this Hacker News story for the Simple IT SRQ blog.
  Title: ${story.title}
  URL: ${story.url}
  HN: ${hnUrl}
  Score: ${story.score}`;

  console.log(`[cron] Triggering local LLM (${OLLAMA_MODEL}) for story: ${story.title}`);

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      system: systemPrompt,
      prompt: userPrompt,
      stream: false,
      format: 'json'
    })
  });

  if (!res.ok) {
    console.error('[cron] Ollama API error', res.status, await res.text());
    return;
  }

  const data = await res.json();
  const text = data.response || '';

  let post;
  try {
    post = JSON.parse(text);
  } catch (err) {
    console.error('[cron] Failed to parse Ollama response as JSON:', text.substring(0, 200));
    return;
  }

  const finalSlug = await pickFreeSlug(post.slug);
  if (!finalSlug) {
    console.error('[cron] Failed to find free slug');
    return;
  }

  console.log(`[cron] Inserting draft: ${post.title} (${finalSlug})`);

  try {
    const inserted = await sql`
      INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
      VALUES (${post.title}, ${finalSlug}, ${post.category || 'Business Tech'},
              ${post.excerpt || ''}, ${post.body}, ${post.metaDescription || ''},
              ${OLLAMA_MODEL})
      RETURNING id
    `;
    console.log(`[cron] Success! Draft ID: ${inserted[0].id}`);
    
    console.log(`[cron] Committing to GitHub to trigger Vercel build...`);
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
      await sql`
        UPDATE draft_posts
        SET status = 'published',
        reviewed_at = now(),
        published_at = now()
        WHERE id = ${inserted[0].id}
      `;
      console.log(`[cron] Successfully published to GitHub! URL: ${publishResult.htmlUrl || 'already existed'}`);
    } else {
      console.error(`[cron] Failed to publish to GitHub:`, publishResult.error, publishResult.detail);
    }

  } catch (err) {
    console.error('[cron] DB Insert failed:', err);
  }
}

// ---------------------------------------------------------
// CRON DAEMON LOOP
// ---------------------------------------------------------
// This checks the time every minute. If it's exactly 11:00 AM, it fires.

console.log('===================================================');
console.log(' Simple IT SRQ - Local RTX 3090 Publisher Daemon');
console.log('===================================================');
console.log(`Model target: ${OLLAMA_MODEL}`);
console.log('Daemon is running. Will publish daily at 11:00 AM local time.');
console.log('Leave this terminal window open.');

let lastRunDay = null;

setInterval(() => {
  const now = new Date();
  const currentDay = now.getDate();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Run at exactly 11:00 AM
  if (currentHour === 11 && currentMinute === 0 && currentDay !== lastRunDay) {
    lastRunDay = currentDay;
    generateLocalDraft().catch(err => console.error('[cron] Fatal execution error:', err));
  }
}, 60 * 1000);

// Run once immediately on startup so you can test it
// generateLocalDraft();

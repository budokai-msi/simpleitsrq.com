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
  const systemPrompt = `You are Dancho Ivanov, founder of Simple IT SRQ, the top-rated managed IT services and computer repair company in Sarasota and Bradenton, Florida. Write a highly SEO-optimized local affiliate blog post.
  
  CRITICAL SEO REQUIREMENTS:
  - Your ultimate goal is to rank #1 on Google Maps and Local Search for IT services in Sarasota and Bradenton.
  - Naturally weave in localized keywords: "Sarasota", "Bradenton", "Manatee County", "SRQ", "local IT support", "computer repair near me".
  - Mention local landmarks, neighborhoods, or the local business climate to signal geographic relevance to Google.
  - Include an exact match NAP (Name, Address, Phone) or a strong call to action for local businesses to call Simple IT SRQ.
  
  VOICE AND STYLE:
  - Write like you're talking to a smart business owner over coffee: direct, honest, no fluff.
  - Explain WHY this Hacker News topic matters locally to Sarasota/Bradenton businesses.
  - Include these exact Markdown H2 sections: "## The Short Answer", "## A Note for Sarasota Businesses", "## What to Do This Week", "## When to Call Simple IT SRQ"
  - End with a CTA linking to /services or /leadgen.
  - 650-950 words.
  
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

import 'dotenv/config';
import { sql } from '../api/_lib/db.js';
import { publishDraftToGitHub } from '../api/_lib/publish-draft.js';

const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = process.env.LOCAL_LLM_MODEL || 'llama3.1:70b';

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
  const story = await fetchHNTopStory();
  if (!story) {
    console.log('No relevant HN story found');
    return;
  }

  const hnUrl = `https://news.ycombinator.com/item?id=${story.id}`;
  const systemPrompt = `You are Dancho Ivanov, founder of Simple IT SRQ, a managed IT services company in Sarasota, Florida. Write a blog post for small business owners in healthcare, legal, finance, and local services.
  
  VOICE AND STYLE:
  - Write like you're talking to a smart business owner over coffee: direct, honest, no fluff
  - Explain WHY this matters locally
  - Include these exact Markdown H2 sections: "## Short answer", "## Field note", "## What to do this week", "## When to call IT"
  - End with a CTA linking to /services or /leadgen
  - 650-950 words
  
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

  console.log(`[local-publisher] Triggering local LLM (${OLLAMA_MODEL}) for story: ${story.title}`);

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
    console.error('Ollama API error', res.status, await res.text());
    return;
  }

  const data = await res.json();
  const text = data.response || '';

  let post;
  try {
    post = JSON.parse(text);
  } catch (err) {
    console.error('Failed to parse Ollama response as JSON:', text.substring(0, 200));
    return;
  }

  const finalSlug = await pickFreeSlug(post.slug);
  if (!finalSlug) {
    console.error('Failed to find free slug');
    return;
  }

  console.log(`[local-publisher] Inserting draft: ${post.title} (${finalSlug})`);

  try {
    const inserted = await sql`
      INSERT INTO draft_posts (title, slug, category, excerpt, body, meta_desc, model)
      VALUES (${post.title}, ${finalSlug}, ${post.category || 'Business Tech'},
              ${post.excerpt || ''}, ${post.body}, ${post.metaDescription || ''},
              ${OLLAMA_MODEL})
      RETURNING id
    `;
    console.log(`Success! Draft ID: ${inserted[0].id}`);
    
    console.log(`[local-publisher] Committing to GitHub to trigger Vercel build...`);
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
      console.log(`[local-publisher] Successfully published to GitHub! URL: ${publishResult.htmlUrl || 'already existed'}`);
    } else {
      console.error(`[local-publisher] Failed to publish to GitHub:`, publishResult.error, publishResult.detail);
    }

  } catch (err) {
    console.error('DB Insert failed:', err);
  }
}

generateLocalDraft().then(() => {
  console.log('Local publishing task completed.');
  process.exit(0);
}).catch(console.error);

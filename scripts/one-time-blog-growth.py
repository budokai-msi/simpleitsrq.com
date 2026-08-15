from pathlib import Path
import re

# BlogPost: use first-party house banners unless AdSense is explicitly enabled.
blog_path = Path('src/pages/BlogPost.jsx')
blog = blog_path.read_text()
blog = blog.replace('import AdUnit from "../components/AdSense";', 'import BlogMonetizationSlot from "../components/BlogMonetizationSlot";', 1)
repls = {
    '<AdUnit key="ad-top" slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" />': '<BlogMonetizationSlot key="ad-top" post={post} context={rawBody} slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" placement="top" />',
    '<AdUnit key="ad-mid" slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" />': '<BlogMonetizationSlot key="ad-mid" post={post} context={rawBody || legacyEntry?.content || ""} slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" placement="mid" />',
}
for old, new in repls.items():
    if old not in blog:
        raise SystemExit(f'BlogPost anchor missing: {old[:50]}')
    blog = blog.replace(old, new, 1)
# Two bottom slots exist, one in each rendering path.
old_bottom = '<AdUnit key="ad-bottom" slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" />'
if blog.count(old_bottom) != 2:
    raise SystemExit(f'Expected two bottom ad slots, found {blog.count(old_bottom)}')
blog = blog.replace(old_bottom, '<BlogMonetizationSlot key="ad-bottom" post={post} context={rawBody} slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" placement="bottom" />', 1)
blog = blog.replace(old_bottom, '<BlogMonetizationSlot key="ad-bottom" post={post} context={rawBody || legacyEntry?.content || ""} slot={ADSENSE_SLOTS.inArticle} format="auto" className="ad-in-article" placement="bottom" />', 1)
if 'AdUnit key=' in blog:
    raise SystemExit('AdUnit placements remain in BlogPost')
blog_path.write_text(blog)

# Cron: trend velocity, novelty, SEO brief, relevant affiliate opportunities.
cron_path = Path('api/cron/agent.js')
cron = cron_path.read_text()
import_anchor = 'import { fetchHnSourceContext } from "../_lib/hn-source-context.js";'
editorial_import = 'import { affiliateOpportunities, rankFreshStories, seoBriefForStory } from "../_lib/blog-editorial.js";'
if editorial_import not in cron:
    if import_anchor not in cron:
        raise SystemExit('Editorial import anchor missing')
    cron = cron.replace(import_anchor, import_anchor + '\n' + editorial_import, 1)

fetch_pattern = re.compile(r'async function fetchHNTopStory\(\) \{.*?\n\}\n\nasync function generateHNDraft', re.S)
new_fetch = '''async function fetchHNTopStory() {
  try {
    const topRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json", { signal: AbortSignal.timeout(8000) });
    if (!topRes.ok) return null;
    const topIds = await topRes.json();
    if (!Array.isArray(topIds)) return null;

    // Look beyond the first screen of Hacker News. Velocity matters more than
    // yesterday's raw score when the goal is timely organic-search coverage.
    const candidates = await Promise.all(
      topIds.slice(0, 80).map(async (id, rank) => {
        try {
          const r = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { signal: AbortSignal.timeout(5000) });
          if (!r.ok) return null;
          const story = await r.json();
          return story ? { ...story, hnRank: rank } : null;
        } catch { return null; }
      })
    );

    const recentDrafts = await sql`
      SELECT title, body
      FROM draft_posts
      WHERE ts > now() - interval '120 days'
      ORDER BY ts DESC
      LIMIT 250
    `.catch(() => []);
    const recentOutcomes = await sql`
      SELECT detail->>'hnTitle' AS title, detail->>'hnUrl' AS source_url
      FROM auto_actions
      WHERE action = 'blog_draft'
        AND ts > now() - interval '120 days'
      ORDER BY ts DESC
      LIMIT 250
    `.catch(() => []);

    const eligible = candidates
      .filter((s) => s && s.type === "story" && s.score >= 35 && s.title && s.url)
      .filter((s) => !HN_BANNED_TITLE.test(s.title))
      .filter((s) => HN_RELEVANT.test(`${s.title} ${s.url || ""}`));

    return rankFreshStories(eligible, [...recentDrafts, ...recentOutcomes])[0] || null;
  } catch (err) {
    console.error("[hn] fetch error", err);
    return null;
  }
}

async function generateHNDraft'''
cron, count = fetch_pattern.subn(new_fetch, cron, count=1)
if count != 1:
    raise SystemExit(f'fetchHNTopStory replacements: {count}')

old_setup = '  const hnUrl = context.hnDiscussionUrl;\n  const gadget = pickGadgetForStory(story);'
new_setup = '  const hnUrl = context.hnDiscussionUrl;\n  const affiliateCandidates = affiliateOpportunities(story, context.article.text);\n  const seoBrief = seoBriefForStory(story);'
if old_setup not in cron:
    raise SystemExit('Gadget setup anchor missing')
cron = cron.replace(old_setup, new_setup, 1)

cron = cron.replace(
    '- Title must be clear, specific, natural, and no more than 70 characters.',
    '- Title must be clear, specific, natural, and no more than 70 characters. Use the supplied primary search query only when it reads naturally and accurately describes the article.',
    1,
)
cron = cron.replace(
    '- Meta description must accurately summarize this specific article in one useful sentence.',
    '- Meta description must accurately summarize this specific article in one useful sentence and make the practical value clear without clickbait.',
    1,
)
cron = cron.replace(
    '- Slug must be lowercase kebab case and describe the actual topic. Do not stuff locations or service keywords into it.',
    '- Slug must be lowercase kebab case and describe the actual topic. Do not stuff locations or service keywords into it.\\n- Answer the primary search intent in the first 120 words. Use related terms naturally in headings/body; never repeat a phrase just for SEO.\\n- Prefer evergreen explanatory angles around a trending event: what changed, who is affected, what to check, and what to do next.',
    1,
)

product_pattern = re.compile(r'PRODUCT LINKS:\n- A product candidate may be supplied\. It is OPTIONAL\..*?- If any affiliate shortcode is used, end with: "Product links may be affiliate links; we may earn a small commission on qualifying purchases\."', re.S)
new_products = '''PRODUCT LINKS:
- Zero to three affiliate candidates may be supplied. Every candidate is OPTIONAL.
- Use at most one affiliate link unless two products solve clearly different problems in the article.
- Include a candidate only when the source-backed advice creates a real buying decision for the reader.
- Never force a product into general news, policy, AI-model, or industry commentary.
- If you use a product, include its exact shortcode once and explain the practical use case without unsupported superlatives.
- If any affiliate shortcode is used, end with: "Product links may be affiliate links; we may earn a small commission on qualifying purchases."'''
cron, count = product_pattern.subn(new_products, cron, count=1)
if count != 1:
    raise SystemExit(f'PRODUCT LINKS replacements: {count}')

old_popularity = 'Hacker News points when selected: ${story.score}\n\nORIGINAL ARTICLE EXTRACT'
new_popularity = '''Hacker News points when selected: ${story.score}
Hacker News comments when selected: ${story.descendants || 0}
Trend score: ${story.editorial?.trendScore || "n/a"}
Story age in hours: ${story.editorial?.ageHours || "n/a"}
Points per hour: ${story.editorial?.pointsPerHour || "n/a"}

SEO / SEARCH INTENT BRIEF
Primary query: ${seoBrief.primaryQuery}
Search intent: ${seoBrief.searchIntent}
Related queries: ${seoBrief.secondaryQueries.join(" | ")}
Preferred internal CTA: ${seoBrief.preferredInternalCta}

ORIGINAL ARTICLE EXTRACT'''
if old_popularity not in cron:
    raise SystemExit('Popularity prompt anchor missing')
cron = cron.replace(old_popularity, new_popularity, 1)

candidate_pattern = re.compile(r'OPTIONAL PRODUCT CANDIDATE\n\$\{gadget\.key\}: \$\{gadget\.why\}\nExact shortcode if, and only if, genuinely relevant: \[\[\$\{gadget\.token\}\]\]')
new_candidates = '''OPTIONAL AFFILIATE CANDIDATES
${affiliateCandidates.length ? affiliateCandidates.map((candidate) => `- ${candidate.label}: ${candidate.why} — exact shortcode [[${candidate.token}]]`).join("\\n") : "No relevant affiliate candidate was found. Do not add a product link."}'''
cron, count = candidate_pattern.subn(new_candidates, cron, count=1)
if count != 1:
    raise SystemExit(f'Affiliate candidate replacements: {count}')

old_tags = 'tags: ["hacker-news", "source-backed", "local-it", /\\[\\[(?:amazon|amazon_search):/.test(post.body) ? gadget.key : null].filter(Boolean),'
new_tags = 'tags: ["hacker-news", "source-backed", "local-it", /\\[\\[(?:amazon|amazon_search|onepassword|backblaze|acronis|ubiquiti)(?::|\\]\\])/.test(post.body) ? "affiliate" : null].filter(Boolean),'
if old_tags not in cron:
    raise SystemExit('Publish tags anchor missing')
cron = cron.replace(old_tags, new_tags, 1)

old_out = 'gadget: /\\[\\[(?:amazon|amazon_search):/.test(post.body) ? gadget.key : null,'
new_out = 'affiliateOpportunities: affiliateCandidates.map((candidate) => candidate.label),\n      trend: story.editorial || null,\n      seoBrief,'
if old_out not in cron:
    raise SystemExit('Outcome gadget anchor missing')
cron = cron.replace(old_out, new_out, 1)

if 'const gadget = pickGadgetForStory(story);' in cron:
    raise SystemExit('Random gadget selection remains active')
if 'rankFreshStories(eligible' not in cron or 'SEO / SEARCH INTENT BRIEF' not in cron:
    raise SystemExit('Growth engine verification failed')
cron_path.write_text(cron)

# Explicit AdSense approval switch. First-party banners are the default.
env_path = Path('.env.example')
env = env_path.read_text() if env_path.exists() else ''
if 'VITE_ADSENSE_ENABLED=' not in env:
    env += '\n# Enable only after AdSense approval; false uses first-party blog banners.\nVITE_ADSENSE_ENABLED=false\n'
    env_path.write_text(env)

print('blog growth patch applied')

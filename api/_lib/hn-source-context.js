const ARTICLE_TIMEOUT_MS = 12_000;
const HN_TIMEOUT_MS = 6_000;
const MAX_ARTICLE_BYTES = 600_000;
const MAX_ARTICLE_CHARS = 18_000;
const MAX_DISCUSSION_CHARS = 6_000;

function decodeEntities(value = "") {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘",
    rdquo: "”", ldquo: "“",
  };
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function cleanHtml(html = "", limit = MAX_ARTICLE_CHARS) {
  const text = String(html)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|canvas|form|nav|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|article|section|h[1-6]|li|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");

  return decodeEntities(text)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, limit);
}

function extractTitle(html = "") {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanHtml(match[1], 240) : "";
}

function looksPrivateHostname(hostname = "") {
  const host = String(hostname).toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host === "0.0.0.0" || host.startsWith("127.")) return true;
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
  return false;
}

function normalizePublicUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!/^https?:$/.test(url.protocol) || looksPrivateHostname(url.hostname)) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export async function fetchSourceArticle(sourceUrl) {
  const url = normalizePublicUrl(sourceUrl);
  if (!url) return { ok: false, error: "source_url_not_public" };

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(ARTICLE_TIMEOUT_MS),
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.4",
        "User-Agent": "SimpleITSRQ-Research/1.0 (+https://simpleitsrq.com/blog)",
      },
    });
    if (!response.ok) return { ok: false, error: `source_http_${response.status}` };

    const type = response.headers.get("content-type") || "";
    if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) {
      return { ok: false, error: `unsupported_source_type:${type.slice(0, 80)}` };
    }

    const raw = (await response.text()).slice(0, MAX_ARTICLE_BYTES);
    const text = /html|xhtml/i.test(type) ? cleanHtml(raw) : raw.replace(/\s+/g, " ").trim().slice(0, MAX_ARTICLE_CHARS);
    if (text.length < 500) return { ok: false, error: "source_text_too_short" };

    return {
      ok: true,
      url: response.url || url.toString(),
      title: /html|xhtml/i.test(type) ? extractTitle(raw) : "",
      text,
      chars: text.length,
    };
  } catch (error) {
    return { ok: false, error: `source_fetch_failed:${String(error?.message || error).slice(0, 120)}` };
  }
}

export async function fetchHnDiscussion(storyId) {
  const id = Number(storyId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, comments: [], text: "" };

  try {
    const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, {
      signal: AbortSignal.timeout(HN_TIMEOUT_MS),
    });
    if (!storyResponse.ok) return { ok: false, comments: [], text: "" };
    const story = await storyResponse.json();
    const ids = Array.isArray(story?.kids) ? story.kids.slice(0, 18) : [];
    if (!ids.length) return { ok: true, comments: [], text: "" };

    const items = await Promise.all(ids.map(async (commentId) => {
      try {
        const response = await fetch(`https://hacker-news.firebaseio.com/v0/item/${commentId}.json`, {
          signal: AbortSignal.timeout(HN_TIMEOUT_MS),
        });
        if (!response.ok) return null;
        const item = await response.json();
        if (!item || item.dead || item.deleted || item.type !== "comment" || !item.text) return null;
        const text = cleanHtml(item.text, 700);
        return text.length >= 40 ? { id: item.id, by: item.by || "HN user", text } : null;
      } catch {
        return null;
      }
    }));

    const comments = items.filter(Boolean);
    const text = comments
      .map((comment, index) => `${index + 1}. ${comment.text}`)
      .join("\n")
      .slice(0, MAX_DISCUSSION_CHARS);
    return { ok: true, comments, text };
  } catch {
    return { ok: false, comments: [], text: "" };
  }
}

export async function fetchHnSourceContext(story) {
  if (!story?.id || !story?.url) return { ok: false, error: "story_missing_source" };
  const [article, discussion] = await Promise.all([
    fetchSourceArticle(story.url),
    fetchHnDiscussion(story.id),
  ]);

  if (!article.ok) {
    return { ok: false, error: article.error || "source_unavailable", article, discussion };
  }

  return {
    ok: true,
    article,
    discussion,
    hnDiscussionUrl: `https://news.ycombinator.com/item?id=${story.id}`,
  };
}

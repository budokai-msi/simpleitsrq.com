// Shared draft-publish helpers. Used by both the admin portal
// (api/portal.js) and the daily cron (api/cron/agent.js).
//
// The live blog system is MDX-first: content/posts/<slug>.mdx is read by
// scripts/generate-posts-meta.mjs, sitemap/RSS generation, and the static
// /blog/<slug>.html stubs. Generated posts must publish there, not into the
// legacy src/data/posts.js array.

function strikeApostrophes(text) {
  return String(text || "").replace(/\u2019|'/g, "");
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function slugSafe(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

function normalizedDraft(draft, overrides = {}) {
  const title = strikeApostrophes(overrides.title ?? draft.title);
  const slug = slugSafe(overrides.slug ?? draft.slug);
  const metaDescription = strikeApostrophes(
    overrides.metaDescription ?? draft.metaDescription ?? draft.meta_desc ?? "",
  );
  const excerpt = strikeApostrophes(overrides.excerpt ?? draft.excerpt ?? "");
  const category = overrides.category ?? draft.category ?? "Business Tech";
  const body = String(overrides.body ?? draft.body ?? "").trim();
  const draftTags = Array.isArray(draft.tags) && draft.tags.length ? draft.tags : null;
  const tags = Array.isArray(overrides.tags) && overrides.tags.length
    ? overrides.tags
    : draftTags || ["hacker-news", "local-it", "smb"];
  const heroAlt = overrides.heroAlt ?? draft.heroAlt ?? `A local business technology note about ${title}.`;
  const sourceUrl = overrides.sourceUrl ?? draft.sourceUrl ?? "";
  return { title, slug, metaDescription, excerpt, category, body, tags, heroAlt, sourceUrl };
}

export function formatDraftAsMdx(draft, overrides = {}) {
  const post = normalizedDraft(draft, overrides);
  if (!post.slug) throw new Error("missing_slug");
  if (!post.title) throw new Error("missing_title");
  if (!post.body) throw new Error("missing_body");

  const today = new Date().toISOString().slice(0, 10);
  const tags = post.tags
    .map((tag) => `  - ${yamlString(tag)}`)
    .join("\n");
  const sourceUrl = post.sourceUrl ? `sourceUrl: ${yamlString(post.sourceUrl)}\n` : "";

  return `---
slug: ${yamlString(post.slug)}
title: ${yamlString(post.title)}
metaDescription: ${yamlString(post.metaDescription)}
date: ${yamlString(today)}
author: "Simple IT SRQ Team"
category: ${yamlString(post.category)}
tags:
${tags}
excerpt: ${yamlString(post.excerpt)}
heroAlt: ${yamlString(post.heroAlt)}
${sourceUrl}---

${post.body}
`;
}

async function githubGetFile(path, headers, branch) {
  const repo = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  const getUrl = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  return fetch(getUrl, { headers });
}

async function commitGithubFile({ path, content, message, sha }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || "budokai-msi/simpleitsrq.com";
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token) return { ok: false, error: "github_token_not_set" };

  const base = `https://api.github.com/repos/${repo}/contents/${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "simpleitsrq-agent",
  };
  const body = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    branch,
    committer: {
      name: "Simple IT SRQ Agent",
      email: "agent@simpleitsrq.com",
    },
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(base, {
    method: "PUT",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    const txt = await putRes.text().catch(() => "");
    if (putRes.status === 409) {
      return {
        ok: false,
        error: "github_conflict",
        hint: `${path} changed on GitHub between read and write.`,
      };
    }
    return { ok: false, error: `github_put_${putRes.status}`, detail: txt.slice(0, 300) };
  }
  const putData = await putRes.json();
  return {
    ok: true,
    commitSha: putData.commit?.sha,
    htmlUrl: putData.commit?.html_url,
    path,
  };
}

// Create content/posts/<slug>.mdx through the GitHub Contents API.
// Returns { ok, commitSha?, htmlUrl?, error?, alreadyInFile? }.
export async function publishDraftToGitHub(draft, overrides = {}) {
  const token = process.env.GITHUB_TOKEN;
  const branch = process.env.GITHUB_BRANCH || "main";

  if (!token) {
    return { ok: false, error: "github_token_not_set" };
  }

  const post = normalizedDraft(draft, overrides);
  const mdx = formatDraftAsMdx(draft, overrides);
  const path = `content/posts/${post.slug}.mdx`;

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "simpleitsrq-agent",
  };
  const getRes = await githubGetFile(path, headers, branch);
  if (!getRes.ok) {
    if (getRes.status === 404) {
      return commitGithubFile({
        path,
        content: mdx,
        message: `Publish blog post: ${post.title}`,
      });
    }
    const txt = await getRes.text().catch(() => "");
    return { ok: false, error: `github_get_${getRes.status}`, detail: txt.slice(0, 300) };
  }

  const meta = await getRes.json();
  const currentFile = Buffer.from(meta.content || "", "base64").toString("utf8");
  if (currentFile.includes(`slug: ${yamlString(post.slug)}`) || currentFile.includes(`slug: "${post.slug}"`)) {
    return { ok: true, alreadyInFile: true };
  }

  return commitGithubFile({
    path,
    content: mdx,
    message: `Update blog post: ${post.title}`,
    sha: meta.sha,
  });
}

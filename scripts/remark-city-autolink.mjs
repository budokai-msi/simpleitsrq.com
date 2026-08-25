// remark plugin: auto-link the first mention of each city name in MDX
// blog posts to its city landing page. Runs at MDX compile time so the
// links are baked into the rendered HTML — Googlebot picks them up
// without executing JS.
//
// Behavior:
//   - Matches whole-word, case-insensitive city names
//   - Only links the FIRST occurrence per post (subsequent mentions
//     stay as plain text — too much link density hurts both UX and SEO)
//   - Skips text inside existing links, code spans, code blocks, and
//     headings (linking heading text is noisy + steals anchor weight)
//   - If a post is itself a city page (frontmatter.slug starts with a
//     city slug), skip linking that city — no self-links
//
// Frontmatter support: posts can opt out by adding `noCityAutolink: true`
// to frontmatter. Useful when a post deliberately discusses cities at
// arms-length (a comparison post about Tampa, say).

import { visit, SKIP } from "unist-util-visit";

// Cities + their landing-page URLs. Importing from the data file would
// require it to be ESM-importable from a Node script, which it already
// is — but keeping a small literal map here means the plugin has zero
// runtime deps and runs faster across 60+ MDX files.
const CITY_LINKS = [
  { name: "Sarasota",        url: "/sarasota-it-support" },
  { name: "Bradenton",       url: "/bradenton-it-support" },
  { name: "Lakewood Ranch",  url: "/lakewood-ranch-it-support" },
  { name: "Nokomis",         url: "/nokomis-it-support" },
  { name: "Venice",          url: "/venice-it-support" },
  { name: "Palmetto",        url: "/palmetto-it-support" },
  { name: "Englewood",       url: "/englewood-it-support" },
  { name: "North Port",      url: "/north-port-it-support" },
  { name: "Osprey",          url: "/osprey-it-support" },
  { name: "Parrish",         url: "/parrish-it-support" },
  { name: "Ellenton",        url: "/ellenton-it-support" },
  // Skip "Bradenton 34207" — too narrow for blog autolink; visitors who
  // need it find it via /bradenton-it-support → linked from city hub.
];

// Built once: a single regex that matches any city name in any case,
// with word boundaries so "Sarasota County" matches "Sarasota" but
// "Bradentonville" doesn't match "Bradenton". Sorted longest-first so
// "Lakewood Ranch" wins over a hypothetical "Lakewood".
const CITY_RE = (() => {
  const sorted = [...CITY_LINKS].sort((a, b) => b.name.length - a.name.length);
  const escaped = sorted.map((c) => c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
})();

const cityUrlByName = new Map(CITY_LINKS.map((c) => [c.name.toLowerCase(), c.url]));

export default function remarkCityAutolink() {
  return (tree, file) => {
    const fm = file?.data?.frontmatter || {};
    if (fm.noCityAutolink) return;

    // Track per-city occurrence count so we link every Nth mention
    // (default: 1st, 4th, 7th, ...). The first mention always gets
    // linked; subsequent mentions space out so the post doesn't end up
    // with a wall of identical anchor text near the top.
    //
    //   COUNTER: 1st -> link
    //            2nd -> skip
    //            3rd -> skip
    //            4th -> link
    //            5th -> skip
    //            6th -> skip
    //            7th -> link
    //
    // This triples the inbound link density to ~3 links per post
    // (was ~0.6) without making the anchor text feel spammy.
    const LINK_EVERY = 3;
    const cityOccurrences = new Map();
    const linkedCities = new Set(); // set of city keys already linked at least once (so we always link the first occurrence)

    // If the post is about a specific city (slug matches one of our
    // landing pages), skip linking that city to itself.
    if (typeof fm.slug === "string") {
      for (const c of CITY_LINKS) {
        if (fm.slug.toLowerCase().includes(c.name.toLowerCase().replace(/\s+/g, "-"))) {
          linkedCities.add(c.name.toLowerCase());
        }
      }
    }

    visit(tree, "text", (node, index, parent) => {
      // Skip text inside structures where we don't want to inject links.
      if (!parent || index == null) return;
      const ptype = parent.type;
      if (
        ptype === "link"      ||  // already a link
        ptype === "linkReference" ||
        ptype === "heading"   ||  // never link heading text
        ptype === "inlineCode" ||
        ptype === "code"      ||  // code blocks
        ptype === "definition"
      ) return;

      const value = node.value || "";
      if (!value || !CITY_RE.test(value)) return;
      // The .test above moves lastIndex on the regex; reset before we
      // consume the match.
      CITY_RE.lastIndex = 0;

      const newChildren = [];
      let cursor = 0;
      let m;
      while ((m = CITY_RE.exec(value)) !== null) {
        const matched = m[1];
        const key = matched.toLowerCase();
        const url = cityUrlByName.get(key);
        if (!url) continue;

        // Bump the per-city occurrence counter. The first occurrence
        // always links; subsequent ones link every LINK_EVERYth time.
        const occurrences = (cityOccurrences.get(key) || 0) + 1;
        cityOccurrences.set(key, occurrences);
        const alreadyLinked = linkedCities.has(key);
        const shouldLink = !alreadyLinked || (occurrences - 1) % LINK_EVERY === 0;
        if (!shouldLink) continue;

        // Push text before the match
        if (m.index > cursor) {
          newChildren.push({ type: "text", value: value.slice(cursor, m.index) });
        }
        // Push the link node
        newChildren.push({
          type: "link",
          url,
          title: `IT support in ${matched}`,
          children: [{ type: "text", value: matched }],
          data: {
            hProperties: {
              // Mark for analytics + so we never re-process accidentally.
              "data-city-autolink": key,
            },
          },
        });
        cursor = m.index + matched.length;
        linkedCities.add(key);
      }
      // No replacements made → nothing to do
      if (cursor === 0 && newChildren.length === 0) return;

      // Push any trailing text after the last match
      if (cursor < value.length) {
        newChildren.push({ type: "text", value: value.slice(cursor) });
      }

      // Replace the original text node with the new mixed children.
      // unist-util-visit lets us splice into parent.children directly.
      parent.children.splice(index, 1, ...newChildren);
      // Skip into the new nodes — visit() would otherwise re-visit our
      // freshly inserted text nodes and could double-process if we're
      // ever called twice in the same pipeline.
      return [SKIP, index + newChildren.length];
    });
  };
}

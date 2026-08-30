const STOP_WORDS = new Set([
  "about","after","again","against","among","because","before","being","between","could","from","have","into","more","most","other","over","same","such","than","that","their","there","these","they","this","those","through","under","very","what","when","where","which","while","with","would","your","ours","will","were","been","also","just","some","news","says","using","used","new","how","why"
]);

const COMMERCIAL_RE = /backup|password|mfa|2fa|phishing|security|ransomware|storage|ssd|hard drive|laptop|workstation|wifi|wireless|router|switch|network|power|outage|ups|dock|usb-c|monitor|remote work|cloud|microsoft 365|google workspace|nas|server|data loss|recovery/i;
const LOCAL_SERVICE_RE = /computer|windows|laptop|desktop|workstation|hardware|ssd|hard drive|memory|ram|wifi|wireless|router|network|microsoft 365|printer|backup|malware|ransomware|outage|server/i;
const LEADGEN_RE = /sales|marketing|crm|prospect|lead generation|leadgen|pipeline|local business|customer acquisition|outbound|enrichment|business data/i;

function tokens(value) {
  return Array.from(new Set(String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))));
}

export function topicSimilarity(a, b) {
  const aa = new Set(tokens(a));
  const bb = new Set(tokens(b));
  if (!aa.size || !bb.size) return 0;
  let overlap = 0;
  for (const token of aa) if (bb.has(token)) overlap += 1;
  const union = new Set([...aa, ...bb]).size;
  return union ? overlap / union : 0;
}

export function isNovelStory(story, recent = []) {
  const title = String(story?.title || "");
  const url = String(story?.url || "").toLowerCase();
  if (!title || !url) return false;
  for (const item of recent) {
    const recentTitle = String(item?.title || "");
    const recentBody = String(item?.body || "");
    const recentSource = String(item?.source_url || item?.sourceUrl || "").toLowerCase();
    if (recentSource && recentSource === url) return false;
    if (recentBody && recentBody.toLowerCase().includes(url)) return false;
    if (topicSimilarity(title, recentTitle) >= 0.62) return false;
  }
  return true;
}

export function scoreHnStory(story, rank = 0, nowSeconds = Date.now() / 1000) {
  const score = Number(story?.score || 0);
  const comments = Number(story?.descendants || 0);
  const ageHours = Math.max(0.5, (nowSeconds - Number(story?.time || nowSeconds)) / 3600);
  const pointsPerHour = score / ageHours;
  const commentsPerHour = comments / ageHours;
  const freshness = Math.max(0, 36 - ageHours) / 36;
  const frontPage = Math.max(0, 80 - Number(rank || 0)) / 80;
  const commercial = COMMERCIAL_RE.test(`${story?.title || ""} ${story?.url || ""}`) ? 1 : 0;

  // Raw popularity still matters, but velocity + freshness prevent yesterday's
  // giant story from beating a fast-rising story every single day.
  const trendScore =
    Math.log2(score + 1) * 17 +
    Math.log2(comments + 1) * 8 +
    Math.log2(pointsPerHour + 1) * 24 +
    Math.log2(commentsPerHour + 1) * 12 +
    freshness * 22 +
    frontPage * 12 +
    commercial * 8;

  return {
    trendScore: Math.round(trendScore * 10) / 10,
    ageHours: Math.round(ageHours * 10) / 10,
    pointsPerHour: Math.round(pointsPerHour * 10) / 10,
    commentsPerHour: Math.round(commentsPerHour * 10) / 10,
    commercialFit: commercial === 1,
  };
}

export function rankFreshStories(candidates, recent = []) {
  const nowSeconds = Date.now() / 1000;
  return (Array.isArray(candidates) ? candidates : [])
    .map((story, rank) => ({ ...story, editorial: scoreHnStory(story, rank, nowSeconds) }))
    .filter((story) => isNovelStory(story, recent))
    .sort((a, b) => b.editorial.trendScore - a.editorial.trendScore);
}

const AFFILIATE_CANDIDATES = [
  { match: /password|mfa|2fa|phishing|credential|identity|login/i, token: "onepassword", label: "1Password Business", why: "team password and credential management" },
  { match: /backup|restore|ransomware|data loss|recovery|storage/i, token: "backblaze", label: "Backblaze", why: "off-machine backup for workstations" },
  { match: /backup|restore|ransomware|endpoint|cyber protect/i, token: "acronis", label: "Acronis Cyber Protect", why: "managed endpoint backup and recovery" },
  { match: /wifi|wireless|router|switch|access point|network/i, token: "ubiquiti", label: "Ubiquiti UniFi", why: "business networking hardware" },
  { match: /power|outage|surge|battery|ups/i, token: "amazon_search:APC UPS battery backup sine wave|UPS battery backup", label: "UPS battery backup", why: "keeping network gear and one key workstation online through short power events" },
  { match: /ssd|hard drive|storage upgrade|disk failure/i, token: "amazon_search:NVMe SSD 2TB business workstation|2TB NVMe SSD", label: "NVMe SSD", why: "workstation storage replacement or upgrade" },
  { match: /laptop|usb-c|thunderbolt|dock|hybrid work|monitor/i, token: "amazon_search:Thunderbolt 4 dock dual monitor ethernet|Thunderbolt 4 dock", label: "Thunderbolt dock", why: "single-cable laptop desks with displays and wired Ethernet" },
  { match: /ethernet|cabling|network troubleshooting|switch port/i, token: "amazon_search:ethernet cable tester network technician|Ethernet cable tester", label: "Ethernet cable tester", why: "basic wired-network fault isolation" },
];

export function affiliateOpportunities(story, articleText = "") {
  const haystack = `${story?.title || ""}\n${story?.url || ""}\n${String(articleText).slice(0, 12000)}`;
  return AFFILIATE_CANDIDATES.filter((item) => item.match.test(haystack)).slice(0, 3);
}

export function seoBriefForStory(story) {
  const title = String(story?.title || "");
  const titleTokens = tokens(title).slice(0, 8);
  const base = titleTokens.join(" ");
  const serviceFit = LOCAL_SERVICE_RE.test(title);
  const leadgenFit = LEADGEN_RE.test(title);
  const intent = serviceFit ? "problem-solving / local IT service" : leadgenFit ? "business research / prospecting" : "informational technology news";
  return {
    searchIntent: intent,
    primaryQuery: base,
    secondaryQueries: [
      serviceFit ? `${base} small business` : `${base} explained`,
      serviceFit ? `${base} business impact` : `${base} what it means`,
      `${base} practical steps`,
    ].filter(Boolean),
    preferredInternalCta: leadgenFit ? "/leadgen" : serviceFit ? "/services" : "/blog",
  };
}

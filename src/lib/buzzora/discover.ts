import "server-only";

// Finds candidate news items about homeschooling and unschooling law and
// policy from two free sources that need no key:
//   - GDELT (a global news index; many languages; asks for one request per 5 seconds)
//   - Bing News RSS (a few extra items per search)
// Both give direct addresses of the original articles. Nothing is trusted yet:
// the collector filters by site, asks the AI to judge, and reads the article itself.

export interface Candidate { url: string; title: string; domain: string; lang?: string; country?: string; seen?: string; published?: string; via: "gdelt" | "bing" }

const TOPIC_EN = '(homeschooling OR homeschool OR unschooling OR "home education" OR "home schooling")';
const ACTION_EN = '(law OR bill OR legislation OR regulation OR ruling OR court OR ban OR permit OR "tax credit" OR "education savings account" OR notification OR mandatory)';

// One global English search plus searches in the languages of the countries Clara named.
const GDELT_QUERIES: string[] = [
  `${TOPIC_EN} ${ACTION_EN} sourcelang:english`,
  `${TOPIC_EN} (legislature OR governor OR minister OR parliament OR "school choice" OR ESA) sourcelang:english`,
  '(在家教育 OR 在家自學 OR 實驗教育 OR 非學校型態 OR 在家上學 OR 居家教育 OR 在家学习) (法 OR 條例 OR 条例 OR 規定 OR 规定 OR 修法 OR 政策)',
  '(ホームスクール OR ホームエデュケーション OR 教育機会確保法) (法 OR 制度 OR 規制 OR 義務教育)',
  '(Homeschooling OR Hausunterricht OR Heimunterricht) (Gesetz OR Verbot OR Schulpflicht)',
  '("instruction en famille" OR "école à la maison") (loi OR autorisation OR réforme)',
  '(kotiopetus OR hemundervisning OR hjemmeundervisning OR thuisonderwijs OR "educación en casa") (laki OR lag OR lov OR wet OR ley)',
];

// Bing News takes a "market" (language and country), so each country Clara named gets searches in its own language.
const BING_QUERIES: { q: string; mkt: string }[] = [
  { q: "homeschooling law", mkt: "en-US" }, { q: "homeschool bill legislature", mkt: "en-US" }, { q: "unschooling regulation", mkt: "en-US" },
  { q: "homeschool education savings account tax credit", mkt: "en-US" }, { q: "homeschooling ban court ruling", mkt: "en-US" },
  { q: "home education law", mkt: "en-GB" }, { q: "elective home education register", mkt: "en-GB" },
  { q: "homeschooling law", mkt: "en-CA" }, { q: "homeschooling regulation", mkt: "en-AU" },
  { q: "在家教育 法規", mkt: "zh-TW" }, { q: "實驗教育 非學校型態 修法", mkt: "zh-TW" }, { q: "在家學習 homeschool 條例", mkt: "zh-HK" },
  { q: "ホームスクール 法律 制度", mkt: "ja-JP" }, { q: "不登校 義務教育 制度 改正", mkt: "ja-JP" },
  { q: "Homeschooling Verbot Schulpflicht Gesetz", mkt: "de-DE" }, { q: "instruction en famille loi autorisation", mkt: "fr-FR" },
  { q: "homeschooling lov forbud", mkt: "da-DK" }, { q: "kotiopetus laki lupa", mkt: "fi-FI" }, { q: "thuisonderwijs wet", mkt: "nl-NL" },
  { q: "educación en casa ley", mkt: "es-ES" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = "AOEhubBot/1.0 (+https://aoe.ai)";

function gdeltDate(v?: string): string | undefined {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v ?? "");
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : undefined;
}

async function gdelt(query: string): Promise<Candidate[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=40&format=json&timespan=3d&sort=DateDesc`;
  let res: Response;
  try { res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25_000) }); }
  catch { await sleep(6_000); res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(25_000) }); } // GDELT often times out once
  if (!res.ok) return [];
  let data: { articles?: { url: string; title: string; domain: string; language?: string; sourcecountry?: string; seendate?: string }[] };
  try { data = await res.json(); } catch { return []; } // GDELT answers with plain text when it is busy
  return (data.articles ?? []).map((a) => ({ url: a.url, title: a.title, domain: a.domain, lang: a.language, country: a.sourcecountry, seen: a.seendate, published: gdeltDate(a.seendate), via: "gdelt" as const }));
}

async function bing(query: string, mkt: string, days: number): Promise<Candidate[]> {
  // Bing's own date filter: interval 8 = past 7 days, 9 = past 30 days.
  const interval = days <= 7 ? 8 : 9;
  const res = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&mkt=${mkt}&qft=${encodeURIComponent(`interval="${interval}"`)}`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return [];
  const xml = await res.text();
  const out: Candidate[] = [];
  for (const item of xml.split(/<item[ >]/).slice(1)) {
    const title = /<title>([\s\S]*?)<\/title>/.exec(item)?.[1];
    const link = /<link>([\s\S]*?)<\/link>/.exec(item)?.[1]?.replace(/&amp;/g, "&");
    const pub = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(item)?.[1];
    const published = pub && !Number.isNaN(Date.parse(pub)) ? new Date(pub).toISOString() : undefined;
    if (!title || !link) continue;
    let real = link;
    try { real = new URL(link).searchParams.get("url") ?? link; } catch { /* keep link */ }
    try {
      out.push({ url: real, title: title.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'"), domain: new URL(real).hostname.replace(/^www\./, ""), published, via: "bing" });
    } catch { /* skip malformed */ }
  }
  return out;
}

export async function discoverCandidates(opts: { gdeltQueries?: number; days?: number } = {}): Promise<{ candidates: Candidate[]; log: string[] }> {
  const log: string[] = [];
  const all: Candidate[] = [];
  let bingFailed = 0;
  for (const { q, mkt } of BING_QUERIES) {
    try { all.push(...(await bing(q, mkt, opts.days ?? 7))); } catch { bingFailed++; }
  }
  if (bingFailed) log.push(`${bingFailed} Bing searches failed`);
  const queries = GDELT_QUERIES.slice(0, opts.gdeltQueries ?? GDELT_QUERIES.length);
  let gdeltFailed = 0;
  for (const q of queries) {
    try { all.push(...(await gdelt(q))); } catch { gdeltFailed++; }
    await sleep(5_500); // GDELT's rule: one request every 5 seconds
  }
  if (gdeltFailed) log.push(`${gdeltFailed} of ${queries.length} GDELT searches failed (it is often slow; Bing still works)`);
  const seen = new Set<string>();
  const unique = all.filter((c) => { const k = c.url.replace(/[?#].*$/, "").replace(/\/$/, ""); if (seen.has(k)) return false; seen.add(k); return true; });
  // Only recent news: anything the feed dates older than the window (7 days by default) is dropped (an item with no date is judged later, from the article itself).
  const cutoff = Date.now() - (opts.days ?? 7) * 86_400_000;
  const recent = unique.filter((c) => !c.published || Date.parse(c.published) >= cutoff);
  log.push(`found ${all.length} items, ${unique.length} different addresses, ${recent.length} recent`);
  return { candidates: recent, log };
}

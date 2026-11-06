// Which web sites the Buzzora job may use as a source: government sites and
// major news outlets. Anything else is skipped. The Creator can add more
// domains in hub_settings ("buzzora_extra_domains", a list of domain names).

// Government and official bodies, by the shape of their address.
const GOVERNMENT = [
  /(^|\.)gov$/, /(^|\.)gov\.[a-z]{2}$/, /(^|\.)gob\.[a-z]{2}$/, /(^|\.)gouv\.[a-z]{2}$/, /(^|\.)go\.[a-z]{2}$/,
  /(^|\.)gc\.ca$/, /(^|\.)canada\.ca$/, /(^|\.)parliament\.[a-z.]+$/, /(^|\.)europa\.eu$/, /(^|\.)edu\.gov\.[a-z]{2}$/,
  /(^|\.)gov\.uk$/, /(^|\.)legislation\.gov\.uk$/, /(^|\.)govt\.nz$/, /(^|\.)mext\.go\.jp$/, /(^|\.)moe\.gov\.[a-z]{2}$/,
  /(^|\.)bundesregierung\.de$/, /(^|\.)admin\.ch$/, /(^|\.)gov\.hk$/, /(^|\.)gov\.tw$/, /(^|\.)state\.[a-z]{2}\.us$/,
  /(^|\.)(k12|doe)\.[a-z]{2}\.us$/, /(^|\.)ed\.gov$/, /(^|\.)congress\.gov$/,
];

// Major news outlets and wire services.
const MAJOR_NEWS = [
  "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "theguardian.com", "nytimes.com", "washingtonpost.com", "wsj.com",
  "npr.org", "pbs.org", "cnn.com", "nbcnews.com", "cbsnews.com", "abcnews.go.com", "usatoday.com", "bloomberg.com", "politico.com",
  "axios.com", "thehill.com", "newsweek.com", "time.com", "economist.com", "ft.com", "telegraph.co.uk", "independent.co.uk",
  "dailymail.co.uk", "sky.com", "itv.com", "cbc.ca", "ctvnews.ca", "globalnews.ca", "theglobeandmail.com", "thestar.com",
  "abc.net.au", "smh.com.au", "theage.com.au", "theaustralian.com.au", "9news.com.au", "news.com.au", "nzherald.co.nz", "rnz.co.nz",
  "aljazeera.com", "dw.com", "france24.com", "euronews.com", "lemonde.fr", "spiegel.de", "nordiskpost.com", "yle.fi", "hs.fi",
  "thelocal.com", "thelocal.se", "thelocal.de", "irishtimes.com", "rte.ie",
  "nhk.or.jp", "japantimes.co.jp", "asahi.com", "mainichi.jp", "yomiuri.co.jp", "kyodonews.net", "nikkei.com",
  "taipeitimes.com", "focustaiwan.tw", "cna.com.tw", "udn.com", "ltn.com.tw", "chinatimes.com", "setn.com", "storm.mg", "cw.com.tw",
  "scmp.com", "rthk.hk", "hk01.com", "thestandard.com.hk", "hongkongfp.com", "mingpao.com", "straitstimes.com", "channelnewsasia.com",
  "koreaherald.com", "koreatimes.co.kr", "yna.co.kr", "chinadaily.com.cn", "xinhuanet.com", "news.cn", "thepaper.cn", "caixin.com", "people.com.cn",
  "hindustantimes.com", "thehindu.com", "indianexpress.com", "timesofindia.indiatimes.com", "ndtv.com",
  "edweek.org", "chalkbeat.org", "the74million.org", "hechingerreport.org", "k12dive.com", "ednc.org", "yahoo.com",
];

const hostMatches = (host: string, base: string) => host === base || host.endsWith("." + base);

export function isTrustedSource(rawUrl: string, extraDomains: string[] = []): boolean {
  let u: URL;
  try { u = new URL(rawUrl); } catch { return false; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const host = u.hostname.toLowerCase();
  if (GOVERNMENT.some((re) => re.test(host))) return true;
  return [...MAJOR_NEWS, ...extraDomains.map((d) => d.toLowerCase())].some((d) => hostMatches(host, d));
}

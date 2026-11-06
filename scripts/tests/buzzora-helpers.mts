import { platformOf, cleanVideoUrl } from "./platforms.mts";
import { isTrustedSource } from "./trusted.mts";
import { cleanText, canonicalUrl, parseJson } from "./text.mts";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fails++; console.log(ok ? "PASS" : "FAIL", name, ok ? "" : `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); };

// platforms
eq("youtube watch", platformOf("https://www.youtube.com/watch?v=abc"), "youtube");
eq("youtu.be", platformOf("https://youtu.be/abc"), "youtube");
eq("bilibili", platformOf("https://www.bilibili.com/video/BV1xx"), "bilibili");
eq("tiktok", platformOf("https://www.tiktok.com/@a/video/1"), "tiktok");
eq("xiaohongshu", platformOf("https://www.xiaohongshu.com/explore/1"), "xiaohongshu");
eq("wechat", platformOf("https://mp.weixin.qq.com/s/abc"), "wechat");
eq("facebook", platformOf("https://www.facebook.com/watch/?v=1"), "facebook");
eq("http refused", platformOf("http://www.youtube.com/watch?v=abc"), null);
eq("lookalike host refused", platformOf("https://youtube.com.evil.com/watch?v=abc"), null);
eq("password in url refused", platformOf("https://user:pw@www.youtube.com/watch?v=abc"), null);
eq("unrelated refused", platformOf("https://example.com/x"), null);
eq("youtu.be cleaned", cleanVideoUrl("https://youtu.be/abc?si=track#t=3"), "https://www.youtube.com/watch?v=abc");
eq("tracking removed", cleanVideoUrl("https://www.youtube.com/watch?v=abc&utm_source=x&feature=share"), "https://www.youtube.com/watch?v=abc");

// trusted sources
eq("gov.uk", isTrustedSource("https://www.gov.uk/home-education"), true);
eq("ed.gov", isTrustedSource("https://www.ed.gov/x"), true);
eq("bbc", isTrustedSource("https://www.bbc.com/news/x"), true);
eq("taipei times", isTrustedSource("https://www.taipeitimes.com/News/x"), true);
eq("random blog refused", isTrustedSource("https://myhomeschoolblog.com/post"), false);
eq("lookalike refused", isTrustedSource("https://bbc.com.evil.net/x"), false);
eq("fake gov refused", isTrustedSource("https://gov.evil.com/x"), false);
eq("extra domain", isTrustedSource("https://hslda.org/x", ["hslda.org"]), true);
eq("ftp refused", isTrustedSource("ftp://bbc.com/x"), false);

// cleaning AI text
eq("urls removed", cleanText("See https://evil.com/x now", 100), "See now");
eq("html removed", cleanText("Hello <script>alert(1)</script> world", 100), "Hello alert(1) world");
eq("bidi controls removed", cleanText("a‮b", 10), "ab");
eq("length cap", cleanText("x".repeat(50), 10).length, 10);
eq("non-string", cleanText(42, 10), "");
eq("json from chatter", parseJson('Sure! {"a":1} done'), { a: 1 });
eq("canonical", canonicalUrl("https://Example.com/a/?utm_source=x&id=2#frag"), "https://example.com/a?id=2");
console.log(fails ? `\n${fails} FAILED` : "\nAll unit checks passed");
process.exit(fails ? 1 : 0);

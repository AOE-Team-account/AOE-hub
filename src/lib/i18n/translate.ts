// On-demand translation of user-generated content (post titles/descriptions,
// file intros, comments) — separate from the fixed UI dictionary above.
//
// Rules from project memory:
//  - Only the surrounding text is translated, never the contents of a
//    downloaded file.
//  - Cache a translation the first time it's requested and serve the cached
//    version to everyone after that, rather than re-translating on every
//    view. Only genuinely new/uncached content should trigger a new call.
//
// Phase 1: no real translation API yet, so this ships a small seeded cache
// (ported from hub-prototype.html's CONTENT_TRANSLATIONS) plus an
// interface Phase 8 can swap a real provider into without touching call
// sites — this is the module that owns the cache-then-call pattern.

export interface ContentTranslator {
  translate(text: string, targetLang: "zh"): Promise<string>;
}

const SEEDED_TRANSLATIONS: Record<string, string> = {
  "A gentle, low-pressure phonics sequence I built for my daughter when she was 5. Short daily lessons, no worksheets she'd dread. Posted in three language versions below.":
    "这是我在女儿5岁时为她设计的一套温和、低压力的拼读课程。每天只需简短练习，没有让她害怕的练习册。下面提供三种语言版本。",
  "Did this work for a kid who already knows most letter sounds?":
    "如果孩子已经认识大部分字母发音，这套课程还适合吗？",
  "\"Education is an atmosphere, a discipline, a life.\" Charlotte Mason's words changed how I think about our homeschool days — not lessons to check off, but a way of living together.":
    "\"教育是一种氛围、一种纪律、一种生活。\"夏洛特·梅森的这句话改变了我对我们家在家教育日常的看法——不是要打勾完成的课程，而是一种共同生活的方式。",
};

// first-request-caches-forever, shared by everyone viewing the same string
const runtimeCache = new Map<string, string>();

const seededTranslator: ContentTranslator = {
  async translate(text) {
    return SEEDED_TRANSLATIONS[text] ?? text;
  },
};

// The single place that decides which translator backs on-demand content
// translation. Swap for a real API in Phase 8.
const activeTranslator: ContentTranslator = seededTranslator;

export async function translateContent(text: string): Promise<string> {
  const cached = runtimeCache.get(text);
  if (cached !== undefined) return cached;
  const translated = await activeTranslator.translate(text, "zh");
  runtimeCache.set(text, translated);
  return translated;
}

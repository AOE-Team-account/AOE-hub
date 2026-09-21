// Splits text into overlapping chunks on paragraph/sentence boundaries so a
// retrieved chunk reads as a coherent passage rather than a mid-sentence
// slice. Deterministic: the same text always yields the same chunks, which
// is what lets a long book's indexing resume where it left off.

export function chunkText(text: string, maxChars = 1000, overlapChars = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];

  const pieces: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= maxChars) {
      pieces.push(p);
      continue;
    }
    const sentences = p.match(/[^.!?。！？\n]+[.!?。！？]*\s*/g) ?? [p];
    let current = "";
    for (const s of sentences) {
      if (s.length > maxChars) {
        if (current) pieces.push(current.trim());
        current = "";
        for (let i = 0; i < s.length; i += maxChars) pieces.push(s.slice(i, i + maxChars).trim());
      } else if ((current + s).length > maxChars) {
        pieces.push(current.trim());
        current = s;
      } else {
        current += s;
      }
    }
    if (current.trim()) pieces.push(current.trim());
  }

  const chunks: string[] = [];
  let buf = "";
  for (const piece of pieces) {
    if (buf && buf.length + piece.length + 2 > maxChars) {
      chunks.push(buf);
      const tail = buf.slice(-overlapChars);
      const cut = tail.search(/\s/);
      buf = (cut >= 0 ? tail.slice(cut + 1) : tail) + "\n\n" + piece;
    } else {
      buf = buf ? buf + "\n\n" + piece : piece;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

/** Lightweight bag-of-words cosine similarity used for duplicate detection. */

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "is", "it", "this",
  "that", "there", "here", "for", "with", "has", "have", "been", "very", "near",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function vector(text: string): Map<string, number> {
  const v = new Map<string, number>();
  for (const t of tokenize(text)) v.set(t, (v.get(t) ?? 0) + 1);
  return v;
}

export function cosineSimilarity(a: string, b: string): number {
  if (!a?.trim() || !b?.trim()) return 0;
  const va = vector(a);
  const vb = vector(b);
  let dot = 0;
  for (const [term, count] of va) dot += count * (vb.get(term) ?? 0);
  if (dot === 0) return 0;
  let na = 0;
  let nb = 0;
  for (const c of va.values()) na += c * c;
  for (const c of vb.values()) nb += c * c;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Same named place, or one location string clearly contained in the other. */
export function sameLocation(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.includes(y) || y.includes(x)) return true;
  return cosineSimilarity(x, y) >= 0.7;
}

import "server-only";
import path from "node:path";
import { loadCatalog, type CatalogQuestion } from "./catalog-core.mjs";

/** What the browser may see: everything except the opening and the hidden spec. */
export interface PublicQuestion { id: string; title: string; cat: string; diff: "Easy" | "Medium" | "Hard"; desc: string; featured: boolean; levels: string[]; tags: string[] }

let cache: CatalogQuestion[] | null = null;
function all(): CatalogQuestion[] {
  // Re-read on every call in development so edits to questions/*.md show up without a restart.
  if (cache && process.env.NODE_ENV === "production") return cache;
  const qs = loadCatalog(path.join(process.cwd(), "questions"));
  for (const q of qs) if (q.errors.length) console.warn(`[catalog] Skipping questions/${q.id}.md: ${q.errors.join(" ")}`);
  cache = qs.filter((q) => !q.errors.length);
  return cache;
}

export function publicCatalog(): PublicQuestion[] {
  return all()
    .map((q) => ({ id: q.id, title: q.title, cat: q.category, diff: q.difficulty, desc: q.summary, featured: q.featured, levels: q.levels, tags: q.tags }))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || a.title.localeCompare(b.title));
}

export function getQuestion(id: string | undefined): CatalogQuestion | null {
  if (!id) return null;
  return all().find((q) => q.id === id) || null;
}

/**
 * "Let Alex choose": pick a catalog question for this candidate.
 * Prefers questions that suit the level, test the weakest competency (`focus`), and weren't practised recently.
 * Ties are broken at random so repeat sessions differ. Returns null only if the catalog is empty.
 */
export function pickQuestion(level: string, weakest: string | null, recent: string[]): CatalogQuestion | null {
  const qs = all(); if (!qs.length) return null;
  const pool = qs.filter((q) => q.levels.includes(level));
  const candidates = pool.length ? pool : qs;
  const score = (q: CatalogQuestion) => {
    let s = 0;
    if (weakest && q.focus.includes(weakest)) s += q.focus[0] === weakest ? 3 : 2;
    const seen = recent.indexOf(q.id);           // recent is newest first
    if (seen === -1) s += 2;                     // never practised
    else if (seen >= 3) s += 1;                  // practised, but not lately
    else s -= 3;                                 // one of the last three interviews
    return s;
  };
  const best = Math.max(...candidates.map(score));
  const top = candidates.filter((q) => score(q) === best);
  return top[Math.floor(Math.random() * top.length)];
}

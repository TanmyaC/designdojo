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

export interface CatalogQuestion {
  id: string; title: string; category: string; difficulty: "Easy" | "Medium" | "Hard"; summary: string;
  featured: boolean; levels: string[]; tags: string[]; opening: string; hiddenSpec: string;
  errors: string[]; warnings: string[];
}
export const CATEGORIES: string[];
export const DIFFICULTIES: string[];
export const LEVELS: string[];
export function slugify(title: string): string;
export function parseQuestion(id: string, text: string): CatalogQuestion;
export function loadCatalog(dir: string): CatalogQuestion[];

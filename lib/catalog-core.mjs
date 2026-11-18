// Question catalog: parse and validate questions/*.md.
// Plain JavaScript so the Next.js app and the Node scripts (questions:check, question:new) share one set of rules.
import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

export const CATEGORIES = ["Storage", "Real-time", "Feeds", "Infrastructure", "Payments", "Other"];
export const DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const LEVELS = ["Mid", "Senior", "Staff"];
export const FOCUS = ["storage", "distributed", "observability", "scoping"];
const KNOWN_KEYS = ["title", "category", "difficulty", "summary", "featured", "levels", "tags", "focus"];
// Sample sentences from _TEMPLATE.md that must not survive into a real question.
const TEMPLATE_TEXT = ["One sentence on what the system does", "Who uses it and for what", "Functional requirement 1", "Functional requirement 2",
  "Something a candidate might assume, but which isn't part of this problem"];
const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Turn a title into a file id: "Design a web crawler" -> "web-crawler". */
export function slugify(title) {
  return String(title).toLowerCase().replace(/^design\s+(an?\s+|the\s+)?/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

/** Split the Markdown body into its "## " sections. */
function sections(body) {
  const out = {}; let cur = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { cur = m[1].trim().toLowerCase(); out[cur] = []; continue; }
    if (cur) out[cur].push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("\n")]));
}

/** Parse one question file. Never throws: problems are returned in errors / warnings. */
export function parseQuestion(id, text) {
  const errors = [], warnings = [];
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { id, errors: ["Missing the front matter block between --- lines at the top of the file."], warnings };
  let meta = {};
  try { meta = parseYaml(m[1]) || {}; } catch (e) { return { id, errors: ["Front matter is not valid YAML: " + String(e.message).split("\n")[0]], warnings }; }
  if (typeof meta !== "object" || Array.isArray(meta)) return { id, errors: ["Front matter must be a list of key: value lines."], warnings };

  const str = (k) => (typeof meta[k] === "string" ? meta[k].trim() : meta[k] == null ? "" : String(meta[k]).trim());
  const title = str("title"), category = str("category"), difficulty = str("difficulty"), summary = str("summary");

  if (!ID_RE.test(id)) errors.push(`File name "${id}.md" must be lowercase words joined by hyphens, e.g. web-crawler.md.`);
  if (!title) errors.push("title is required.");
  else {
    if (!/^Design\b/.test(title)) errors.push(`title should start with "Design" (got "${title}").`);
    if (title.length > 80) errors.push(`title is ${title.length} characters; keep it to 80.`);
  }
  if (!CATEGORIES.includes(category)) errors.push(`category must be one of ${CATEGORIES.join(", ")} (got "${category}").`);
  if (!DIFFICULTIES.includes(difficulty)) errors.push(`difficulty must be one of ${DIFFICULTIES.join(", ")} (got "${difficulty}").`);
  if (!summary) errors.push("summary is required.");
  else if (summary.length > 140) errors.push(`summary is ${summary.length} characters; keep it to 140.`);

  let levels = LEVELS;
  if (meta.levels != null) {
    if (!Array.isArray(meta.levels) || !meta.levels.length) errors.push("levels must be a list like [Senior, Staff].");
    else { const bad = meta.levels.filter((l) => !LEVELS.includes(l)); if (bad.length) errors.push(`levels can only contain ${LEVELS.join(", ")} (got ${bad.join(", ")}).`); else levels = meta.levels; }
  }
  let tags = [];
  if (meta.tags != null) { if (!Array.isArray(meta.tags)) errors.push("tags must be a list like [websockets, caching]."); else tags = meta.tags.map(String); }
  let focus = [];
  if (meta.focus != null) {
    if (!Array.isArray(meta.focus)) errors.push("focus must be a list like [storage, distributed].");
    else { const bad = meta.focus.filter((f) => !FOCUS.includes(f)); if (bad.length) errors.push(`focus can only contain ${FOCUS.join(", ")} (got ${bad.join(", ")}).`); else focus = meta.focus; }
  } else warnings.push('No "focus" field: "Let Alex choose" can\'t match this question to a weak competency.');
  if (meta.featured != null && typeof meta.featured !== "boolean") errors.push("featured must be true or false.");
  for (const k of Object.keys(meta)) if (!KNOWN_KEYS.includes(k)) warnings.push(`Unknown field "${k}" is ignored.`);

  const sec = sections(stripComments(m[2]));
  const opening = (sec["opening"] || "").trim();
  const hiddenSpec = (sec["hidden spec"] || "").trim();
  for (const k of Object.keys(sec)) if (k !== "opening" && k !== "hidden spec") warnings.push(`Section "## ${k}" is not used; only "## Opening" and "## Hidden spec" are read.`);
  if (!hiddenSpec) warnings.push('No "## Hidden spec" section: Alex will invent the whole spec, so interviews on this question will vary more.');

  // Leftovers from the template.
  const all = [title, summary, opening, hiddenSpec].join("\n");
  if (/<[a-z][^>]*>/i.test(all.replace(/<!--[\s\S]*?-->/g, ""))) errors.push('Remove template placeholders like "<system>".');
  const leftovers = TEMPLATE_TEXT.filter((s) => all.includes(s));
  if (leftovers.length) errors.push(`Example text from the template is still there: "${leftovers[0]}". Replace it with this question's details.`);
  if (/^\s*-\s*:?\s*$/m.test(hiddenSpec) || /^\s*-\s*[^:\n]+:\s*$/m.test(hiddenSpec)) errors.push("Hidden spec has empty bullets left from the template; fill them in or delete them.");

  return { id, title, category, difficulty, summary, featured: meta.featured === true, levels, tags, focus, opening, hiddenSpec, errors, warnings };
}

/** Read every question in a folder. Files starting with "_" (like _TEMPLATE.md) and README.md are skipped. */
export function loadCatalog(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && f.toLowerCase() !== "readme.md").sort();
  const qs = files.map((f) => parseQuestion(f.replace(/\.md$/, ""), fs.readFileSync(path.join(dir, f), "utf8")));
  const seen = new Map();
  for (const q of qs) {
    if (!q.title) continue;
    const key = q.title.toLowerCase();
    if (seen.has(key)) q.errors.push(`Same title as ${seen.get(key)}.md.`); else seen.set(key, q.id);
  }
  return qs;
}

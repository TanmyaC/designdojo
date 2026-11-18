/* Model output follows the prompt's example shape most of the time, but not always:
   a field can come back as an object, a list as a single string, a rating as text.
   These helpers coerce replies into the shapes the pages render, so nothing crashes. */
import type { CompetencyResult, Debrief, Flag } from "./types";
import { COMP } from "./constants";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Any value as readable text. Objects become "key: value; key: value". */
export function txt(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join("; ");
  if (isObj(v)) return Object.entries(v).map(([k, x]) => { const t = txt(x); return t ? `${k.replace(/_/g, " ")}: ${t}` : ""; }).filter(Boolean).join("; ");
  return String(v);
}

/** Any value as a list of strings. A single string stays one item. */
export function list(v: unknown): string[] {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v.map(txt).filter(Boolean);
  if (isObj(v)) return Object.values(v).map(txt).filter(Boolean);
  return [txt(v)];
}

function rating(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.round(n) : null;
}

function flags(v: unknown): Flag[] {
  const items = Array.isArray(v) ? v : v == null || v === "" ? [] : [v];
  return items.map((f) => (isObj(f)
    ? { flag: txt(f.flag ?? f.text ?? f.name ?? f.title ?? Object.values(f)[0]), evidence: txt(f.evidence ?? f.quote ?? "") }
    : { flag: txt(f) })).filter((f) => f.flag);
}

function competencies(v: unknown): CompetencyResult[] {
  const raw: Record<string, unknown>[] = Array.isArray(v) ? v.filter(isObj)
    : isObj(v) ? Object.entries(v).map(([k, x]) => (isObj(x) ? { key: k, ...x } : { key: k, rating: x })) : [];
  return raw.map((c) => {
    const k = txt(c.key).toLowerCase(), n = txt(c.name).toLowerCase();
    // Match by key first, then by the start of the competency's name ("Storage", "Distributed systems…").
    const comp = COMP.find((x) => x.key === k) || COMP.find((x) => (n || k) && (n || k).startsWith(x.name.toLowerCase().slice(0, 8)));
    return { key: comp?.key || k, name: txt(c.name) || comp?.name, rating: rating(c.rating ?? c.score), green: flags(c.green), red: flags(c.red), strong_would_add: txt(c.strong_would_add) };
  });
}

export function normalizeDebrief(d: unknown): Debrief | null {
  if (!isObj(d)) return null;
  const sr = d.spec_reveal;
  const missed = d.missed;
  return {
    verdict: txt(d.verdict),
    verdict_reason: txt(d.verdict_reason),
    spec_reveal: isObj(sr) ? { real_problem: txt(sr.real_problem), scale: txt(sr.scale), crux: txt(sr.crux), how_close: txt(sr.how_close) } : sr ? { real_problem: txt(sr) } : undefined,
    competencies: competencies(d.competencies),
    missed: isObj(missed) ? { critical: list(missed.critical), nice_to_have: list(missed.nice_to_have ?? missed.nice) } : { critical: list(missed), nice_to_have: [] },
    moments: (Array.isArray(d.moments) ? d.moments : list(d.moments)).map((m) => {
      const text = isObj(m) ? txt(m.text ?? m.moment ?? m.description) : txt(m);
      const t = (isObj(m) ? txt(m.type) : "").toLowerCase();
      return { type: /bad|neg|concern|weak/.test(t) ? "bad" : /good|pos|strong/.test(t) ? "good" : "note", text };
    }).filter((m) => m.text),
    time_management: txt(d.time_management),
    top3: list(d.top3),
    session_log: isObj(d.session_log) ? { summary: txt(d.session_log.summary), recurring_gaps: list(d.session_log.recurring_gaps) } : undefined,
  };
}

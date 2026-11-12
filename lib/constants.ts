import type { Phase } from "./types";

export const COMP = [
  { key: "storage", name: "Storage", short: "Storage" },
  { key: "distributed", name: "Distributed systems & scalability", short: "Distributed" },
  { key: "observability", name: "Observability & reliability", short: "Observability" },
  { key: "scoping", name: "Problem scoping, collaboration & feedback", short: "Scoping & comms" },
] as const;

/* Time budget shares from the design: 8 / 15 / 20 / 7 of a 50-minute interview. */
export const PHASES: { key: Phase; name: string; label: string; weight: number; color: string; hint: string }[] = [
  { key: "scoping", name: "Scoping", label: "Scope", weight: 8, color: "var(--seg1)", hint: "Clarify users, features and scale. The estimates are yours to make." },
  { key: "high_level", name: "High-level", label: "Design", weight: 15, color: "var(--seg2)", hint: "Cover every requirement at a high level. Name the data model and the read path." },
  { key: "deep_dive", name: "Deep dive", label: "Deep dive", weight: 20, color: "var(--seg3)", hint: "Defend your choices: failures, hot spots and trade-offs. Go below the boxes." },
  { key: "wrap_up", name: "Wrap-up", label: "Wrap", weight: 7, color: "var(--seg4)", hint: "Say what you would improve with more time, then ask Alex your questions." },
];
export const PHASE_TOTAL = PHASES.reduce((a, p) => a + p.weight, 0);

export function phaseBudget(duration: number) {
  let acc = 0;
  return PHASES.map((p) => {
    const mins = (p.weight / PHASE_TOTAL) * duration;
    const start = acc; acc += mins;
    return { ...p, mins, start, end: acc };
  });
}

export const VERDICTS = ["Strong Hire", "Hire", "Lean Hire", "Lean No Hire", "No Hire"];
export function verdictTone(v?: string): "good" | "mid" | "bad" {
  const s = (v || "").toLowerCase();
  if (s.startsWith("strong") || s === "hire") return "good";
  if (s.startsWith("lean hire")) return "mid";
  return "bad";
}

/* Cost and token totals for one Claude call, or summed over a session.
   Shared by the server (which measures it) and the browser (which adds it up). */
export interface UsageSummary {
  costUSD: number;     // estimate from list prices; 0 when the model's price is unknown
  input: number;       // uncached input tokens (full price)
  cacheWrite: number;  // input tokens written to the prompt cache
  cacheRead: number;   // input tokens read from the prompt cache
  output: number;      // output tokens, thinking included
  calls: number;
}

export function addUsage(a: UsageSummary | undefined, b: UsageSummary | undefined): UsageSummary | undefined {
  if (!b) return a;
  if (!a) return { ...b };
  return {
    costUSD: a.costUSD + b.costUSD, input: a.input + b.input, cacheWrite: a.cacheWrite + b.cacheWrite,
    cacheRead: a.cacheRead + b.cacheRead, output: a.output + b.output, calls: a.calls + b.calls,
  };
}

/** Share of input tokens served from the cache, 0–1. */
export function cachedShare(u: UsageSummary): number {
  const all = u.input + u.cacheWrite + u.cacheRead;
  return all ? u.cacheRead / all : 0;
}

/** "$0.14 · 92% cached" */
export function fmtUsage(u: UsageSummary | undefined): string {
  if (!u) return "—";
  const c = u.costUSD < 0.01 ? `$${u.costUSD.toFixed(3)}` : `$${u.costUSD.toFixed(2)}`;
  return `${c} · ${Math.round(cachedShare(u) * 100)}% cached`;
}

/* The trailer /api/sam appends to its text stream so the browser can read the call's usage. */
export const USAGE_MARKER = "[[usage:";

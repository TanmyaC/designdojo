#!/usr/bin/env node
/* Summarises the llm_call log the server writes (logs/llm.jsonl by default in development).

   Run: npm run llm:report [-- path/to/llm.jsonl]

   Prints cost per interview, where the money goes, waiting time on /api/turn, cache health,
   and reliability. Costs are estimates from list prices (lib/usage.ts). */
import { readFileSync, existsSync } from "node:fs";

const file = process.argv[2] || process.env.LLM_LOG_FILE || "logs/llm.jsonl";
if (!existsSync(file)) { console.log(`No log at ${file}. Run the app with \`npm run dev\`, do an interview, then try again.`); process.exit(0); }

const events = readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => {
  try { const e = JSON.parse(l); return e.type === "llm_call" ? [e] : []; } catch { return []; }
});
if (!events.length) { console.log(`No llm_call events in ${file}.`); process.exit(0); }

const n = (x) => x || 0;
const usd = (x) => (x == null ? "  n/a" : x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);
const pct = (x) => `${Math.round(x * 100)}%`;
const ms = (x) => (x == null ? "n/a" : x >= 1000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);
const quantile = (xs, q) => { const s = xs.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : null; };
const inputAll = (e) => n(e.input_tokens) + n(e.cache_creation_input_tokens) + n(e.cache_read_input_tokens);
const hit = (es) => { const all = es.reduce((a, e) => a + inputAll(e), 0); return all ? es.reduce((a, e) => a + n(e.cache_read_input_tokens), 0) / all : 0; };
const group = (es, f) => es.reduce((m, e) => { const k = f(e); (m[k] ||= []).push(e); return m; }, {});
const sum = (es, f) => es.reduce((a, e) => a + n(f(e)), 0);
const table = (rows) => {
  const w = rows[0].map((_, i) => Math.max(...rows.map((r) => String(r[i]).length)));
  rows.forEach((r, j) => { console.log("  " + r.map((c, i) => String(c).padEnd(w[i])).join("  ")); if (!j) console.log("  " + w.map((x) => "-".repeat(x)).join("  ")); });
};

const first = events[0].ts, last = events.at(-1).ts;
console.log(`\n${events.length} Claude calls from ${first} to ${last}\n`);

/* ---------- cost ---------- */
const bySession = group(events.filter((e) => e.session_id), (e) => e.session_id);
const perSession = Object.values(bySession).map((es) => sum(es, (e) => e.cost_usd));
console.log("COST");
console.log(`  total ${usd(sum(events, (e) => e.cost_usd))} · ${perSession.length} interviews · median ${usd(quantile(perSession, 0.5))} · top 10% from ${usd(quantile(perSession, 0.9))}`);
const unpriced = events.filter((e) => e.model_served && e.cost_usd == null).length;
if (unpriced) console.log(`  ${unpriced} calls have no price (model missing from lib/usage.ts)`);
const byRoute = group(events, (e) => e.route + (e.call ? `:${e.call}` : ""));
table([["route", "calls", "cost", "share", "input", "cache write", "cache read", "output"],
  ...Object.entries(byRoute).sort((a, b) => sum(b[1], (e) => e.cost_usd) - sum(a[1], (e) => e.cost_usd)).map(([k, es]) => {
    const c = sum(es, (e) => e.cost_usd), all = sum(events, (e) => e.cost_usd) || 1;
    return [k, es.length, usd(c), pct(c / all), sum(es, (e) => e.input_tokens), sum(es, (e) => e.cache_creation_input_tokens), sum(es, (e) => e.cache_read_input_tokens), sum(es, (e) => e.output_tokens)];
  })]);

/* ---------- latency ---------- */
const turns = events.filter((e) => e.route === "turn" && e.outcome !== "cancelled");
console.log("\nWAITING TIME ON /api/turn (time to first token, total)");
if (turns.length) {
  console.log(`  TTFT p50 ${ms(quantile(turns.map((e) => e.ttft_ms), 0.5))} · p90 ${ms(quantile(turns.map((e) => e.ttft_ms), 0.9))} · total p50 ${ms(quantile(turns.map((e) => e.total_ms), 0.5))} · p90 ${ms(quantile(turns.map((e) => e.total_ms), 0.9))}`);
} else console.log("  no turns yet");

/* ---------- cache ---------- */
console.log("\nCACHE: share of input read from cache");
const byVersion = group(turns, (e) => e.prompt_version);
for (const [v, es] of Object.entries(byVersion)) {
  console.log(`  ${v}: ${pct(hit(es))} over ${es.length} turns`);
  const buckets = group(es, (e) => (e.turn_index < 4 ? "1-3" : e.turn_index < 10 ? "4-9" : e.turn_index < 20 ? "10-19" : "20+"));
  table([["transcript entries", "turns", "hit rate", "TTFT p50", "input tokens p50"],
    ...["1-3", "4-9", "10-19", "20+"].filter((b) => buckets[b]).map((b) => [b, buckets[b].length, pct(hit(buckets[b])), ms(quantile(buckets[b].map((e) => e.ttft_ms), 0.5)), quantile(buckets[b].map(inputAll), 0.5)])]);
}
for (const [r, es] of Object.entries(group(events.filter((e) => e.route === "sam"), (e) => e.prompt_version))) console.log(`  ${r}: ${pct(hit(es))} over ${es.length} calls`);
const cold = Object.entries(group(turns.filter((e) => e.turn_index > 1 && String(e.prompt_version).includes("cached")), (e) => e.session_id))
  .filter(([, es]) => es.every((e) => !n(e.cache_read_input_tokens))).map(([k]) => k);
if (cold.length) console.log(`  WARNING: ${cold.length} interview(s) never read from cache after the first turn: ${cold.join(", ")}. Something early in the prompt changes every turn; run npm run check:cache.`);

/* ---------- reliability ---------- */
console.log("\nRELIABILITY");
const outcomes = [...new Set(events.map((e) => e.outcome))];
table([["route", ...outcomes], ...Object.entries(byRoute).map(([k, es]) => [k, ...outcomes.map((o) => es.filter((e) => e.outcome === o).length)])]);
const fb = events.filter((e) => e.model_served && e.model_served !== e.model_requested);
console.log(`  fallback to another model: ${fb.length} of ${events.length} calls (${pct(fb.length / events.length)})`);
console.log("");

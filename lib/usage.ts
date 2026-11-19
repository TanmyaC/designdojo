import "server-only";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import type { UsageSummary } from "./usage-shared";

/* List prices in US dollars per million tokens. Cache writes cost 1.25x input (5-minute TTL)
   or 2x input (1-hour TTL). Check https://platform.claude.com/docs/en/about-claude/pricing when
   adding a model; a model missing here is logged with cost_usd: null. */
interface Price { input: number; output: number; cacheRead: number }
/* Cache-read prices marked "assumed" are the usual 0.1x of input; confirm them on the pricing page. */
const PRICES: Record<string, Price> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },      // assumed
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },        // assumed
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },      // assumed
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 }, // assumed; prompts up to 100K tokens
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
};

type Usage = Anthropic.Beta.BetaUsage;

/* Exact id first; otherwise the longest listed id the served model starts with
   (so a dated or suffixed id still prices, and claude-sonnet-5-5 never matches claude-sonnet-5). */
function priceOf(model: string): Price | undefined {
  if (PRICES[model]) return PRICES[model];
  const k = Object.keys(PRICES).filter((id) => model.startsWith(id + "-") || model.startsWith(id + "@")).sort((x, y) => y.length - x.length)[0];
  return k ? PRICES[k] : undefined;
}

/** Dollar cost of one response, priced by the model that actually served it. */
export function costUSD(model: string, u: Usage): number | null {
  const p = priceOf(model);
  if (!p) return null;
  const write = u.cache_creation_input_tokens || 0;
  const w1h = u.cache_creation?.ephemeral_1h_input_tokens || 0;
  const w5m = u.cache_creation ? u.cache_creation.ephemeral_5m_input_tokens || 0 : write;
  const usd = (u.input_tokens || 0) * p.input + w5m * p.input * 1.25 + w1h * p.input * 2
    + (u.cache_read_input_tokens || 0) * p.cacheRead + (u.output_tokens || 0) * p.output;
  return usd / 1e6;
}

export function summarize(model: string, u: Usage): UsageSummary {
  return {
    costUSD: costUSD(model, u) ?? 0, input: u.input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0, output: u.output_tokens || 0, calls: 1,
  };
}

export type Outcome = "ok" | "invalid_json" | "salvaged" | "refused" | "truncated" | "rate_limited" | "cancelled" | "error";

/* One line per Claude call. Numbers and labels only: never prompt or reply text. */
export interface LlmCallEvent {
  ts: string; route: string; call?: string; session_id?: string; turn_index?: number; prompt_version: string;
  model_requested: string; model_served?: string; effort: string; max_tokens: number;
  input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number;
  cache_write_1h_tokens?: number;
  ttft_ms?: number; total_ms: number; stop_reason?: string | null; refusal_category?: string | null;
  outcome: Outcome; request_id?: string | null; cost_usd?: number | null;
}

const LOG_FILE = process.env.LLM_LOG_FILE || (process.env.NODE_ENV !== "production" ? "logs/llm.jsonl" : "");
const warned = new Set<string>();

export function logCall(e: LlmCallEvent): void {
  const line = JSON.stringify({ type: "llm_call", ...e });
  console.log(line);
  if (e.model_served && e.cost_usd == null && !warned.has(e.model_served)) {
    warned.add(e.model_served);
    console.warn(`[usage] no price for ${e.model_served}; add it to PRICES in lib/usage.ts`);
  }
  if (LOG_FILE) {
    const file = path.resolve(LOG_FILE);
    mkdir(path.dirname(file), { recursive: true }).then(() => appendFile(file, line + "\n")).catch((err) => console.warn("[usage] could not write log:", err?.message));
  }
}

import "server-only";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { checkAccess } from "./server";
import { logCall, summarize, type Outcome } from "./usage";
import { USAGE_MARKER, type UsageSummary } from "./usage-shared";

export class AppError extends Error {
  constructor(public code: string, message?: string, public status = 500, public raw?: string, public usage?: UsageSummary) { super(message || code); }
}

/* One client per server process, created on first use. The SDK finds credentials itself:
   ANTHROPIC_API_KEY, then ANTHROPIC_AUTH_TOKEN, then an `ant auth login` profile. */
let client: Anthropic | null = null;
function api(): Anthropic {
  if (!client) {
    try { client = new Anthropic(); }
    catch (e) { throw new AppError("server_key", "No Anthropic credentials found: set ANTHROPIC_API_KEY or run `ant auth login`. " + String((e as Error)?.message || ""), 500); }
  }
  return client;
}

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ImageInput { media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }

/* A prompt laid out for caching: stable system blocks first, then real turns. Builders in
   lib/prompts.ts put cache_control breakpoints on the blocks that should be reused. */
export interface ClaudeRequest {
  system?: Anthropic.Beta.BetaTextBlockParam[];
  messages: Anthropic.Beta.BetaMessageParam[];
  promptVersion: string; // names the fixed prompt text, so logs can compare prompt changes
}

/* Who is calling, for the llm_call log line. */
export interface CallMeta { route: string; call?: string; sessionId?: string; turnIndex?: number }

export const shortHash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

/* A plain prompt string becomes one user message, as before (image first, then text). */
function toRequest(p: string | ClaudeRequest, image?: ImageInput): ClaudeRequest {
  if (typeof p !== "string") return p;
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
  content.push({ type: "text", text: p });
  return { messages: [{ role: "user", content }], promptVersion: "string-" + shortHash(p.slice(0, 2000)) };
}

function params(req: ClaudeRequest, effort: Effort, maxTokens: number) {
  return {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    // If a safety classifier declines, retry on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
    fallbacks: "default" as const,
    ...(req.system?.length ? { system: req.system } : {}),
    messages: req.messages,
  };
}

function mapError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof Anthropic.RateLimitError) return new AppError("rate_limited", "Rate limited", 429);
  if (e instanceof Anthropic.AuthenticationError) return new AppError("server_key", "The server's Anthropic API key is missing or invalid", 500);
  if (e instanceof Anthropic.BadRequestError) {
    const m = String(e.message || "");
    if (/prompt is too long|too many tokens/i.test(m)) return new AppError("prompt_too_large", m, 400);
    if (/image/i.test(m)) return new AppError("image_rejected", m, 400);
    return new AppError("bad_request", m, 400);
  }
  if (e instanceof Anthropic.APIUserAbortError) return new AppError("cancelled", "Cancelled", 499);
  // Raised by the SDK before any request when it finds no API key, auth token or `ant` profile.
  if (e instanceof Anthropic.AnthropicError && !(e instanceof Anthropic.APIError) && /authentication method/i.test(String(e.message)))
    return new AppError("server_key", "No Anthropic credentials found: set ANTHROPIC_API_KEY or run `ant auth login`", 500);
  if (e instanceof Anthropic.APIError) return new AppError("upstream", String(e.message), 502);
  return new AppError("unknown", String((e as Error)?.message || e), 500);
}

function outcomeOf(e: AppError): Outcome {
  return (["invalid_json", "refused", "truncated", "rate_limited", "cancelled"] as const).find((c) => c === e.code) || "error";
}

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  if (msg.stop_reason === "refusal") throw new AppError("refused", "Claude declined this request", 422);
  if (msg.stop_reason === "max_tokens") throw new AppError("truncated", "Reply hit the max_tokens limit before it finished", 502);
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/* Pull the first JSON object out of a reply (tolerates code fences and stray prose). */
export function parseJSON<T>(text: string): T {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  try { return JSON.parse(t) as T; } catch { throw new AppError("invalid_json", "Reply was not valid JSON", 502, text); }
}

/* Times one call and writes its llm_call log line. */
function tracker(req: ClaudeRequest, effort: Effort, maxTokens: number, meta?: CallMeta) {
  const t0 = Date.now();
  let ttft: number | undefined, msg: Anthropic.Beta.BetaMessage | undefined, requestId: string | null | undefined;
  return {
    onText() { if (ttft === undefined) ttft = Date.now() - t0; },
    done(m: Anthropic.Beta.BetaMessage, rid: string | null | undefined) { msg = m; requestId = rid; },
    usage(): UsageSummary | undefined { return msg ? summarize(msg.model, msg.usage) : undefined; },
    log(outcome: Outcome) {
      const u = msg?.usage;
      logCall({
        ts: new Date(t0).toISOString(), route: meta?.route || "unknown", call: meta?.call, session_id: meta?.sessionId, turn_index: meta?.turnIndex,
        prompt_version: req.promptVersion, model_requested: MODEL, model_served: msg?.model, effort, max_tokens: maxTokens,
        input_tokens: u?.input_tokens, cache_creation_input_tokens: u?.cache_creation_input_tokens ?? undefined,
        cache_read_input_tokens: u?.cache_read_input_tokens ?? undefined, output_tokens: u?.output_tokens,
        cache_write_1h_tokens: u?.cache_creation?.ephemeral_1h_input_tokens,
        ttft_ms: ttft, total_ms: Date.now() - t0, stop_reason: msg?.stop_reason, refusal_category: msg?.stop_details?.category ?? null,
        outcome, request_id: requestId, cost_usd: msg ? summarize(msg.model, msg.usage).costUSD : undefined,
      });
    },
  };
}

interface AskOpts<T> {
  effort?: Effort; maxTokens?: number; image?: ImageInput; signal?: AbortSignal; meta?: CallMeta;
  /** Last-chance recovery when the reply isn't valid JSON; return null to give up. */
  salvage?: (raw?: string) => T | null;
}

/* Ask for JSON. Streams under the hood so long generations don't hit HTTP timeouts. */
export async function askJSON<T>(prompt: string | ClaudeRequest, opts: AskOpts<T> = {}): Promise<{ data: T; usage?: UsageSummary }> {
  const effort = opts.effort || "medium", maxTokens = opts.maxTokens || 32000;
  const req = toRequest(prompt, opts.image);
  const t = tracker(req, effort, maxTokens, opts.meta);
  let outcome: Outcome = "error";
  try {
    const stream = api().beta.messages.stream(params(req, effort, maxTokens), { signal: opts.signal });
    stream.on("text", t.onText);
    const msg = await stream.finalMessage();
    t.done(msg, stream.request_id);
    const data = parseJSON<T>(textOf(msg));
    outcome = "ok";
    return { data, usage: t.usage() };
  } catch (e) {
    const err = mapError(e);
    if (err.code === "invalid_json" && opts.salvage) {
      const r = opts.salvage(err.raw);
      if (r) { outcome = "salvaged"; return { data: r, usage: t.usage() }; }
    }
    outcome = outcomeOf(err);
    err.usage = t.usage();
    throw err;
  } finally { t.log(outcome); }
}

/* Stream plain text (Markdown) back to the browser as it is written. On success the stream ends
   with a usage trailer ("[[usage:{...}]]") that lib/api.ts strips off. */
export function streamText(prompt: string | ClaudeRequest, opts: { effort?: Effort; maxTokens?: number; signal?: AbortSignal; meta?: CallMeta } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const effort = opts.effort || "medium", maxTokens = opts.maxTokens || 16000;
  const req = toRequest(prompt);
  return new ReadableStream({
    async start(ctrl) {
      const t = tracker(req, effort, maxTokens, opts.meta);
      let outcome: Outcome = "error";
      try {
        const stream = api().beta.messages.stream(params(req, effort, maxTokens), { signal: opts.signal });
        stream.on("text", (s) => { t.onText(); ctrl.enqueue(enc.encode(s)); });
        const msg = await stream.finalMessage();
        t.done(msg, stream.request_id);
        outcome = msg.stop_reason === "refusal" ? "refused" : msg.stop_reason === "max_tokens" ? "truncated" : "ok";
        if (outcome === "refused") ctrl.enqueue(enc.encode("\n\n_Claude declined to answer this one. Try rephrasing it._"));
        const u = t.usage();
        if (u) ctrl.enqueue(enc.encode(`\n${USAGE_MARKER}${JSON.stringify(u)}]]`));
        ctrl.close();
      } catch (e) {
        const err = mapError(e);
        outcome = outcomeOf(err);
        ctrl.enqueue(enc.encode(`\n\n[[error:${err.code}]]`));
        ctrl.close();
      } finally { t.log(outcome); }
    },
  });
}

/* Shared request guard: optional access code, JSON body, error mapping. */
export async function handle(req: Request, fn: (body: any) => Promise<Response>): Promise<Response> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const denied = checkAccess(req); if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: { code: "bad_request", message: "Invalid JSON body" } }, { status: 400 }); }
  try { return await fn(body); }
  catch (e) { const err = mapError(e); return Response.json({ error: { code: err.code, message: err.message, raw: err.raw?.slice(0, 4000) } }, { status: err.status }); }
}

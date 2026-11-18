import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export class AppError extends Error {
  constructor(public code: string, message?: string, public status = 500, public raw?: string) { super(message || code); }
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

function params(prompt: string, effort: Effort, maxTokens: number, image?: ImageInput) {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (image) content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
  content.push({ type: "text", text: prompt });
  return {
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { effort },
    // If a safety classifier declines, retry on a fallback model inside the same call.
    betas: ["server-side-fallback-2026-07-01"] as Anthropic.Beta.AnthropicBeta[],
    fallbacks: "default" as const,
    messages: [{ role: "user" as const, content }],
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

/* Ask for JSON. Streams under the hood so long generations don't hit HTTP timeouts. */
export async function askJSON<T>(prompt: string, opts: { effort?: Effort; maxTokens?: number; image?: ImageInput; signal?: AbortSignal } = {}): Promise<T> {
  try {
    const stream = api().beta.messages.stream(params(prompt, opts.effort || "medium", opts.maxTokens || 32000, opts.image), { signal: opts.signal });
    const msg = await stream.finalMessage();
    return parseJSON<T>(textOf(msg));
  } catch (e) { throw mapError(e); }
}

/* Stream plain text (Markdown) back to the browser as it is written. */
export function streamText(prompt: string, opts: { effort?: Effort; maxTokens?: number; signal?: AbortSignal } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      try {
        const stream = api().beta.messages.stream(params(prompt, opts.effort || "medium", opts.maxTokens || 16000), { signal: opts.signal });
        stream.on("text", (t) => ctrl.enqueue(enc.encode(t)));
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") ctrl.enqueue(enc.encode("\n\n_Claude declined to answer this one. Try rephrasing it._"));
        ctrl.close();
      } catch (e) {
        const err = mapError(e);
        ctrl.enqueue(enc.encode(`\n\n[[error:${err.code}]]`));
        ctrl.close();
      }
    },
  });
}

/* Shared request guard: optional access code, JSON body, error mapping. */
export async function handle(req: Request, fn: (body: any) => Promise<Response>): Promise<Response> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code") !== code) return Response.json({ error: { code: "access_code", message: "Access code required" } }, { status: 401 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: { code: "bad_request", message: "Invalid JSON body" } }, { status: 400 }); }
  try { return await fn(body); }
  catch (e) { const err = mapError(e); return Response.json({ error: { code: err.code, message: err.message, raw: err.raw?.slice(0, 4000) } }, { status: err.status }); }
}

import "server-only";

/* Client for the self-hosted speech server (speech-server/). Only the Next.js server talks to it.
   Enabled when SPEECH_URL is set; SPEECH_API_KEY is sent as X-Speech-Key. */
export function speechConfigured(): boolean { return !!process.env.SPEECH_URL; }

export class SpeechError extends Error { constructor(public code: string, message: string, public status = 502) { super(message); } }

export async function speechFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  if (!speechConfigured()) throw new SpeechError("speech_unavailable", "SPEECH_URL is not set on the server", 503);
  const base = process.env.SPEECH_URL!.replace(/\/$/, "");
  const headers = new Headers(init.headers);
  if (process.env.SPEECH_API_KEY) headers.set("X-Speech-Key", process.env.SPEECH_API_KEY);
  let r: Response;
  try {
    r = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(init.timeoutMs ?? 30000) });
  } catch (e) {
    const timeout = (e as Error)?.name === "TimeoutError";
    throw new SpeechError("speech_unavailable", timeout ? "The speech server took too long to answer" : "Couldn't reach the speech server at SPEECH_URL", 503);
  }
  if (r.status === 401) throw new SpeechError("speech_unavailable", "The speech server rejected SPEECH_API_KEY", 503);
  if (!r.ok) {
    const detail = await r.text().catch(() => "");
    throw new SpeechError(r.status === 413 || r.status === 415 || r.status === 422 ? "speech_input" : "speech_unavailable", `Speech server returned ${r.status}: ${detail.slice(0, 200)}`, r.status === 413 || r.status === 415 || r.status === 422 ? 400 : 502);
  }
  return r;
}

export function speechErrorResponse(e: unknown): Response {
  const err = e instanceof SpeechError ? e : new SpeechError("speech_unavailable", String((e as Error)?.message || e));
  return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
}

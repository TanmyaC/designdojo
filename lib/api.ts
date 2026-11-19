"use client";
import type { PromptSession, Session } from "./types";
import { boardToText } from "./board";
import { elapsedMin, historyBrief, store } from "./store";
import { USAGE_MARKER, type UsageSummary } from "./usage-shared";

export class ApiError extends Error { constructor(public code: string, message?: string) { super(message || code); } }

const COPY: Record<string, string> = {
  rate_limited: "Too many requests right now. Wait a moment, then try again.",
  server_key: "The server isn't set up to reach Claude yet: no valid API key or `ant` sign-in. See the terminal running the app.",
  prompt_too_large: "The interview got too long to send in one go. End the interview to get your debrief.",
  invalid_json: "Claude's reply came back in the wrong shape. Try again.",
  refused: "Claude declined that message. Rephrase it and try again.",
  image_rejected: "That image couldn't be used. Try a PNG or JPEG under 5 MB.",
  cancelled: "Stopped.",
  speech_unavailable: "Voice isn't available right now, so the interview switched to text.",
  speech_input: "That recording couldn't be transcribed. Try again or type your answer.",
  truncated: "Claude's reply was too long and got cut off. Try again.",
  access_code: "This site needs an access code. Ask whoever runs it.",
  network: "Couldn't reach the server. Check your connection and try again.",
};
export function errCopy(e: unknown): string {
  const c = e instanceof ApiError ? e.code : "";
  return COPY[c] || "Something went wrong reaching Claude. Try again.";
}

/** Headers every API call needs (the optional access code). */
export function authHeaders(): Record<string, string> { return { "x-access-code": accessCode() }; }

function accessCode(): string { try { return localStorage.getItem("dd.accessCode") || ""; } catch { return ""; } }
function askForCode(): boolean {
  const v = window.prompt("This site is protected. Enter the access code:");
  if (!v) return false;
  try { localStorage.setItem("dd.accessCode", v.trim()); } catch { /* ignore */ }
  return true;
}

async function post(path: string, body: unknown, signal?: AbortSignal, retried = false): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", "x-access-code": accessCode() }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new ApiError("cancelled");
    throw new ApiError("network");
  }
  if (r.status === 401 && !retried && askForCode()) return post(path, body, signal, true);
  if (!r.ok) {
    let code = "unknown", msg = "";
    try { const j = await r.json(); code = j?.error?.code || code; msg = j?.error?.message || ""; } catch { /* ignore */ }
    throw new ApiError(code, msg);
  }
  return r;
}
export async function postJSON<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return (await post(path, body, signal)).json() as Promise<T>;
}
/* Streams text. The server ends a successful stream with a usage trailer, "[[usage:{...}]]":
   it is never shown, and is handed to onUsage once the stream is done. */
export async function postStream(path: string, body: unknown, onText: (all: string) => void, signal?: AbortSignal, onUsage?: (u: UsageSummary) => void): Promise<string> {
  const r = await post(path, body, signal);
  const reader = r.body!.getReader(); const dec = new TextDecoder(); let all = "";
  // Hide the trailer, including a half-arrived one ("\n[[us") at the end of a chunk.
  const visible = () => {
    const i = all.lastIndexOf("\n[[");
    if (i < 0) return all;
    const tail = all.slice(i + 1);
    return tail.startsWith(USAGE_MARKER) || USAGE_MARKER.startsWith(tail) ? all.slice(0, i) : all;
  };
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    all += dec.decode(value, { stream: true });
    const m = all.match(/\[\[error:([a-z_]+)\]\]$/);
    if (m) throw new ApiError(m[1]);
    onText(visible());
  }
  const i = all.lastIndexOf("\n" + USAGE_MARKER);
  if (i >= 0 && onUsage) {
    try { onUsage(JSON.parse(all.slice(i + 1 + USAGE_MARKER.length).replace(/\]\]\s*$/, "")) as UsageSummary); } catch { /* ignore a malformed trailer */ }
  }
  return visible();
}

/* What the server needs from a session to build a prompt. */
export function promptSession(s: Session, opts: { board?: boolean } = {}): PromptSession {
  return {
    id: s.id,
    question: s.question || s.spec?.question || "", level: s.level, duration: s.duration,
    spec: s.spec, facts: s.facts, probed: s.probed, phase: s.phase, hints: s.hints,
    elapsedMin: elapsedMin(s), transcript: s.transcript, historyBrief: historyBrief(store.sessions()),
    style: s.style, rubric: s.rubric, quoteEvidence: s.quoteEvidence,
    board: opts.board === false ? undefined : boardToText(s.board), estimates: s.estimates,
    debrief: s.debrief, solution: { model: s.solution.model, cmp: s.solution.cmp }, followups: s.followups,
  };
}

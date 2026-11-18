"use client";
/* Browser side of voice interviews.
   - Speaker: Alex's replies -> /api/speech/tts (Kokoro on the speech server) -> played in order.
   - Listener: microphone -> voice-activity detection (Silero, in the browser) -> each spoken segment
     -> /api/speech/stt (Whisper on the speech server) -> text. A long enough silence ends the turn. */
import { marked } from "marked";
import { ApiError, authHeaders } from "./api";

/* ---------- status ---------- */
export interface SpeechStatus { enabled: boolean; reason?: string; voices: { id: string; label: string }[]; defaultVoice?: string }
let statusCache: Promise<SpeechStatus> | null = null;
export function speechStatus(refresh = false): Promise<SpeechStatus> {
  if (!statusCache || refresh) {
    statusCache = fetch("/api/speech/status", { headers: authHeaders(), cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { enabled: false, voices: [] }))
      .catch(() => ({ enabled: false, reason: "unreachable", voices: [] }));
  }
  return statusCache;
}

/* ---------- text preparation ---------- */
/** Markdown reply -> plain text worth saying out loud. */
export function speakable(markdown: string): string {
  const html = marked.parse(markdown || "", { async: false }) as string;
  const doc = new DOMParser().parseFromString(html.replace(/<\/(p|li|h\d)>/g, ".</$1> "), "text/html");
  return (doc.body.textContent || "").replace(/\.\s*\./g, ".").replace(/\s+/g, " ").trim();
}
/** Split into chunks: the first sentence alone (so audio starts quickly), then up to ~220 characters each. */
export function chunks(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) || [];
  const out: string[] = [];
  for (const p of parts) {
    const last = out[out.length - 1];
    if (out.length > 1 && last && last.length + p.length < 220) out[out.length - 1] = `${last} ${p}`;
    else out.push(p);
  }
  return out;
}

/* ---------- speaker ---------- */
export class Speaker {
  private ctx: AudioContext | null = null;
  private current: AudioBufferSourceNode | null = null;
  private abort: AbortController | null = null;

  private audio(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext();
    return this.ctx;
  }
  /** False when the browser is blocking sound until the user clicks something. */
  get canPlay(): boolean { return this.audio().state === "running"; }
  /** Call from a click handler to unlock sound. */
  async unlock(): Promise<boolean> { try { await this.audio().resume(); } catch { /* ignore */ } return this.canPlay; }

  /** Speak a reply. Resolves when it finishes or is stopped; rejects with ApiError if the speech server fails. */
  async speak(markdown: string, opts: { voice?: string; speed?: number } = {}): Promise<void> {
    this.stop();
    const ctx = this.audio(), ac = new AbortController(); this.abort = ac;
    const parts = chunks(speakable(markdown));
    const fetchPart = async (text: string): Promise<AudioBuffer> => {
      const r = await fetch("/api/speech/tts", {
        method: "POST", signal: ac.signal, headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ text, voice: opts.voice, speed: opts.speed ?? 1 }),
      });
      if (!r.ok) { let code = "speech_unavailable"; try { code = (await r.json())?.error?.code || code; } catch { /* ignore */ } throw new ApiError(code); }
      return ctx.decodeAudioData(await r.arrayBuffer());
    };
    // A prefetch abandoned by stop() rejects with AbortError; mark it handled so it isn't an unhandled rejection.
    const prefetch = (text: string) => { const pr = fetchPart(text); pr.catch(() => {}); return pr; };
    try {
      let next = parts.length ? prefetch(parts[0]) : null;
      for (let i = 0; i < parts.length && next; i++) {
        const buf = await next;
        next = i + 1 < parts.length ? prefetch(parts[i + 1]) : null;   // prefetch while this one plays
        if (ac.signal.aborted) return;
        await new Promise<void>((resolve) => {
          const src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination);
          src.onended = () => { if (this.current === src) this.current = null; resolve(); };
          ac.signal.addEventListener("abort", () => resolve(), { once: true });
          this.current = src; src.start();
        });
        if (ac.signal.aborted) return;
      }
    } catch (e) {
      if (ac.signal.aborted || (e as Error)?.name === "AbortError") return;
      throw e instanceof ApiError ? e : new ApiError("speech_unavailable");
    } finally { if (this.abort === ac) this.abort = null; }
  }

  stop() {
    this.abort?.abort(); this.abort = null;
    try { this.current?.stop(); } catch { /* already stopped */ }
    this.current = null;
  }
  get speaking(): boolean { return !!this.abort; }
  destroy() { this.stop(); this.ctx?.close().catch(() => {}); this.ctx = null; }
}

/* ---------- listener ---------- */
export type ListenState = "listening" | "hearing" | "transcribing" | "paused";
export interface ListenerOptions {
  endSilenceMs: number;                    // silence after the last segment that ends the turn
  prompt: () => string;                    // context to help transcription (the question title)
  onState: (s: ListenState) => void;
  onPartial: (text: string) => void;       // everything heard so far this turn
  onTurn: (text: string) => void;          // the turn is over: send it
  onError: (e: ApiError) => void;
}

const REDEMPTION_MS = 900;   // quiet needed before the detector closes a speech segment

/** 16 kHz mono float samples -> 16-bit PCM WAV. */
export function encodeWav(samples: Float32Array, rate = 16000): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: "audio/wav" });
}

async function transcribe(samples: Float32Array, prompt: string): Promise<string> {
  const form = new FormData(); form.append("audio", encodeWav(samples), "speech.wav"); form.append("prompt", prompt);
  let r: Response;
  try { r = await fetch("/api/speech/stt", { method: "POST", body: form, headers: authHeaders() }); }
  catch { throw new ApiError("speech_unavailable"); }
  if (!r.ok) { let code = "speech_unavailable"; try { code = (await r.json())?.error?.code || code; } catch { /* ignore */ } throw new ApiError(code); }
  return String((await r.json())?.text || "").trim();
}

export class Listener {
  private vad: { start: () => Promise<void>; pause: () => Promise<void>; destroy: () => Promise<void> } | null = null;
  private segments: Promise<string>[] = [];
  private heard: string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  autoSend = true;

  constructor(private o: ListenerOptions) {}

  /** Ask for the microphone and load the detector. Throws ApiError("mic_denied") if access is refused. */
  async init(): Promise<void> {
    const { MicVAD } = await import("@ricky0123/vad-web");
    try {
      this.vad = await MicVAD.new({
        model: "v5", baseAssetPath: "/vad/", onnxWASMBasePath: "/vad/", startOnLoad: false,
        positiveSpeechThreshold: 0.5, negativeSpeechThreshold: 0.35, redemptionMs: REDEMPTION_MS, minSpeechMs: 250, preSpeechPadMs: 300,
        submitUserSpeechOnPause: true,
        getStream: () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }),
        onSpeechStart: () => { this.clearTimer(); if (this.active) this.o.onState("hearing"); },
        onVADMisfire: () => { if (this.active) { this.o.onState("listening"); this.armTimer(); } },
        onSpeechEnd: (audio: Float32Array) => this.segment(audio),
      });
    } catch (e) {
      const name = (e as Error)?.name;
      throw new ApiError(name === "NotAllowedError" || name === "SecurityError" || name === "NotFoundError" ? "mic_denied" : "speech_unavailable");
    }
  }

  private segment(audio: Float32Array) {
    const idx = this.segments.length;
    const p = transcribe(audio, this.o.prompt())
      .then((t) => { this.heard[idx] = t; this.o.onPartial(this.heard.filter(Boolean).join(" ")); return t; })
      .catch((e) => { this.o.onError(e instanceof ApiError ? e : new ApiError("speech_unavailable")); return ""; });
    this.segments.push(p);
    if (this.active) { this.o.onState("transcribing"); this.armTimer(); }
  }
  private clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  private armTimer() {
    this.clearTimer();
    if (!this.segments.length) return;
    // The detector already waited REDEMPTION_MS of quiet before closing the segment.
    this.timer = setTimeout(() => this.finish(), Math.max(300, this.o.endSilenceMs - REDEMPTION_MS));
  }
  /** Turn over: wait for transcriptions, hand the text on, start fresh. */
  private async finish() {
    this.clearTimer();
    const segs = this.segments; if (!segs.length) return;
    await Promise.all(segs);
    if (segs !== this.segments) return;          // reset meanwhile
    const text = this.heard.filter(Boolean).join(" ").trim();
    this.segments = []; this.heard = [];
    if (!text) { if (this.active) this.o.onState("listening"); return; }
    if (this.autoSend) this.o.onTurn(text); else this.o.onPartial(text);
    if (this.active) this.o.onState("listening");
  }

  async start() { if (!this.vad) return; this.active = true; this.o.onState("listening"); await this.vad.start(); }
  /** Stop listening. Anything already said stays in the composer as a draft; it is not sent. */
  async pause() {
    this.active = false; this.clearTimer();
    if (this.vad) await this.vad.pause();
    const auto = this.autoSend; this.autoSend = false;
    await this.finish();
    this.autoSend = auto;
    this.o.onState("paused");
  }
  /** Forget what was heard this turn (the composer was sent or cleared). */
  reset() { this.clearTimer(); this.segments = []; this.heard = []; }
  get listening() { return this.active; }
  async destroy() { this.active = false; this.clearTimer(); try { await this.vad?.destroy(); } catch { /* ignore */ } this.vad = null; }
}

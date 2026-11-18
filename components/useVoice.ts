"use client";
/* Hands-free voice for the interview room.
   Alex's new replies are spoken; when he finishes, the mic opens; a pause sends the answer.
   The room stays in charge of turns: this hook only calls onTurn(text) and onDraft(text). */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, errCopy } from "@/lib/api";
import { Listener, Speaker, speechStatus, type ListenState } from "@/lib/voice";
import type { Settings, Turn } from "@/lib/types";

export type VoiceMode = "unavailable" | "off" | "starting" | "needs-click" | "alex" | "thinking" | "mic-blocked" | ListenState;

interface Opts {
  settings: Settings;
  transcript: Turn[];
  interviewing: boolean;      // status === "interview"
  busy: boolean;              // Claude is answering
  prompt: string;             // question title, helps transcription
  onTurn: (text: string) => void;
  onDraft: (text: string) => void;
  toast: (m: string) => void;
}

export function useVoice(o: Opts) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [on, setOn] = useState(o.settings.voice);
  const [mode, setMode] = useState<VoiceMode>("starting");
  const [userPaused, setUserPaused] = useState(false);
  const [typing, setTypingState] = useState(false);
  const speaker = useRef<Speaker | null>(null), listener = useRef<Listener | null>(null);
  const spokenIdx = useRef<number | null>(null);      // index of the last Alex message already spoken
  const pending = useRef<string | null>(null);         // reply waiting for a click to unlock sound
  const failures = useRef(0), micBlocked = useRef(false);
  const latest = useRef(o); latest.current = o;
  const state = useRef({ on, userPaused, busy: o.busy }); state.current = { on, userPaused, busy: o.busy };

  useEffect(() => { speechStatus().then((st) => setAvailable(st.enabled)); }, []);
  useEffect(() => { setOn(o.settings.voice); }, [o.settings.voice]);
  useEffect(() => () => { speaker.current?.destroy(); listener.current?.destroy(); }, []);

  const fail = useCallback((e: ApiError) => {
    if (e.code === "speech_input") { latest.current.toast(errCopy(e)); return; }
    failures.current += 1;
    if (failures.current >= 2) {
      setOn(false); speaker.current?.stop(); listener.current?.pause();
      latest.current.toast(errCopy(new ApiError("speech_unavailable")));
    }
  }, []);

  /* Open the mic if nothing stands in the way. */
  const listen = useCallback(async () => {
    const st = state.current;
    if (!st.on || st.userPaused || st.busy || micBlocked.current || !latest.current.interviewing) return;
    if (speaker.current?.speaking) return;
    try {
      if (!listener.current) {
        const l = new Listener({
          endSilenceMs: latest.current.settings.endSilenceSec * 1000,
          prompt: () => latest.current.prompt,
          // An automatic pause (Alex speaking or thinking) is not "paused" from the candidate's point of view.
          onState: (s) => { if (s === "paused" && !state.current.userPaused) return; setMode(s); },
          onPartial: (t) => latest.current.onDraft(t),
          onTurn: (t) => latest.current.onTurn(t),
          onError: fail,
        });
        listener.current = l;
        await l.init();
      }
      if (!state.current.on || state.current.busy || state.current.userPaused) return;
      await listener.current.start();
    } catch (e) {
      listener.current = null;
      if (e instanceof ApiError && e.code === "mic_denied") { micBlocked.current = true; setMode("mic-blocked"); }
      else fail(e instanceof ApiError ? e : new ApiError("speech_unavailable"));
    }
  }, [fail]);

  const speak = useCallback(async (text: string) => {
    if (!speaker.current) speaker.current = new Speaker();
    await listener.current?.pause();
    if (!speaker.current.canPlay && !(await speaker.current.unlock())) { pending.current = text; setMode("needs-click"); return; }
    setMode("alex");
    try {
      await speaker.current.speak(text, { voice: latest.current.settings.voiceName || undefined, speed: latest.current.settings.voiceSpeed });
      failures.current = 0;
    } catch (e) { fail(e instanceof ApiError ? e : new ApiError("speech_unavailable")); }
    if (state.current.on) { setMode(state.current.busy ? "thinking" : "listening"); listen(); }
  }, [fail, listen]);

  /* New Alex message -> speak it. On first load, don't replay what was said before a reload. */
  const t = o.transcript;
  const lastAlex = (() => { for (let i = t.length - 1; i >= 0; i--) if (t[i].who === "alex") return i; return -1; })();
  useEffect(() => {
    if (available === null) return;
    if (spokenIdx.current === null) { spokenIdx.current = lastAlex; if (lastAlex >= 0 && on && available) listen(); return; }
    if (lastAlex <= spokenIdx.current) return;
    spokenIdx.current = lastAlex;
    if (on && available) speak(t[lastAlex].text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastAlex, available]);

  /* While Claude thinks, the mic rests; afterwards the reply above reopens it. */
  useEffect(() => {
    if (!on || !available) return;
    if (o.busy) { listener.current?.pause(); setMode("thinking"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.busy]);

  /* Mode when switched off or unavailable. */
  useEffect(() => {
    if (available === false) { setMode("unavailable"); return; }
    if (available && !on) { speaker.current?.stop(); listener.current?.pause(); setMode("off"); }
    if (available && on && !speaker.current?.speaking && !o.busy) listen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, available]);

  useEffect(() => { if (!o.interviewing) { speaker.current?.stop(); listener.current?.destroy(); listener.current = null; } }, [o.interviewing]);

  return {
    mode, available: !!available, on, typing, userPaused,
    toggle: () => { failures.current = 0; setOn((v) => !v); },
    /** Stop Alex mid-sentence and open the mic. */
    skip: () => { speaker.current?.stop(); },
    /** Mic button: pause or resume listening. */
    toggleMic: async () => {
      if (micBlocked.current) { micBlocked.current = false; listener.current = null; }
      if (listener.current?.listening) { setUserPaused(true); state.current.userPaused = true; await listener.current.pause(); }
      else { setUserPaused(false); state.current.userPaused = false; listen(); }
    },
    /** "Turn on Alex's voice" after the browser blocked sound. Must run inside a click. */
    unlock: async () => {
      if (!speaker.current) speaker.current = new Speaker();
      await speaker.current.unlock();
      const p = pending.current; pending.current = null;
      if (p) speak(p); else listen();
    },
    /** The candidate edited the composer: what was heard so far becomes their draft, and auto-send pauses. */
    setTyping: (v: boolean) => {
      setTypingState(v);
      if (listener.current) { listener.current.autoSend = !v; if (v) listener.current.reset(); }
    },
    /** A message was sent (by voice or by hand): start the next turn clean. */
    sent: () => { setTypingState(false); if (listener.current) { listener.current.reset(); listener.current.autoSend = true; } },
  };
}

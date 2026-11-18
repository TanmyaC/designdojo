"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Board, CustomQuestion, Session, Settings } from "./types";
import { COMP } from "./constants";
import { normalizeDebrief } from "./normalize";

/* Everything lives in this browser's localStorage. No accounts. */
const K = { settings: "dd.settings", sessions: "dd.sessions", current: "dd.current", questions: "dd.questions" };
const EVT = "dd-store";

export const DEFAULT_SETTINGS: Settings = {
  level: "Senior", duration: 50, style: "Neutral", rubric: "default",
  warnOverrun: true, autoTargetWeakest: true, autoSolution: true, quoteEvidence: true, theme: "System",
  voice: true, voiceName: "", voiceSpeed: 1, endSilenceSec: 3,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
let lastWriteError = 0;
function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch {
    if (Date.now() - lastWriteError > 10000) { lastWriteError = Date.now(); window.dispatchEvent(new CustomEvent("dd-toast", { detail: "Your browser storage is full. Export and delete some old interviews in Settings." })); }
  }
  cache.delete(key);
  window.dispatchEvent(new Event(EVT));
}

/* Snapshot cache so useSyncExternalStore gets stable references. */
const cache = new Map<string, unknown>();
function snap<T>(key: string, fallback: T): T {
  if (!cache.has(key)) cache.set(key, read(key, fallback));
  return cache.get(key) as T;
}
if (typeof window !== "undefined") window.addEventListener("storage", () => { cache.clear(); window.dispatchEvent(new Event(EVT)); });

function subscribe(cb: () => void) { window.addEventListener(EVT, cb); return () => window.removeEventListener(EVT, cb); }
function useKey<T>(key: string, fallback: T): T {
  return useSyncExternalStore(subscribe, () => snap(key, fallback), () => fallback);
}

const EMPTY_SESSIONS: Record<string, Session> = {};
const EMPTY_Q: CustomQuestion[] = [];

/* ---------- hooks ---------- */
export function useMounted() { const [m, setM] = useState(false); useEffect(() => setM(true), []); return m; }
export function useSettings(): Settings { return { ...DEFAULT_SETTINGS, ...useKey<Partial<Settings>>(K.settings, DEFAULT_SETTINGS) }; }
export function useSessions(): Record<string, Session> { return useKey(K.sessions, EMPTY_SESSIONS); }
export function useCurrentId(): string | null { return useKey<string | null>(K.current, null); }
export function useCustomQuestions(): CustomQuestion[] { return useKey(K.questions, EMPTY_Q); }

/* ---------- writes ---------- */
export const store = {
  settings: () => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(K.settings, {}) }) as Settings,
  saveSettings: (s: Settings) => write(K.settings, s),
  sessions: () => read<Record<string, Session>>(K.sessions, {}),
  get: (id: string) => read<Record<string, Session>>(K.sessions, {})[id] || null,
  put: (s: Session) => { const all = read<Record<string, Session>>(K.sessions, {}); all[s.id] = s; write(K.sessions, all); },
  remove: (id: string) => { const all = read<Record<string, Session>>(K.sessions, {}); delete all[id]; write(K.sessions, all); if (read(K.current, null) === id) write(K.current, null); },
  clearAll: () => { write(K.sessions, {}); write(K.current, null); },
  currentId: () => read<string | null>(K.current, null),
  setCurrent: (id: string | null) => write(K.current, id),
  questions: () => read<CustomQuestion[]>(K.questions, []),
  addQuestion: (q: CustomQuestion) => write(K.questions, [q, ...read<CustomQuestion[]>(K.questions, [])]),
  removeQuestion: (id: string) => write(K.questions, read<CustomQuestion[]>(K.questions, []).filter((q) => q.id !== id)),
};

export function emptyBoard(): Board {
  return { nodes: [], edges: [], strokes: [], comments: [], seq: 1, pins: { facts: { x: 24, y: 24 }, estimates: { x: 24, y: 460 } } };
}

export function newSession(p: Pick<Session, "question" | "source" | "level" | "duration" | "style" | "rubric" | "quoteEvidence"> & Partial<Session>): Session {
  return {
    id: String(Date.now()), status: "starting", spec: null, facts: [], probed: {}, phase: "scoping", hints: 0,
    startedAt: null, endedAt: null, createdAt: Date.now(), transcript: [], board: emptyBoard(), estimates: "",
    debrief: null, solution: { model: null, cmp: null, deep: {} }, followups: [], ...p,
  };
}

/* ---------- derived ---------- */
export function finishedSessions(all: Record<string, Session>): Session[] {
  return Object.values(all).filter((s) => s.debrief).map((s) => ({ ...s, debrief: normalizeDebrief(s.debrief) }))
    .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
}
export function rating(s: Session, key: string): number | null {
  const c = (s.debrief?.competencies || []).find((x) => x.key === key);
  return typeof c?.rating === "number" ? c.rating : null;
}
export function competencyAverages(list: Session[]) {
  return COMP.map((c) => {
    const vals = list.map((s) => rating(s, c.key)).filter((v): v is number => v !== null);
    return { ...c, avg: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  });
}
export function historyBrief(all: Record<string, Session>): string {
  const list = finishedSessions(all).slice(0, 6);
  if (!list.length) return "No previous sessions.";
  return list.map((h) => `- ${new Date(h.endedAt || h.createdAt).toISOString().slice(0, 10)} | ${h.question || h.spec?.question} | ${(h.spec?.archetypes || []).join(",")} | S/D/O/C ${COMP.map((c) => rating(h, c.key) ?? "-").join("/")} | ${h.debrief?.verdict} | gaps: ${(h.debrief?.session_log?.recurring_gaps || []).join("; ")}`).join("\n");
}
export function elapsedMin(s: Session): number {
  return s.startedAt ? ((s.endedAt || Date.now()) - s.startedAt) / 60000 : 0;
}

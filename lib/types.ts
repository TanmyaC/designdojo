export type Level = "Mid" | "Senior" | "Staff";
export type Phase = "scoping" | "high_level" | "deep_dive" | "wrap_up";
export type Style = "Supportive" | "Neutral" | "Tough";
export type Rubric = "default" | "bigtech" | "startup";

export interface Turn { who: "alex" | "me" | "event"; text: string; at?: number }
export interface FollowUp { who: "me" | "sam"; text: string }

/* ---------- whiteboard ---------- */
export type NodeKind = "box" | "db" | "text" | "sticky";
export interface BoardNode { id: string; kind: NodeKind; x: number; y: number; w: number; h: number; label: string; sub?: string }
export interface BoardEdge { id: string; from: string; to: string; label?: string; dashed?: boolean }
export interface BoardStroke { id: string; points: number[] } // flat x,y list
export interface BoardComment { nodeId: string; text: string; at: number }
export interface Board {
  nodes: BoardNode[]; edges: BoardEdge[]; strokes: BoardStroke[]; comments: BoardComment[];
  seq: number;
  pins: { facts: { x: number; y: number }; estimates: { x: number; y: number } };
}

/* ---------- model output shapes (loosely typed: they come from the model) ---------- */
export interface Spec { question?: string; archetypes?: string[]; opening_line?: string; [k: string]: unknown }
export interface Flag { flag?: string; evidence?: string }
export interface CompetencyResult { key: string; name?: string; rating: number | null; green?: Flag[]; red?: Flag[]; strong_would_add?: string }
export interface Debrief {
  verdict?: string; verdict_reason?: string;
  spec_reveal?: { real_problem?: string; scale?: string; crux?: string; how_close?: string };
  competencies?: CompetencyResult[];
  missed?: { critical?: string[]; nice_to_have?: string[] };
  moments?: { type: string; text: string }[];
  time_management?: string; top3?: string[];
  session_log?: { summary?: string; recurring_gaps?: string[] };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ModelSolution = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Comparison = any;

export interface Session {
  id: string;
  question: string;          // what the candidate picked (may be empty for "Let Alex choose")
  source: "library" | "custom" | "auto";
  topic?: string; difficulty?: string;
  customSpec?: string;       // hidden spec text the candidate wrote for a custom question
  level: Level; duration: number;
  style: Style; rubric: Rubric; quoteEvidence: boolean;
  status: "starting" | "interview" | "debrief" | "solution";
  spec: Spec | null; facts: string[]; probed: Record<string, boolean>; phase: Phase; hints: number;
  startedAt: number | null; endedAt: number | null; createdAt: number;
  transcript: Turn[];
  board: Board; estimates: string;
  debrief: Debrief | null;
  solution: { model: ModelSolution | null; cmp: Comparison | null; deep: Record<string, string> };
  followups: FollowUp[];
}

/* What the browser sends the server to build a prompt. */
export interface PromptSession {
  question: string; level: string; duration: number;
  spec: Spec | null; facts: string[]; probed: Record<string, boolean>; phase: string; hints: number;
  elapsedMin: number; transcript: Turn[]; historyBrief: string;
  style?: Style; rubric?: Rubric; quoteEvidence?: boolean;
  board?: string; estimates?: string;
  debrief?: Debrief | null; solution?: { model: ModelSolution | null; cmp: Comparison | null };
  followups: FollowUp[];
}

export interface Settings {
  level: Level; duration: number; style: Style; rubric: Rubric;
  warnOverrun: boolean; autoTargetWeakest: boolean; autoSolution: boolean; quoteEvidence: boolean;
  theme: "System" | "Light" | "Dark";
}

export interface CustomQuestion { id: string; title: string; spec: string; topic: string; difficulty: string; createdAt: number }

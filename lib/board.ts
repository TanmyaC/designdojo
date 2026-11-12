import type { Board, BoardNode, NodeKind } from "./types";

export const STAGE_W = 1600, STAGE_H = 1100;

export const KIND_LABEL: Record<NodeKind, string> = { box: "Box", db: "Database", text: "Text", sticky: "Note" };
export const DEFAULT_SIZE: Record<NodeKind, { w: number; h: number; label: string }> = {
  box: { w: 150, h: 56, label: "Service" },
  db: { w: 140, h: 72, label: "Database" },
  text: { w: 160, h: 32, label: "Label" },
  sticky: { w: 180, h: 110, label: "Note" },
};

/* The board as plain text, so Alex can "see" it. */
export function boardToText(b: Board): string {
  const nodes = b.nodes.filter((n) => n.label.trim() || n.sub?.trim());
  if (!nodes.length && !b.edges.length && !b.strokes.length) return "";
  const name = (id: string) => { const n = b.nodes.find((x) => x.id === id); return n ? `${n.label || KIND_LABEL[n.kind]} [${n.id}]` : id; };
  const lines: string[] = [];
  const comps = nodes.filter((n) => n.kind === "box" || n.kind === "db");
  if (comps.length) {
    lines.push("Components:");
    comps.forEach((n) => lines.push(`- [${n.id}] ${n.kind === "db" ? "Datastore" : "Component"}: ${n.label}${n.sub ? ` (${n.sub})` : ""}`));
  }
  if (b.edges.length) {
    lines.push("Arrows:");
    b.edges.forEach((e) => lines.push(`- ${name(e.from)} -> ${name(e.to)}${e.label ? ` "${e.label}"` : ""}${e.dashed ? " (dashed: async / not built yet)" : ""}`));
  }
  const notes = nodes.filter((n) => n.kind === "sticky" || n.kind === "text");
  if (notes.length) {
    lines.push("Notes and labels:");
    notes.forEach((n) => lines.push(`- [${n.id}] ${n.label.replace(/\n+/g, " / ")}`));
  }
  if (b.strokes.length) lines.push(`(${b.strokes.length} freehand pen stroke${b.strokes.length === 1 ? "" : "s"} not shown)`);
  const unconnected = comps.filter((n) => !b.edges.some((e) => e.from === n.id || e.to === n.id));
  if (unconnected.length && b.edges.length) lines.push(`Unconnected: ${unconnected.map((n) => n.label).join(", ")}`);
  return lines.join("\n");
}

export function center(n: BoardNode) { return { x: n.x + n.w / 2, y: n.y + n.h / 2 }; }

/* Point where the line from a node's centre towards (tx, ty) leaves its rectangle. */
export function edgePoint(n: BoardNode, tx: number, ty: number) {
  const c = center(n), dx = tx - c.x, dy = ty - c.y;
  if (!dx && !dy) return c;
  const sx = Math.abs(dx) / (n.w / 2 + 4), sy = Math.abs(dy) / (n.h / 2 + 4);
  const s = Math.max(sx, sy);
  return { x: c.x + dx / s, y: c.y + dy / s };
}

export function boundsOf(b: Board) {
  const xs: number[] = [], ys: number[] = [];
  b.nodes.forEach((n) => { xs.push(n.x, n.x + n.w); ys.push(n.y, n.y + n.h); });
  b.strokes.forEach((s) => { for (let i = 0; i < s.points.length; i += 2) { xs.push(s.points[i]); ys.push(s.points[i + 1]); } });
  [b.pins.facts, b.pins.estimates].forEach((p) => { xs.push(p.x, p.x + 240); ys.push(p.y, p.y + 160); });
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Board, BoardEdge, BoardNode, NodeKind } from "@/lib/types";
import { DEFAULT_SIZE, STAGE_H, STAGE_W, boundsOf, center, edgePoint } from "@/lib/board";

type Tool = "select" | NodeKind | "arrow" | "pen" | "eraser";
const TOOLS: { id: Tool; label: string; key: string; path: string }[] = [
  { id: "select", label: "Select", key: "v", path: "M4 3l10 5-4.5 1.5L8 14z" },
  { id: "box", label: "Box", key: "b", path: "M3 4.5h12v9H3z" },
  { id: "db", label: "Database", key: "d", path: "M4 4.5c0-1.5 10-1.5 10 0v9c0 1.5-10 1.5-10 0zM4 4.5c0 1.5 10 1.5 10 0" },
  { id: "arrow", label: "Arrow", key: "a", path: "M3 14L14 3M8 3h6v6" },
  { id: "text", label: "Text", key: "t", path: "M4 4h10M9 4v10M7 14h4" },
  { id: "sticky", label: "Sticky note", key: "n", path: "M3 3h12v8l-4 4H3zM11 15v-4h4" },
  { id: "pen", label: "Pen", key: "p", path: "M3 15l1-4 8-8 3 3-8 8zM10.5 4.5l3 3" },
  { id: "eraser", label: "Eraser", key: "e", path: "M7 15h8M3.5 11.5l7-7 4 4-6 6H6z" },
];

type Sel = { type: "node" | "edge" | "stroke"; id: string } | null;
type Drag =
  | { kind: "move"; id: string; dx: number; dy: number; base: Board; moved: boolean }
  | { kind: "pin"; which: "facts" | "estimates"; dx: number; dy: number; base: Board; moved: boolean }
  | { kind: "arrow"; from: string; x: number; y: number }
  | { kind: "pen"; points: number[]; base: Board }
  | { kind: "resize"; id: string; base: Board; ox: number; oy: number; w: number; h: number }
  | null;

interface Props {
  board: Board;
  onChange: (b: Board) => void;
  facts?: string[];
  estimates?: string;
  onEstimates?: (v: string) => void;
  readOnly?: boolean;
  seen?: boolean;              // "Alex can see your board"
  onWalkthrough?: () => void;
}

function edgePath(b: Board, e: BoardEdge) {
  const a = b.nodes.find((n) => n.id === e.from), t = b.nodes.find((n) => n.id === e.to);
  if (!a || !t) return null;
  const ca = center(a), ct = center(t);
  const p1 = edgePoint(a, ct.x, ct.y), p2 = edgePoint(t, ca.x, ca.y);
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const d = Math.abs(dx) >= Math.abs(dy)
    ? `M${p1.x},${p1.y} C${p1.x + dx / 2},${p1.y} ${p1.x + dx / 2},${p2.y} ${p2.x},${p2.y}`
    : `M${p1.x},${p1.y} C${p1.x},${p1.y + dy / 2} ${p2.x},${p1.y + dy / 2} ${p2.x},${p2.y}`;
  return { d, mx: (p1.x + p2.x) / 2, my: (p1.y + p2.y) / 2 };
}
const strokeD = (pts: number[]) => pts.length < 2 ? "" : "M" + pts.reduce<string[]>((acc, v, i) => { if (i % 2 === 0) acc.push(`${v},${pts[i + 1]}`); return acc; }, []).join(" L");

export default function Whiteboard({ board, onChange, facts = [], estimates = "", onEstimates, readOnly, seen, onWalkthrough }: Props) {
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Sel>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag>(null);
  const past = useRef<Board[]>([]), future = useRef<Board[]>([]);
  const [, force] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null), scrollRef = useRef<HTMLDivElement>(null), rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef(board); boardRef.current = board;

  const commit = useCallback((next: Board, base: Board = boardRef.current) => {
    past.current.push(base); if (past.current.length > 80) past.current.shift();
    future.current = []; onChange(next); force((x) => x + 1);
  }, [onChange]);
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(boardRef.current); onChange(p); setSel(null); force((x) => x + 1); };
  const redo = () => { const f = future.current.pop(); if (!f) return; past.current.push(boardRef.current); onChange(f); setSel(null); force((x) => x + 1); };

  const toStage = (e: { clientX: number; clientY: number }) => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom };
  };
  const nextId = (b: Board, p: string) => `${p}${b.seq}`;

  const fit = useCallback(() => {
    const el = scrollRef.current; if (!el) return;
    const bb = boundsOf(boardRef.current);
    const w = bb.x1 - Math.min(0, bb.x0) + 40, h = bb.y1 - Math.min(0, bb.y0) + 40;
    const z = Math.max(0.35, Math.min(1.25, Math.min(el.clientWidth / w, el.clientHeight / h)));
    setZoom(Math.round(z * 20) / 20); el.scrollTo({ left: 0, top: 0 });
  }, []);
  useLayoutEffect(() => { if (readOnly) fit(); }, [readOnly, fit]);

  /* ---------- pointer handling ---------- */
  function onStageDown(e: React.PointerEvent) {
    if (readOnly || e.button !== 0) return;
    rootRef.current?.focus({ preventScroll: true });
    const p = toStage(e), b = boardRef.current;
    if (tool === "box" || tool === "db" || tool === "text" || tool === "sticky") {
      e.preventDefault(); // keep focus in the new label editor instead of the board container
      const d = DEFAULT_SIZE[tool], id = nextId(b, "n");
      const n: BoardNode = { id, kind: tool, x: Math.round(p.x - d.w / 2), y: Math.round(p.y - d.h / 2), w: d.w, h: d.h, label: "" };
      commit({ ...b, seq: b.seq + 1, nodes: [...b.nodes, n] });
      setSel({ type: "node", id }); setEditing(id); setTool("select");
      return;
    }
    if (tool === "pen") { (e.target as Element).setPointerCapture?.(e.pointerId); setDrag({ kind: "pen", points: [p.x, p.y], base: b }); return; }
    setSel(null); setEditing(null);
  }
  function onNodeDown(e: React.PointerEvent, n: BoardNode) {
    if (readOnly || e.button !== 0 || editing === n.id) return;
    e.stopPropagation(); rootRef.current?.focus({ preventScroll: true });
    const p = toStage(e), b = boardRef.current;
    if (tool === "eraser") { removeNode(n.id); return; }
    if (tool === "arrow") { setDrag({ kind: "arrow", from: n.id, x: p.x, y: p.y }); return; }
    if (tool === "pen") { onStageDown(e); return; }
    setSel({ type: "node", id: n.id }); setEditing(null);
    setDrag({ kind: "move", id: n.id, dx: p.x - n.x, dy: p.y - n.y, base: b, moved: false });
  }
  function onPinDown(e: React.PointerEvent, which: "facts" | "estimates") {
    if (readOnly || e.button !== 0 || tool !== "select") return;
    if ((e.target as HTMLElement).closest("textarea")) return;
    e.stopPropagation();
    const p = toStage(e), pin = boardRef.current.pins[which];
    setDrag({ kind: "pin", which, dx: p.x - pin.x, dy: p.y - pin.y, base: boardRef.current, moved: false });
  }
  function onResizeDown(e: React.PointerEvent, n: BoardNode) {
    e.stopPropagation(); const p = toStage(e);
    setDrag({ kind: "resize", id: n.id, base: boardRef.current, ox: p.x, oy: p.y, w: n.w, h: n.h });
  }
  useEffect(() => {
    if (!drag) return;
    const move = (ev: PointerEvent) => {
      const p = toStage(ev), b = boardRef.current;
      if (drag.kind === "move") {
        const x = Math.round(p.x - drag.dx), y = Math.round(p.y - drag.dy);
        onChange({ ...b, nodes: b.nodes.map((n) => (n.id === drag.id ? { ...n, x: Math.max(0, Math.min(STAGE_W - n.w, x)), y: Math.max(0, Math.min(STAGE_H - n.h, y)) } : n)) });
        if (!drag.moved) setDrag({ ...drag, moved: true });
      } else if (drag.kind === "pin") {
        onChange({ ...b, pins: { ...b.pins, [drag.which]: { x: Math.max(0, Math.round(p.x - drag.dx)), y: Math.max(0, Math.round(p.y - drag.dy)) } } });
        if (!drag.moved) setDrag({ ...drag, moved: true });
      } else if (drag.kind === "resize") {
        onChange({ ...b, nodes: b.nodes.map((n) => (n.id === drag.id ? { ...n, w: Math.max(60, Math.round(drag.w + p.x - drag.ox)), h: Math.max(28, Math.round(drag.h + p.y - drag.oy)) } : n)) });
      } else if (drag.kind === "arrow") setDrag({ ...drag, x: p.x, y: p.y });
      else if (drag.kind === "pen") setDrag({ ...drag, points: [...drag.points, Math.round(p.x), Math.round(p.y)] });
    };
    const up = (ev: PointerEvent) => {
      const b = boardRef.current;
      if ((drag.kind === "move" || drag.kind === "pin") && drag.moved) commit(b, drag.base);
      if (drag.kind === "resize") commit(b, drag.base);
      if (drag.kind === "arrow") {
        const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-node]") as HTMLElement | null;
        const to = el?.dataset.node;
        if (to && to !== drag.from && !b.edges.some((x) => x.from === drag.from && x.to === to)) {
          const id = nextId(b, "e");
          commit({ ...b, seq: b.seq + 1, edges: [...b.edges, { id, from: drag.from, to }] });
          setSel({ type: "edge", id });
        }
      }
      if (drag.kind === "pen" && drag.points.length > 4) {
        commit({ ...b, seq: b.seq + 1, strokes: [...b.strokes, { id: nextId(b, "s"), points: drag.points }] }, drag.base);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, zoom]);

  /* ---------- edits ---------- */
  function removeNode(id: string) {
    const b = boardRef.current;
    commit({ ...b, nodes: b.nodes.filter((n) => n.id !== id), edges: b.edges.filter((e) => e.from !== id && e.to !== id), comments: b.comments.filter((c) => c.nodeId !== id) });
    setSel(null); setEditing(null);
  }
  function removeEdge(id: string) { const b = boardRef.current; commit({ ...b, edges: b.edges.filter((e) => e.id !== id) }); setSel(null); }
  function removeStroke(id: string) { const b = boardRef.current; commit({ ...b, strokes: b.strokes.filter((s) => s.id !== id) }); setSel(null); }
  function setLabel(id: string, text: string) {
    const b = boardRef.current; const [label, ...rest] = text.split("\n");
    const n = b.nodes.find((x) => x.id === id); if (!n) return;
    const isNote = n.kind === "sticky" || n.kind === "text";
    const next = isNote ? { ...n, label: text } : { ...n, label: label.trim(), sub: rest.join(" ").trim() || undefined };
    if (!next.label.trim() && !next.sub) { removeNode(id); return; }
    if (next.label === n.label && next.sub === n.sub) return;
    commit({ ...b, nodes: b.nodes.map((x) => (x.id === id ? next : x)) });
  }
  function patchEdge(id: string, patch: Partial<BoardEdge>, commitNow = true) {
    const b = boardRef.current; const next = { ...b, edges: b.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
    if (commitNow) commit(next); else onChange(next);
  }
  function dismissComment(nodeId: string) { const b = boardRef.current; onChange({ ...b, comments: b.comments.filter((c) => c.nodeId !== nodeId) }); }

  function onKey(e: React.KeyboardEvent) {
    if (readOnly) return;
    const t = e.target as HTMLElement;
    if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if ((e.key === "Delete" || e.key === "Backspace") && sel) {
      e.preventDefault();
      if (sel.type === "node") removeNode(sel.id); else if (sel.type === "edge") removeEdge(sel.id); else removeStroke(sel.id);
      return;
    }
    if (e.key === "Escape") { setSel(null); setEditing(null); setTool("select"); return; }
    if (e.key === "Enter" && sel?.type === "node") { e.preventDefault(); setEditing(sel.id); return; }
    if (!mod && !e.altKey) { const tl = TOOLS.find((x) => x.key === e.key.toLowerCase()); if (tl) { setTool(tl.id); e.preventDefault(); } }
  }

  /* ---------- render ---------- */
  const b = board;
  const commentFor = (id: string) => b.comments.find((c) => c.nodeId === id);
  const shapes = b.nodes.filter((n) => n.kind === "box" || n.kind === "db").length;
  const notes = b.nodes.length - shapes;
  const selEdge = sel?.type === "edge" ? b.edges.find((e) => e.id === sel.id) : null;
  const selEdgeGeo = selEdge ? edgePath(b, selEdge) : null;
  const arrowFrom = drag?.kind === "arrow" ? b.nodes.find((n) => n.id === drag.from) : null;
  const curTool = TOOLS.find((t) => t.id === tool)!;

  return (
    <section className={"wb" + (readOnly ? " ro" : "")} aria-label="Whiteboard" ref={rootRef} tabIndex={readOnly ? undefined : 0} onKeyDown={onKey}>
      {!readOnly && (
        <div className="wb-bar">
          <div role="toolbar" aria-label="Drawing tools" className="wb-tools">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" aria-label={t.label} title={`${t.label} (${t.key.toUpperCase()})`} aria-pressed={tool === t.id} className="wb-tool" onClick={() => { setTool(t.id); setSel(null); setEditing(null); }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={t.path} /></svg>
              </button>
            ))}
          </div>
          <div className="wb-hist">
            <button type="button" className="icon-btn" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!past.current.length} onClick={undo}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M6 4L3 7l3 3M3 7h8a4 4 0 010 8H8" /></svg></button>
            <button type="button" className="icon-btn" aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!future.current.length} onClick={redo}><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 4l3 3-3 3M15 7H7a4 4 0 000 8h3" /></svg></button>
          </div>
          <span className="small muted">Tool: <b className="ink">{curTool.label}</b></span>
          <span className="sp" />
          {seen !== undefined && (
            <span className="small muted seen"><span className={"dot " + (seen ? "on" : "")} aria-hidden="true" />{seen ? "Alex can see your board" : "Board not shared"}</span>
          )}
          {onWalkthrough && <button type="button" className="btn primary sm" onClick={onWalkthrough}>Walk Alex through it</button>}
        </div>
      )}

      <div className={"wb-canvas tool-" + tool} ref={scrollRef}>
        <div style={{ width: STAGE_W * zoom, height: STAGE_H * zoom, position: "relative" }}>
          <div className="wb-stage" ref={stageRef} style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${zoom})` }} onPointerDown={onStageDown}>
            <svg width={STAGE_W} height={STAGE_H} className="wb-svg" aria-hidden="true">
              <defs>
                <marker id="wb-ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--ink)" /></marker>
                <marker id="wb-ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="var(--blue)" /></marker>
              </defs>
              {b.strokes.map((s) => (
                <g key={s.id}>
                  <path d={strokeD(s.points)} stroke={sel?.id === s.id ? "var(--blue)" : "var(--ink)"} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  {!readOnly && <path d={strokeD(s.points)} stroke="transparent" strokeWidth="12" fill="none" className="hit"
                    onPointerDown={(e) => { if (tool === "eraser") { e.stopPropagation(); removeStroke(s.id); } else if (tool === "select") { e.stopPropagation(); setSel({ type: "stroke", id: s.id }); rootRef.current?.focus({ preventScroll: true }); } }} />}
                </g>
              ))}
              {b.edges.map((e) => {
                const g = edgePath(b, e); if (!g) return null;
                const on = sel?.id === e.id;
                return (
                  <g key={e.id}>
                    <path d={g.d} stroke={on ? "var(--blue)" : "var(--ink)"} strokeWidth="1.6" fill="none" strokeDasharray={e.dashed ? "5 4" : undefined} markerEnd={`url(#${on ? "wb-ahs" : "wb-ah"})`} />
                    {!readOnly && <path d={g.d} stroke="transparent" strokeWidth="14" fill="none" className="hit"
                      onPointerDown={(ev) => { ev.stopPropagation(); rootRef.current?.focus({ preventScroll: true }); if (tool === "eraser") removeEdge(e.id); else setSel({ type: "edge", id: e.id }); }} />}
                  </g>
                );
              })}
              {arrowFrom && drag?.kind === "arrow" && (() => { const p = edgePoint(arrowFrom, drag.x, drag.y); return <path d={`M${p.x},${p.y} L${drag.x},${drag.y}`} stroke="var(--blue)" strokeWidth="1.6" strokeDasharray="4 3" markerEnd="url(#wb-ahs)" />; })()}
              {drag?.kind === "pen" && <path d={strokeD(drag.points)} stroke="var(--ink)" strokeWidth="2" fill="none" strokeLinecap="round" />}
            </svg>

            {b.edges.map((e) => { if (!e.label) return null; const g = edgePath(b, e); if (!g) return null;
              return <span key={e.id} className="wb-elabel" style={{ left: g.mx, top: g.my }}>{e.label}</span>; })}

            <Pin which="facts" pos={b.pins.facts} onDown={onPinDown} title="Agreed requirements" rotate={-1.5}>
              {facts.length ? <ul>{facts.slice(-9).map((f, i) => <li key={i}>{f}</li>)}</ul>
                : <p className="pin-empty">Alex&apos;s answers to your scoping questions collect here.</p>}
            </Pin>
            <Pin which="estimates" pos={b.pins.estimates} onDown={onPinDown} title="Estimates" rotate={1.2} htmlFor="wb-est">
              <textarea id="wb-est" rows={5} value={estimates} readOnly={readOnly} placeholder={"≈ writes/s\n≈ reads/s, peak\nstorage / year"} onChange={(e) => onEstimates?.(e.target.value)} />
            </Pin>

            {b.nodes.map((n) => {
              const c = commentFor(n.id), on = sel?.type === "node" && sel.id === n.id, ed = editing === n.id;
              return (
                <div key={n.id} data-node={n.id} className={`wb-node k-${n.kind}${on ? " sel" : ""}${c ? " flagged" : ""}`}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                  onPointerDown={(e) => onNodeDown(e, n)}
                  onDoubleClick={(e) => { if (readOnly) return; e.stopPropagation(); setSel({ type: "node", id: n.id }); setEditing(n.id); }}>
                  {ed ? (
                    <textarea autoFocus className="wb-edit" aria-label="Label" defaultValue={n.kind === "box" || n.kind === "db" ? [n.label, n.sub].filter(Boolean).join("\n") : n.label}
                      placeholder={n.kind === "box" || n.kind === "db" ? `${DEFAULT_SIZE[n.kind].label}\nsecond line: detail` : DEFAULT_SIZE[n.kind].label}
                      onPointerDown={(e) => e.stopPropagation()}
                      onBlur={(e) => { setLabel(n.id, e.target.value); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) { (e.target as HTMLTextAreaElement).blur(); rootRef.current?.focus({ preventScroll: true }); } }} />
                  ) : (
                    <>
                      <span className="lbl">{n.label || <span className="muted">{DEFAULT_SIZE[n.kind].label}</span>}</span>
                      {n.sub && <span className="sub">{n.sub}</span>}
                    </>
                  )}
                  {on && !readOnly && !ed && <span className="wb-resize" onPointerDown={(e) => onResizeDown(e, n)} aria-hidden="true" />}
                </div>
              );
            })}

            {b.comments.map((c) => { const n = b.nodes.find((x) => x.id === c.nodeId); if (!n) return null;
              const left = n.x + n.w + 200 < STAGE_W ? n.x + n.w + 12 : Math.max(0, n.x - 196);
              return (
                <div key={c.nodeId + c.at} className="wb-comment" style={{ left, top: Math.max(0, n.y - 14) }}>
                  <div className="wb-comment-h"><span className="av" aria-hidden="true">A</span>Alex commented
                    {!readOnly && <button type="button" aria-label="Dismiss comment" onClick={() => dismissComment(c.nodeId)}>×</button>}</div>
                  {c.text}
                </div>
              ); })}

            {selEdge && selEdgeGeo && !readOnly && (
              <div className="wb-edge-pop" style={{ left: selEdgeGeo.mx, top: selEdgeGeo.my + 16 }} onPointerDown={(e) => e.stopPropagation()}>
                <label className="sr-only" htmlFor="wb-elabel">Arrow label</label>
                <input id="wb-elabel" placeholder="Label, e.g. HTTPS" defaultValue={selEdge.label || ""} key={selEdge.id}
                  onBlur={(e) => patchEdge(selEdge.id, { label: e.target.value.trim() || undefined })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <label className="chk"><input type="checkbox" checked={!!selEdge.dashed} onChange={(e) => patchEdge(selEdge.id, { dashed: e.target.checked })} />Dashed</label>
                <button type="button" className="icon-btn danger" aria-label="Delete arrow" onClick={() => removeEdge(selEdge.id)}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
        {!readOnly && !b.nodes.length && !b.strokes.length && (
          <div className="wb-empty" aria-hidden="true">Pick <b>Box</b> or <b>Database</b> and click the board to add a component. Use <b>Arrow</b> to drag from one shape to another. Double-click a shape to rename it.</div>
        )}
      </div>

      <div className="wb-foot">
        <span>{shapes} shape{shapes === 1 ? "" : "s"} · {notes} note{notes === 1 ? "" : "s"} · {b.edges.length} arrow{b.edges.length === 1 ? "" : "s"}{readOnly ? "" : " · autosaved"}</span>
        <span className="sp" />
        <div className="zoom">
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.35, Math.round((z - 0.1) * 20) / 20))}>−</button>
          <span>{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 20) / 20))}>+</button>
        </div>
        <button type="button" className="btn sm" onClick={fit}>Fit to screen</button>
      </div>
    </section>
  );
}

function Pin({ which, pos, onDown, title, rotate, htmlFor, children }: { which: "facts" | "estimates"; pos: { x: number; y: number }; onDown: (e: React.PointerEvent, w: "facts" | "estimates") => void; title: string; rotate: number; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="wb-pin" style={{ left: pos.x, top: pos.y, transform: `rotate(${rotate}deg)` }} onPointerDown={(e) => onDown(e, which)}>
      {htmlFor ? <label htmlFor={htmlFor} className="pin-h">{title}</label> : <div className="pin-h">{title}</div>}
      {children}
    </div>
  );
}

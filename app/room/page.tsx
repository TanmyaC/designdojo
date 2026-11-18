"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Whiteboard from "@/components/Whiteboard";
import { Brand, Markdown, Thinking, fmtClock, useUI } from "@/components/ui";
import { COMP, PHASES, phaseBudget } from "@/lib/constants";
import { ApiError, errCopy, postJSON, promptSession } from "@/lib/api";
import { competencyAverages, elapsedMin, finishedSessions, store, useMounted, useSettings } from "@/lib/store";
import type { Board, Phase, Session, Spec, Turn } from "@/lib/types";

interface TurnReply { reply: string; new_facts?: string[]; probed?: string[]; phase?: string; diagram_notes?: string; board_comment?: { node_id?: string; text?: string } }
type Img = { media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string; name: string };

export default function Room() {
  const mounted = useMounted(); const router = useRouter(); const settings = useSettings(); const { confirm, toast } = useUI();
  const [s, setS] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [startErr, setStartErr] = useState<string | null>(null);
  const [turnErr, setTurnErr] = useState<{ msg: string; retry: () => void } | null>(null);
  const [text, setText] = useState("");
  const [withBoard, setWithBoard] = useState(true);
  const [img, setImg] = useState<Img | null>(null);
  const [now, setNow] = useState(Date.now());
  const [listening, setListening] = useState(false);
  const logRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), fileRef = useRef<HTMLInputElement>(null);
  const sRef = useRef<Session | null>(null); sRef.current = s;
  const recRef = useRef<{ stop: () => void } | null>(null);
  const started = useRef(false);

  /* load current session */
  useEffect(() => {
    if (!mounted) return;
    const id = store.currentId(); const cur = id ? store.get(id) : null;
    if (cur && (cur.status === "debrief" || cur.status === "solution")) { router.replace(`/session/${cur.id}`); return; }
    setS(cur && (cur.status === "interview" || cur.status === "starting") ? cur : null); setLoaded(true);
  }, [mounted, router]);

  /* persist (debounced) */
  useEffect(() => { if (!s) return; const t = setTimeout(() => store.put(s), 350); return () => clearTimeout(t); }, [s]);
  useEffect(() => () => { if (sRef.current) store.put(sRef.current); }, []);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [s?.transcript.length, busy, turnErr]);

  const update = useCallback((fn: (x: Session) => Session) => setS((x) => (x ? fn(x) : x)), []);

  /* start: Alex builds the hidden spec and opens */
  const begin = useCallback(async () => {
    const cur = sRef.current; if (!cur) return;
    setStartErr(null); setBusy("Alex is preparing the interview…");
    try {
      // For "Let Alex choose", tell the server what to target: the weakest competency and recently practised questions.
      const done = finishedSessions(store.sessions());
      const weakest = competencyAverages(done).filter((c) => c.avg !== null).sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))[0]?.key || null;
      const recent = done.map((d) => d.questionId).filter((id): id is string => !!id);
      const r = await postJSON<{ spec: Spec; question?: string; questionId?: string }>("/api/start",
        { session: promptSession(cur, { board: false }), question: cur.question, questionId: cur.questionId, customSpec: cur.customSpec, pick: { weakest, recent } });
      const spec = r.spec;
      update((x) => ({ ...x, spec, questionId: x.questionId || r.questionId, question: x.question || r.question || String(spec.question || "System design interview"), status: "interview", startedAt: Date.now(),
        transcript: [{ who: "alex", text: String(spec.opening_line), at: Date.now() }] }));
      setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) { setStartErr(errCopy(e)); }
    finally { setBusy(null); }
  }, [update]);
  useEffect(() => { if (s?.status === "starting" && !started.current) { started.current = true; begin(); } }, [s?.status, begin]);

  /* one interview turn */
  async function send(opts: { hint?: boolean } = {}) {
    const cur = sRef.current; if (!cur || cur.status !== "interview") return;
    if (busy) { toast("Alex is still answering. Your message stays in the box; send it when the reply arrives."); return; }
    const msgText = text.trim(); const image = opts.hint ? null : img;
    if (!opts.hint && !msgText && !image) return;
    setTurnErr(null);
    const mine: Turn = opts.hint ? { who: "event", text: "Candidate asked for a hint", at: Date.now() } : { who: "me", text: msgText || "(diagram attached)", at: Date.now() };
    const before = cur;
    const draft: Session = { ...cur, hints: cur.hints + (opts.hint ? 1 : 0), transcript: [...cur.transcript, mine] };
    setS(draft); if (!opts.hint) { setText(""); setImg(null); }
    setBusy("Alex is thinking…");
    const message = opts.hint ? "[The candidate pressed 'Ask for a hint'. Give the smallest useful nudge as a question, not an answer.]" : (msgText || "(see attached diagram)");
    try {
      const ps = promptSession(before.transcript === draft.transcript ? draft : { ...draft, transcript: before.transcript }, { board: withBoard });
      const r = await postJSON<TurnReply>("/api/turn", { session: ps, message, image: image ? { media_type: image.media_type, data: image.data } : undefined });
      update((x) => {
        const t = [...x.transcript];
        if (image && r.diagram_notes) t.push({ who: "event", text: "Candidate's diagram: " + r.diagram_notes, at: Date.now() });
        const facts = [...x.facts]; (r.new_facts || []).forEach((f) => { if (f && !facts.includes(String(f))) facts.push(String(f)); });
        const probed = { ...x.probed }; (r.probed || []).forEach((k) => { if (COMP.some((c) => c.key === k)) probed[k] = true; });
        let phase = x.phase;
        if (PHASES.some((p) => p.key === r.phase) && r.phase !== x.phase) {
          phase = r.phase as Phase;
          t.push({ who: "event", text: `Moved to ${PHASES.find((p) => p.key === phase)!.name.toLowerCase()} · ${fmtClock(elapsedMin(x))}`, at: Date.now() });
        }
        t.push({ who: "alex", text: r.reply, at: Date.now() });
        let board: Board = x.board;
        const bc = r.board_comment;
        if (withBoard && bc?.node_id && bc.text && x.board.nodes.some((n) => n.id === bc.node_id)) {
          board = { ...x.board, comments: [...x.board.comments.filter((c) => c.nodeId !== bc.node_id), { nodeId: bc.node_id, text: bc.text, at: Date.now() }] };
        }
        return { ...x, transcript: t, facts, probed, phase, board };
      });
    } catch (e) {
      // Roll back so nothing is lost; put the message back in the box.
      update((x) => ({ ...x, hints: before.hints, transcript: x.transcript.filter((t) => t !== mine) }));
      if (!opts.hint) { setText(msgText); if (image) setImg(image); }
      if (!(e instanceof ApiError && e.code === "cancelled")) setTurnErr({ msg: errCopy(e), retry: () => send(opts) });
    } finally { setBusy(null); }
  }

  async function end() {
    const cur = sRef.current; if (!cur || busy) return;
    if (!cur.transcript.some((t) => t.who === "me")) {
      if (await confirm({ title: "Discard this interview?", body: "You haven't answered yet, so there's nothing to debrief.", ok: "Discard", danger: true })) { store.remove(cur.id); router.push("/new"); }
      return;
    }
    if (!(await confirm({ title: "End the interview?", body: "Alex will step out of character and write your debrief. You can't continue the interview afterwards.", ok: "End and get debrief" }))) return;
    const fin = { ...cur, endedAt: Date.now(), status: "debrief" as const };
    store.put(fin); setS(null); router.push(`/session/${cur.id}`);
  }

  function onFile(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { toast("Attach a PNG, JPEG, GIF or WebP image."); return; }
    if (f.size > 5 * 1024 * 1024) { toast("That image is over 5 MB. Try a smaller screenshot."); return; }
    const r = new FileReader();
    r.onload = () => { const d = String(r.result); setImg({ media_type: f.type as Img["media_type"], data: d.slice(d.indexOf(",") + 1), name: f.name }); };
    r.readAsDataURL(f);
  }

  /* dictation via the browser's speech recognition, where available */
  const SR = typeof window !== "undefined" ? ((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => any) | undefined : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  function toggleMic() {
    if (listening) { recRef.current?.stop(); return; }
    if (!SR) return;
    const rec = new SR(); rec.continuous = true; rec.interimResults = false; rec.lang = navigator.language || "en-US";
    const base = text ? text.replace(/\s*$/, " ") : "";
    let said = "";
    rec.onresult = (e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) said += e.results[i][0].transcript;
      setText(base + said.trim());
    };
    rec.onend = () => { setListening(false); recRef.current = null; };
    rec.onerror = () => { setListening(false); toast("Dictation stopped. Check microphone permission."); };
    rec.start(); recRef.current = rec; setListening(true);
  }

  /* ---------- render ---------- */
  if (!loaded) return null;
  if (!s) return (
    <>
      <header className="top"><div className="top-in"><Brand /></div></header>
      <main className="page narrow"><div className="card empty-card"><p>No interview in progress.</p><Link href="/new" className="btn primary">Start an interview</Link></div></main>
    </>
  );

  const em = s.startedAt ? ((s.endedAt || now) - s.startedAt) / 60000 : 0;
  const budget = phaseBudget(s.duration);
  const curP = budget.find((p) => p.key === s.phase)!;
  const over = settings.warnOverrun && s.status === "interview" && em > curP.end + 0.5;
  const pct = Math.min(100, (em / s.duration) * 100);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header className="top room-top">
        <div className="top-in wide">
          <Brand tagline={false} />
          <div className="h-meta"><span className="small muted" style={{ fontSize: 12 }}>{s.level} · {s.duration} min</span><h1 className="h-q" title={s.question}>{s.question || "Alex is choosing a question…"}</h1></div>
          <div className="clock" aria-label="Interview time">
            <span className={"clock-t" + (em > s.duration ? " over" : "")} aria-live="off">{fmtClock(em)}</span>
            <div className="budget">
              <div className="budget-bar" role="img" aria-label={`${Math.floor(em)} of ${s.duration} minutes used, ${curP.name.toLowerCase()} phase`}>
                {budget.map((p) => <span key={p.key} style={{ flex: p.weight, background: p.color }} />)}
                <span className="budget-left" style={{ left: pct + "%" }} />
              </div>
              <div className="budget-l">{budget.map((p) => <span key={p.key} style={{ flex: p.weight }} className={p.key === s.phase ? "now" : ""}>{p.key === s.phase && s.status === "interview" ? `${p.name} · ${em > p.end ? `${Math.round(em - p.end)} min over` : `${Math.max(0, Math.round(p.end - em))} min left`}` : p.name}</span>)}</div>
            </div>
            <button type="button" className="btn sm end-btn" style={{ minHeight: 40 }} onClick={end} disabled={!!busy || s.status !== "interview"}>End interview</button>
          </div>
        </div>
      </header>

      <div className="room">
        <Whiteboard board={s.board} onChange={(b) => update((x) => ({ ...x, board: b }))}
          facts={s.facts} estimates={s.estimates} onEstimates={(v) => update((x) => ({ ...x, estimates: v }))}
          seen={withBoard}
          onWalkthrough={() => { setWithBoard(true); setText((t) => t || "Let me walk you through my board. "); setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); }} />

        <section aria-label="Conversation" className="convo">
          <div className="convo-h">
            <span className="av-lg" aria-hidden="true">A</span>
            <div className="stack" style={{ lineHeight: 1.3 }}><span style={{ fontWeight: 600, fontSize: 15 }}>Alex</span><span className="muted" style={{ fontSize: 12.5 }}>Senior engineer · interviewer · {s.style.toLowerCase()}</span></div>
          </div>
          <div className="log" ref={logRef} aria-live="polite">
            {s.transcript.map((t, i) => t.who === "event" ? <div key={i} className="event">{t.text}</div>
              : t.who === "alex" ? <div key={i} className="msg alex"><Markdown text={t.text} /></div>
              : <div key={i} className="msg me">{t.text}</div>)}
            {busy && <Thinking label={busy} />}
            {!busy && s.status === "interview" && s.transcript.length > 0 && s.transcript[s.transcript.length - 1].who === "alex" && !turnErr && (
              <div className="thinking"><span className="dots" aria-hidden="true" style={{ opacity: 0.7 }}><span style={{ animation: "none", opacity: 0.4 }} /><span style={{ animation: "none", opacity: 0.7 }} /><span style={{ animation: "none" }} /></span>Waiting for your answer</div>
            )}
            {startErr && (
              <div className="notice turn-err"><b>Alex couldn&apos;t start the interview. </b>{startErr}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}><button type="button" className="btn sm primary" onClick={begin}>Try again</button><Link href="/new" className="btn sm">Back</Link></div></div>
            )}
            {turnErr && (
              <div className="notice turn-err"><b>Your message didn&apos;t reach Alex. </b>{turnErr.msg}
                <div style={{ marginTop: 10 }}><button type="button" className="btn sm" onClick={() => { const r = turnErr.retry; setTurnErr(null); r(); }}>Send again</button></div></div>
            )}
          </div>
          {s.status === "interview" && (
            <div className={"phase-hint" + (over ? " warn" : "")}>
              <span className="txt">{over ? <><b>Over budget:</b> you&apos;re {Math.round(em - curP.end)} min past the {curP.name.toLowerCase()} budget. Consider moving on.</> : <><b>This phase:</b> {curP.hint}</>}</span>
              <button type="button" className="hint-btn" onClick={() => send({ hint: true })} disabled={!!busy}>Ask for a hint</button>
            </div>
          )}
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label htmlFor="reply" className="sr-only">Your answer</label>
            <textarea id="reply" ref={inputRef} rows={3} value={text} disabled={s.status !== "interview"} placeholder="Think out loud, like you would in the room."
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            {img && <span className="attach-pill">{img.name.slice(0, 28)}<button type="button" aria-label="Remove image" onClick={() => setImg(null)}>×</button></span>}
            <div className="composer-a">
              <label className="chk-s"><input type="checkbox" checked={withBoard} onChange={(e) => setWithBoard(e.target.checked)} />Include board</label>
              <span className="sp" />
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
              <button type="button" className="icon-btn" aria-label="Attach a diagram image" title="Attach a diagram image" onClick={() => fileRef.current?.click()} disabled={s.status !== "interview"}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M13.5 7.5l-5.6 5.6a3.5 3.5 0 01-5-5L8.6 2.4a2.3 2.3 0 013.3 3.3L6.3 11.3a1.2 1.2 0 01-1.6-1.6L10 4.4" /></svg>
              </button>
              {SR && <button type="button" className={"icon-btn" + (listening ? " rec" : "")} aria-label={listening ? "Stop dictation" : "Dictate"} aria-pressed={listening} title={listening ? "Stop dictation" : "Dictate"} onClick={toggleMic} disabled={s.status !== "interview"}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5.5" y="1.5" width="5" height="8" rx="2.5" /><path d="M3 7.5a5 5 0 0010 0M8 12.5V15" strokeLinecap="round" /></svg>
              </button>}
              <button type="submit" className="btn primary sm" style={{ minHeight: 40 }} disabled={!!busy || s.status !== "interview" || (!text.trim() && !img)}>Send</button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

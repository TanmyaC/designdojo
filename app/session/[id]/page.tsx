"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Whiteboard from "@/components/Whiteboard";
import { Header, Markdown, Thinking, fmtDate, md, useUI } from "@/components/ui";
import { COMP, verdictTone } from "@/lib/constants";
import { ApiError, errCopy, postJSON, postStream, promptSession } from "@/lib/api";
import { elapsedMin, store, useMounted, useSettings } from "@/lib/store";
import { openDiagram } from "@/lib/diagrams";
import { solutionHTML, solutionMD } from "@/lib/solutionHtml";
import type { Debrief, Session } from "@/lib/types";
import { normalizeDebrief } from "@/lib/normalize";

type Tab = "debrief" | "solution" | "interview";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter();
  const mounted = useMounted(); const settings = useSettings(); const { confirm, toast } = useUI();
  const [s, setS] = useState<Session | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("debrief");
  const [dErr, setDErr] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, "run" | "done" | "err">>({});
  const [solErr, setSolErr] = useState<string | null>(null);
  const sRef = useRef<Session | null>(null); sRef.current = s;
  const running = useRef({ debrief: false, solution: false });
  const solCtl = useRef<AbortController | null>(null);

  const save = useCallback((fn: (x: Session) => Session) => {
    setS((x) => { if (!x) return x; const n = fn(x); store.put(n); return n; });
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const cur = store.get(id);
    if (!cur) { setMissing(true); return; }
    if (cur.status === "interview" || cur.status === "starting") { router.replace("/room"); return; }
    if (cur.debrief) cur.debrief = normalizeDebrief(cur.debrief);
    setS(cur); if (cur.status === "solution" && cur.debrief) setTab(cur.solution.model ? "solution" : "debrief");
  }, [mounted, id, router]);

  /* ---------- model solution pipeline: independent design, then comparison ---------- */
  const runSolution = useCallback(async (force = false, from?: Session) => {
    if (running.current.solution) return; running.current.solution = true; setSolErr(null);
    let work = from || sRef.current!;
    if (force) { work = { ...work, solution: { model: null, cmp: null, deep: {} }, followups: [] }; const w = work; save(() => w); }
    const st: Record<string, "run" | "done" | "err"> = {};
    try {
      for (const step of ["model", "cmp"] as const) {
        if (work.solution[step]) { st[step] = "done"; setSteps({ ...st }); continue; }
        st[step] = "run"; setSteps({ ...st });
        solCtl.current = new AbortController();
        const { result } = await postJSON<{ result: unknown }>("/api/solution", { session: promptSession(work), step }, solCtl.current.signal);
        work = { ...work, solution: { ...work.solution, [step]: result } };
        save((x) => ({ ...x, solution: { ...x.solution, [step]: result } }));
        st[step] = "done"; setSteps({ ...st });
      }
    } catch (e) {
      const k = Object.keys(st).find((k) => st[k] === "run"); if (k) st[k] = "err"; setSteps({ ...st }); setSolErr(errCopy(e));
    } finally { running.current.solution = false; solCtl.current = null; }
  }, [save]);

  /* ---------- debrief ---------- */
  const runDebrief = useCallback(async () => {
    if (running.current.debrief || !sRef.current) return; running.current.debrief = true; setDErr(null);
    try {
      const res = await postJSON<{ debrief: Debrief }>("/api/debrief", { session: promptSession(sRef.current) });
      const debrief = normalizeDebrief(res.debrief);
      if (!debrief) throw new ApiError("invalid_json");
      const auto = store.settings().autoSolution;
      const next: Session = { ...sRef.current, debrief, status: auto ? "solution" : sRef.current.status };
      save((x) => ({ ...x, debrief, status: next.status }));
      if (store.currentId() === next.id) store.setCurrent(null);
      if (auto) runSolution(false, next);
    } catch (e) { setDErr(errCopy(e)); }
    finally { running.current.debrief = false; }
  }, [save, runSolution]);

  useEffect(() => {
    if (!s) return;
    // An interview ended without a debrief waits for "Get the debrief" instead of spending credits on open.
    if (!s.debrief && s.status !== "ended" && !running.current.debrief && !dErr) runDebrief();
    else if (s.debrief && s.status === "solution" && (!s.solution.model || !s.solution.cmp) && !running.current.solution && !solErr) runSolution();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, s?.debrief, s?.status]);

  if (missing) return (<><Header /><main className="page narrow"><div className="card empty-card"><p>That interview isn&apos;t on this device.</p><Link href="/history" className="btn">Go to history</Link></div></main></>);
  if (!s) return null;

  const writeSolution = () => { const next: Session = { ...s, status: "solution" }; save(() => next); setTab("solution"); runSolution(false, next); };
  const hasSolutionTab = s.status === "solution";
  /* Switching to "debrief" lets the effect above start it, exactly as ending with a debrief does. */
  const getDebrief = () => save((x) => ({ ...x, status: "debrief" }));

  return (
    <>
      <Header />
      <main className="page" style={{ gap: 22 }}>
        <div className="stack" style={{ gap: 8 }}>
          <Link href="/history" style={{ fontSize: 14, fontWeight: 500, textDecoration: "none" }}>← History</Link>
          <span className="small muted">{fmtDate(s.endedAt || s.createdAt, true)} · {s.level} level · {Math.round(elapsedMin(s))} of {s.duration} minutes · {s.hints} hint{s.hints === 1 ? "" : "s"}</span>
        </div>
        <div className="session-tabs" role="tablist" aria-label="Interview results">
          <button type="button" role="tab" aria-selected={tab === "debrief"} onClick={() => setTab("debrief")}>Debrief</button>
          <button type="button" role="tab" aria-selected={tab === "solution"} disabled={!hasSolutionTab} onClick={() => setTab("solution")}>Model solution</button>
          <button type="button" role="tab" aria-selected={tab === "interview"} onClick={() => setTab("interview")}>Transcript &amp; board</button>
        </div>

        {tab === "debrief" && (
          s.debrief ? <DebriefView s={s} onSolution={() => (hasSolutionTab ? setTab("solution") : writeSolution())} solutionReady={!!s.solution.model}
            onNew={() => router.push("/new")} />
            : s.status === "ended" ? (
              <div className="card stack" style={{ gap: 12, alignItems: "flex-start" }}>
                <h2 style={{ fontSize: 22 }}>No debrief yet</h2>
                <p className="muted" style={{ margin: 0 }}>This interview ended without one. Alex can step out of character now and grade it, with evidence from your answers. It usually takes a minute or two.</p>
                <button type="button" className="btn primary" onClick={getDebrief}>Get the debrief</button>
              </div>)
            : dErr ? <div className="card"><p>{dErr}</p><button type="button" className="btn primary" onClick={runDebrief}>Try again</button></div>
            : <div className="card"><Thinking label="Alex is writing your debrief. This usually takes a minute or two." /></div>
        )}

        {tab === "solution" && hasSolutionTab && (
          <SolutionView s={s} steps={steps} err={solErr} save={save}
            onRetry={() => runSolution()} onStop={() => solCtl.current?.abort()}
            onRegen={async () => { if (await confirm({ title: "Regenerate the model solution?", body: "The current solution, deep dives and your follow-ups with Sam will be replaced.", ok: "Regenerate" })) runSolution(true); }}
            busy={Object.values(steps).includes("run")} toast={toast} />
        )}

        {tab === "interview" && (
          <div className="stack" style={{ gap: 20 }}>
            <h2 className="h2" style={{ fontSize: 24 }}>{s.question || s.spec?.question}</h2>
            {(s.board.nodes.length > 0 || s.board.strokes.length > 0) && <Whiteboard board={s.board} onChange={() => {}} facts={s.facts} estimates={s.estimates} readOnly />}
            <div className="transcript">
              {s.transcript.map((t, i) => t.who === "event" ? <div key={i} className="event">{t.text}</div>
                : t.who === "alex" ? <div key={i} className="msg alex"><div className="who">Alex</div><Markdown text={t.text} /></div>
                : <div key={i} className="msg me">{t.text}</div>)}
            </div>
          </div>
        )}
      </main>
    </>
  );
}

/* ---------- debrief ---------- */
function DebriefView({ s, onSolution, solutionReady, onNew }: { s: Session; onSolution: () => void; solutionReady: boolean; onNew: () => void }) {
  const d = s.debrief!; const tone = verdictTone(d.verdict);
  const vcls = tone === "good" ? "v-hire" : tone === "mid" ? "v-lean-hire" : "v-no";
  return (
    <div>
      <div className="verdict">
        <div className={"stamp " + vcls} style={{ transform: "rotate(-2deg)" }}>{d.verdict || "—"}<div style={{ font: "600 12px var(--body)", marginTop: 4 }}>{s.level} bar</div></div>
        <div><h2 style={{ fontSize: 26 }}>{s.question || s.spec?.question}</h2><p className="lede" style={{ marginTop: 8 }}>{d.verdict_reason}</p></div>
      </div>

      {d.spec_reveal && (
        <details className="spec card">
          <summary>The problem Alex had in mind</summary>
          {([["Real problem", d.spec_reveal.real_problem], ["Scale", d.spec_reveal.scale], ["The crux", d.spec_reveal.crux], ["How close your scoping got", d.spec_reveal.how_close]] as const)
            .filter(([, v]) => v).map(([k, v]) => <p key={k}><b>{k}: </b>{v}</p>)}
        </details>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Competency scorecard</h3>
        {COMP.map((c) => {
          const x = (d.competencies || []).find((z) => z.key === c.key) || { rating: null } as NonNullable<Debrief["competencies"]>[number];
          return (
            <div className="comp" key={c.key}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div className={"rating" + (x.rating ? " r" + x.rating : "")} role="img" aria-label={x.rating ? `${x.rating} of 4` : "Not rated"}><i /><i /><i /><i /></div>
                <div className="small muted">{x.rating ? ["", "Weak", "Below the bar", "Meets the bar", "Strong"][x.rating] : "Not enough signal"}</div>
              </div>
              <div>
                {!!x.green?.length && <ul className="flags g">{x.green.map((f, i) => <li key={i}>{f.flag || String(f)}{f.evidence && <span className="ev">{f.evidence}</span>}</li>)}</ul>}
                {!!x.red?.length && <ul className="flags r">{x.red.map((f, i) => <li key={i}>{f.flag || String(f)}{f.evidence && <span className="ev">{f.evidence}</span>}</li>)}</ul>}
                {x.strong_would_add && <p className="small"><b>A strong candidate would add: </b>{x.strong_would_add}</p>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid2">
        <div className="card"><h3>What you missed</h3>
          <ul className="flags r">
            {(d.missed?.critical || []).map((m, i) => <li key={"c" + i}><span className="pill crit">Critical</span> {m}</li>)}
            {(d.missed?.nice_to_have || []).map((m, i) => <li key={"n" + i}><span className="pill nice">Nice to have</span> {m}</li>)}
          </ul></div>
        <div className="card"><h3>Moments that mattered</h3>
          <ul className="flags">{(d.moments || []).map((m, i) => <li key={i} className={m.type}>{m.text}</li>)}</ul>
          <h3 style={{ marginTop: 14 }}>Time management</h3><p>{d.time_management}</p></div>
        <div className="card"><h3>Practise next</h3><ol>{(d.top3 || []).map((t, i) => <li key={i}>{t}</li>)}</ol></div>
      </div>

      <div className="cta-bar">
        <button type="button" className="btn primary" onClick={onSolution}>{solutionReady ? "Open the model solution" : s.status === "solution" ? "See the model solution" : "Write the model solution"}</button>
        <button type="button" className="btn" onClick={onNew}>Start a new interview</button>
        <span className="small muted">Saved to your history on this device.</span>
      </div>
    </div>
  );
}

/* ---------- model solution + Sam ---------- */
const FQ: Record<string, [string, string]> = {
  script: ["Rehearsal script", "Give me the spoken 45-minute rehearsal script for this solution, timeboxed per phase, with the clarifying questions and check-in lines."],
  compare: ["Side-by-side table", "Compare my final design and the model solution side by side in a table, area by area."],
  quiz: ["Quiz me", "Quiz me: ask 8 rapid questions on this solution. I'll answer them all in one message and you grade them."],
};

function SolutionView({ s, steps, err, busy, onRetry, onStop, onRegen, save, toast }: {
  s: Session; steps: Record<string, string>; err: string | null; busy: boolean; onRetry: () => void; onStop: () => void; onRegen: () => void;
  save: (fn: (x: Session) => Session) => void; toast: (m: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [deepBusy, setDeepBusy] = useState(false);
  const [samBusy, setSamBusy] = useState(false);
  const [q, setQ] = useState("");
  const [pending, setPending] = useState<{ q: string; a: string } | null>(null);
  const sRef = useRef(s); sRef.current = s;
  const done = !!(s.solution.model && s.solution.cmp);

  async function deepDive(key: string, title: string) {
    const box = bodyRef.current?.querySelector<HTMLElement>("#deep-" + key); if (!box) return;
    if (sRef.current.solution.deep[key]) { box.hidden = !box.hidden; return; }
    if (deepBusy) { toast("A deep dive is already being written."); return; }
    setDeepBusy(true); box.hidden = false; box.innerHTML = '<div class="thinking"><span class="dots"><span></span><span></span><span></span></span>Sam is going deeper…</div>';
    let last = 0;
    try {
      const text = await postStream("/api/sam", { session: promptSession(sRef.current), kind: "deep", title }, (t) => { const n = Date.now(); if (n - last > 300) { last = n; box.innerHTML = md(t); } });
      box.innerHTML = md(text);
      save((x) => ({ ...x, solution: { ...x.solution, deep: { ...x.solution.deep, [key]: text } } }));
    } catch (e) { box.innerHTML = ""; toast(errCopy(e)); }
    finally { setDeepBusy(false); }
  }

  /* event delegation for the ported HTML */
  useEffect(() => {
    const el = bodyRef.current; if (!el) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const deep = t.closest<HTMLElement>(".deep-btn"); if (deep) { deepDive(deep.dataset.deep!, deep.dataset.title!); return; }
      const dx = t.closest<HTMLElement>(".dgm-x"); if (dx) { openDiagram(dx.parentElement); return; }
      const a = t.closest<HTMLAnchorElement>("a.seclink, .jump a");
      if (a) { const target = document.querySelector(a.getAttribute("href")!); if (target) { e.preventDefault(); target.scrollIntoView({ behavior: "smooth", block: "start" }); } }
    };
    el.addEventListener("click", h); return () => el.removeEventListener("click", h);
  });

  async function askSam(msg: string) {
    msg = msg.trim(); if (!msg || samBusy) return;
    setSamBusy(true); setQ(""); setPending({ q: msg, a: "" });
    try {
      const text = await postStream("/api/sam", { session: promptSession(sRef.current), kind: "follow", message: msg }, (t) => setPending({ q: msg, a: t }));
      save((x) => ({ ...x, followups: [...x.followups, { who: "me", text: msg }, { who: "sam", text }] }));
    } catch (e) { setQ(msg); toast(errCopy(e)); }
    finally { setPending(null); setSamBusy(false); }
  }

  function download() {
    const name = "model-solution-" + (s.question || "interview").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) + ".md";
    const url = URL.createObjectURL(new Blob([solutionMD(s)], { type: "text/markdown" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const STEPS: [string, string][] = [["model", "Designing from the agreed scope"], ["cmp", "Comparing with your design"]];
  const state = (k: string) => steps[k] || (s.solution[k as "model" | "cmp"] ? "done" : "");

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <ul className="steps" style={{ margin: 0 }}>{STEPS.map(([k, n]) => <li key={k} className={state(k)}><span className="st" />{n}</li>)}</ul>
        <span className="sp" />
        {busy && <button type="button" className="btn sm" onClick={onStop}>Stop</button>}
        {!busy && done && <button type="button" className="btn sm" onClick={download}>Download (.md)</button>}
        {!busy && (done || err) && <button type="button" className="btn sm ghost" onClick={onRegen}>Regenerate</button>}
      </div>
      {busy && !s.solution.model && <div style={{ margin: "20px 0" }}><Thinking label="Sam, a principal engineer, is designing the solution from the agreed scope. This takes one to three minutes." /></div>}
      <div ref={bodyRef} className="solution" dangerouslySetInnerHTML={{ __html: s.solution.model ? solutionHTML(s) : "" }} />
      {err && <div className="card" style={{ marginTop: 16 }}><p>{err}</p><button type="button" className="btn primary" onClick={onRetry}>Continue generating</button></div>}

      {done && (
        <div className="followups">
          <h3>Ask Sam</h3>
          <p className="small muted" style={{ marginTop: 4 }}>Sam wrote this solution. Go deeper on a topic, rehearse it out loud, or get quizzed.</p>
          <div className="chips" style={{ margin: "12px 0" }}>
            {Object.entries(FQ).map(([k, [label, prompt]]) => <button key={k} type="button" className="chip" onClick={() => askSam(prompt)} disabled={samBusy}>{label}</button>)}
            {(s.solution.model?.deep_dive_topics || []).slice(0, 6).map((t: string) => <button key={t} type="button" className="chip" onClick={() => askSam("Deep dive into: " + t)} disabled={samBusy}>{t}</button>)}
          </div>
          <div className="stack" style={{ gap: 12 }}>
            {s.followups.map((f, i) => f.who === "me" ? <div key={i} className="msg me">{f.text}</div> : <div key={i} className="msg sam md"><div className="who">Sam</div><Markdown text={f.text} /></div>)}
            {pending && <><div className="msg me">{pending.q}</div><div className="msg sam md"><div className="who">Sam</div>{pending.a ? <Markdown text={pending.a} /> : <span className="muted">Thinking…</span>}</div></>}
          </div>
          <form className="composer" style={{ margin: "14px 0 0" }} onSubmit={(e) => { e.preventDefault(); askSam(q); }}>
            <label htmlFor="finput" className="sr-only">Ask Sam a follow-up</label>
            <textarea id="finput" rows={2} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about any part of the solution…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); askSam(q); } }} style={{ minHeight: 50 }} />
            <div className="composer-a"><span className="sp" /><button type="submit" className="btn primary sm" disabled={samBusy || !q.trim()}>Ask</button></div>
          </form>
        </div>
      )}
    </div>
  );
}

"use client";
import Link from "next/link";
import { Header, Verdict, Bars, BudgetMini, fmtClock, useUI } from "@/components/ui";
import type { PublicQuestion } from "@/lib/catalog";
import { PHASES } from "@/lib/constants";
import { competencyAverages, elapsedMin, finishedSessions, store, useCurrentId, useMounted, useSessions } from "@/lib/store";

export default function Home({ featured }: { featured: PublicQuestion[] }) {
  const mounted = useMounted();
  const sessions = useSessions();
  const currentId = useCurrentId();
  const { confirm, toast } = useUI();
  const cur = mounted && currentId ? sessions[currentId] : null;
  const live = cur && (cur.status === "interview" || cur.status === "starting") ? cur : null;
  const done = mounted ? finishedSessions(sessions) : [];
  const avgs = competencyAverages(done).filter((c) => c.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const classics = featured.slice(0, 3);

  async function discard() {
    if (!live) return;
    if (!(await confirm({ title: "Discard this interview?", body: "Your answers, board and Alex's notes for this interview will be deleted. Saved debriefs in History stay.", ok: "Discard", danger: true }))) return;
    store.remove(live.id); toast("Interview discarded.");
  }

  return (
    <>
      <Header />
      <main className="page" style={{ paddingTop: 48, gap: 56 }}>
        <section className="hero">
          <div className="hero-l">
            <span className="eyebrow">Mock interviews for mid, senior and staff</span>
            <h1>Practice system design the way it’s <span className="hl">actually asked.</span></h1>
            <p className="lede" style={{ fontSize: 18, maxWidth: "54ch" }}>Alex, a senior engineer, scopes the problem with you, challenges your design and grades you on four competencies. Pick a question from the library or bring the one that worries you.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 6 }}>
              <Link href="/new" className="btn primary lg">Enter an interview <Arrow /></Link>
              <Link href="/new?mode=custom" className="btn lg"><Plus />Add your own question</Link>
            </div>
            <span className="small muted">No sign-up. Your history stays on this device.</span>
          </div>
          <Preview />
        </section>

        {live && (
          <div className="banner">
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600 }}>Interview in progress</div>
              <div style={{ fontSize: 14 }}>{live.question || live.spec?.question || "Alex's choice"} · {live.level} · <span className="mono">{fmtClock(elapsedMin(live))}</span> elapsed</div>
            </div>
            <Link href="/room" className="btn">Resume</Link>
            <button type="button" className="btn ghost" onClick={discard}>Discard</button>
          </div>
        )}

        <section aria-labelledby="how" className="stack" style={{ gap: 20 }}>
          <h2 id="how" className="h2">How a session runs</h2>
          <BudgetMini durations={50} />
          <ol className="steps4">
            {[
              ["Scope it", "The prompt starts vague on purpose. Ask about users, scale and constraints. Estimates are yours to make."],
              ["Sketch the design", "Lay out the main components and data flow on the whiteboard, or describe it in words. Alex sees the board."],
              ["Go deep", "Alex picks the weakest part of your design and pushes on failures, hot spots and trade-offs."],
              ["Get the debrief", "A verdict, a rating per competency with evidence, and a model solution showing what you missed."],
            ].map(([t, d], i) => (
              <li key={t}>
                <span className="stepn" style={{ background: PHASES[i].color, color: i === 0 ? "var(--ink)" : "#fff" }}>0{i + 1}</span>
                <span className="stept">{t}</span>
                <span className="muted" style={{ fontSize: 14.5 }}>{d}</span>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="pop" className="stack" style={{ gap: 20 }}>
          <div className="sec-head"><h2 id="pop" className="h2">Start with a classic</h2><Link href="/new">Browse all questions</Link></div>
          <div className="qcards">
            {classics.map((q) => (
              <Link key={q.id} href={`/new?q=${q.id}`} className="qcard">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span className={"chip-cat cat-" + q.cat}>{q.cat}</span><span className={"diff d-" + q.diff}><i />{q.diff}</span></div>
                <span className="qcard-t">{q.title}</span>
                <span className="muted" style={{ fontSize: 14.5 }}>{q.desc}</span>
                <span style={{ marginTop: "auto", paddingTop: 6, fontSize: 14, fontWeight: 600, color: "var(--blue)" }}>Practise →</span>
              </Link>
            ))}
          </div>
        </section>

        {done.length > 0 && (
          <section aria-labelledby="prog" className="stack" style={{ gap: 20 }}>
            <div className="sec-head"><h2 id="prog" className="h2">Your progress</h2><Link href="/history">See history</Link></div>
            <div className="stats">
              <div className="card"><div className="small muted">Interviews done</div><div className="stat">{done.length}</div></div>
              <div className="card"><div className="small muted">Last verdict</div><div style={{ marginTop: 8 }}><Verdict v={done[0].debrief?.verdict} size="stamp" /></div></div>
              {avgs.length > 0 && <div className="card"><div className="small muted">Strongest</div><div className="stat-s">{avgs[0].short}</div><div style={{ marginTop: 10 }}><Bars value={avgs[0].avg} tone="g" /></div></div>}
              {avgs.length > 1 && <div className="card"><div className="small muted">Focus next</div><div className="stat-s">{avgs[avgs.length - 1].short}</div><div style={{ marginTop: 10 }}><Bars value={avgs[avgs.length - 1].avg} tone="r" /></div></div>}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

const Arrow = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Plus = () => <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8 3v10M3 8h10" strokeLinecap="round" /></svg>;

function Preview() {
  const box = (bc: string, bg: string, r = "8px") => ({ padding: "8px 12px", border: `1.5px solid ${bc}`, borderRadius: r, background: bg, fontFamily: "var(--mono)", fontSize: 13 });
  return (
    <div className="hero-r" role="img" aria-label="Preview of an interview: the interviewer's prompt on a sticky note, a sketch of client, API, cache and database, and your reply">
      <div style={{ position: "absolute", top: 18, right: 18, display: "flex", alignItems: "center", gap: 10, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px" }}>
        <span className="mono" style={{ fontSize: 18, fontWeight: 500 }}>18:42</span>
        <span style={{ display: "flex", gap: 2, width: 120, height: 8, borderRadius: 4, overflow: "hidden" }}><span style={{ flex: 8, background: "var(--seg1)" }} /><span style={{ flex: 15, background: "var(--seg2)" }} /><span style={{ flex: 20, background: "var(--line)" }} /><span style={{ flex: 7, background: "var(--line)" }} /></span>
      </div>
      <div className="sticky-card" style={{ position: "absolute", top: 76, left: 26, width: 230, padding: "12px 14px", transform: "rotate(-2.5deg)" }}>
        <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, marginBottom: 4 }}>Alex</div>
        <div style={{ fontSize: 15, lineHeight: 1.45 }}>Let’s design a URL shortener. Where would you like to start?</div>
      </div>
      <div style={{ position: "absolute", top: 214, left: 36, right: 36, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={box("var(--ink)", "var(--surface)")}>Client</span>
        <svg width="28" height="10" viewBox="0 0 28 10" fill="none" stroke="var(--ink)" strokeWidth="1.5" aria-hidden="true"><path d="M0 5h25M21 1l4 4-4 4" /></svg>
        <span style={box("var(--blue)", "var(--blue-soft)")}>API</span>
        <svg width="28" height="10" viewBox="0 0 28 10" fill="none" stroke="var(--ink)" strokeWidth="1.5" aria-hidden="true"><path d="M0 5h25" strokeDasharray="3 3" /><path d="M21 1l4 4-4 4" /></svg>
        <span style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span style={{ ...box("var(--ink)", "var(--surface)"), padding: "6px 12px" }}>Cache</span>
          <span style={{ ...box("var(--ink)", "var(--surface)", "8px 8px 14px 14px"), padding: "6px 12px" }}>KV store</span>
        </span>
      </div>
      <div style={{ position: "absolute", bottom: 24, right: 26, width: 250, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "12px 4px 12px 12px", padding: "12px 14px", transform: "rotate(1.5deg)", boxShadow: "0 8px 20px rgba(27,36,54,0.08)" }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>You</div>
        <div style={{ fontSize: 15, lineHeight: 1.45 }}>First: who creates links, and how many a day?</div>
      </div>
      <div className="muted" style={{ position: "absolute", top: 24, left: 26, fontSize: 13, border: "1px dashed var(--faint)", borderRadius: 999, padding: "3px 10px", background: "var(--surface)" }}>Moved to high-level design</div>
    </div>
  );
}

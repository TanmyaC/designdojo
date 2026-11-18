"use client";
import Link from "next/link";
import { Fragment, useState } from "react";
import { Bars, Header, fmtDate, useUI } from "@/components/ui";
import { COMP, VERDICTS, verdictTone } from "@/lib/constants";
import { competencyAverages, elapsedMin, finishedSessions, rating, store, useMounted, useSessions } from "@/lib/store";

export default function History() {
  const mounted = useMounted(); const sessions = useSessions(); const { confirm, toast } = useUI();
  const [verdict, setVerdict] = useState("All verdicts");
  const [sort, setSort] = useState("Newest first");
  if (!mounted) return <Header />;
  const done = finishedSessions(sessions);
  const pending = Object.values(sessions).filter((s) => !s.debrief && s.endedAt);
  const mins = Math.round(done.reduce((a, s) => a + elapsedMin(s), 0));
  const good = done.filter((s) => verdictTone(s.debrief?.verdict) === "good").length;
  const goodRecent = done.slice(0, 4).filter((s) => verdictTone(s.debrief?.verdict) === "good").length;
  const avgs = competencyAverages(done).filter((c) => c.avg !== null).sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));
  const latest = done[0];
  let rows = done.filter((s) => verdict === "All verdicts" || (s.debrief?.verdict || "").toLowerCase() === verdict.toLowerCase());
  if (sort === "Oldest first") rows = [...rows].reverse();
  const gaps: Record<string, { label: string; n: number }> = {};
  done.forEach((s) => (s.debrief?.session_log?.recurring_gaps || []).forEach((g) => { const k = g.toLowerCase(); gaps[k] = { label: gaps[k]?.label || g, n: (gaps[k]?.n || 0) + 1 }; }));
  const topGaps = Object.values(gaps).sort((a, b) => b.n - a.n).slice(0, 6);

  async function del(id: string, q: string) {
    if (!(await confirm({ title: "Delete this interview?", body: `“${q}”: its scorecard, transcript, board, debrief and solution are removed from this device.`, ok: "Delete", danger: true }))) return;
    store.remove(id); toast("Interview deleted.");
  }

  return (
    <>
      <Header />
      <main className="page">
        <div className="stack" style={{ gap: 8 }}>
          <h1 className="h1">History</h1>
          <p className="lede">Every interview you finish, with its verdict and competency ratings. Open one to reread the debrief and model solution.</p>
        </div>

        {pending.map((s) => (
          <div key={s.id} className="banner"><div style={{ flex: 1 }}><b>Debrief not written yet</b><div style={{ fontSize: 14 }}>{s.question || s.spec?.question}</div></div><Link href={`/session/${s.id}`} className="btn">Get the debrief</Link></div>
        ))}

        {!done.length ? (
          <div className="card empty-card"><p>No interviews yet. Your scorecards collect here after each debrief.</p><Link href="/new" className="btn primary">Start your first interview</Link></div>
        ) : (<>
          <div className="stats">
            <div className="card"><div className="small muted">Interviews</div><div className="stat">{done.length}</div><div className="small muted" style={{ marginTop: 6 }}>{mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`} practised</div></div>
            <div className="card"><div className="small muted">Hire or better</div><div className="stat">{good} <span className="muted" style={{ fontSize: 20 }}>of {done.length}</span></div>{done.length > 1 && <div className="small" style={{ marginTop: 6, color: "var(--green)" }}>{goodRecent} of the last {Math.min(4, done.length)}</div>}</div>
            {avgs[0] && <div className="card"><div className="small muted">Strongest</div><div className="stat-s">{avgs[0].short}</div><div style={{ marginTop: 10 }}><Bars value={avgs[0].avg} tone="g" /></div></div>}
            {avgs.length > 1 && <div className="card"><div className="small muted">Focus next</div><div className="stat-s">{avgs[avgs.length - 1].short}</div><div style={{ marginTop: 10 }}><Bars value={avgs[avgs.length - 1].avg} tone="r" /></div></div>}
          </div>

          {latest && (
            <section aria-labelledby="latest" className="card latest">
              <div className={"big-stamp v-" + verdictTone(latest.debrief?.verdict)}>{latest.debrief?.verdict}<small>{latest.level} bar</small></div>
              <div style={{ flex: "1 1 280px", minWidth: 0 }}>
                <div className="small muted">Latest debrief · {fmtDate(latest.endedAt)}</div>
                <h2 id="latest" style={{ margin: "2px 0 6px", fontSize: 22 }}>{latest.question || latest.spec?.question}</h2>
                <p className="muted" style={{ margin: 0, fontSize: 14.5, maxWidth: "60ch" }}>{latest.debrief?.verdict_reason}</p>
                <Link href={`/session/${latest.id}`} style={{ display: "inline-block", marginTop: 8, fontWeight: 500 }}>Open debrief</Link>
              </div>
              <div style={{ flex: "1 1 260px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", alignItems: "center", fontSize: 14 }}>
                {COMP.map((c) => <Fragment key={c.key}><span>{c.short}</span><Bars small value={rating(latest, c.key)} /></Fragment>)}
              </div>
            </section>
          )}

          {topGaps.length > 0 && (
            <section className="card"><h2 style={{ fontSize: 20 }}>Recurring gaps</h2>
              <ul className="flags r" style={{ marginTop: 10 }}>{topGaps.map((g) => <li key={g.label}>{g.label}{g.n > 1 ? ` (${g.n} sessions)` : ""}</li>)}</ul>
              <p className="small muted" style={{ margin: 0 }}>Alex reads these when you start an interview and probes them earlier.</p></section>
          )}

          <section aria-labelledby="sess" className="stack" style={{ gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-end" }}>
              <h2 id="sess" className="h2" style={{ fontSize: 26 }}>All sessions</h2>
              <div className="filters">
                <div className="field"><label htmlFor="f-verdict">Verdict</label>
                  <select id="f-verdict" className="select on-surface" value={verdict} onChange={(e) => setVerdict(e.target.value)}><option>All verdicts</option>{VERDICTS.map((v) => <option key={v}>{v}</option>)}</select></div>
                <div className="field"><label htmlFor="f-sort">Sort</label>
                  <select id="f-sort" className="select on-surface" value={sort} onChange={(e) => setSort(e.target.value)}><option>Newest first</option><option>Oldest first</option></select></div>
              </div>
            </div>
            <div className="card" style={{ padding: 0, overflowX: "auto" }}>
              <table className="htable">
                <thead><tr><th scope="col">Date</th><th scope="col">Question</th><th scope="col">Level</th><th scope="col">Scope · Design · Depth · Comms</th><th scope="col">Verdict</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const sc = [rating(s, "storage"), rating(s, "distributed"), rating(s, "observability"), rating(s, "scoping")];
                    return (
                      <tr key={s.id}>
                        <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 13 }}>{fmtDate(s.endedAt)}</td>
                        <td><div style={{ fontWeight: 600 }}>{s.question || s.spec?.question}</div><div className="small muted">{s.source === "custom" ? "Your question" : s.source === "auto" ? "Alex's choice" : "Library"} · {s.duration} min</div></td>
                        <td>{s.level}</td>
                        <td><div style={{ display: "flex", gap: 4 }} aria-label={COMP.map((c, i) => `${c.short} ${sc[i] ?? "not rated"}`).join(", ")}>{sc.map((v, i) => <span key={i} className={"score s" + (v ?? 0)} title={COMP[i].name}>{v ?? "–"}</span>)}</div></td>
                        <td><span className={"vchip v-" + verdictTone(s.debrief?.verdict)}>{s.debrief?.verdict}</span></td>
                        <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                          <Link href={`/session/${s.id}`} style={{ display: "inline-flex", alignItems: "center", minHeight: 40, fontWeight: 500, marginRight: 6 }}>View debrief</Link>
                          <button type="button" className="icon-btn danger" aria-label={`Delete interview: ${s.question}`} onClick={() => del(s.id, s.question || String(s.spec?.question || ""))}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></svg></button>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length && <tr><td colSpan={6} className="muted">No sessions with that verdict.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="small muted" style={{ margin: 0 }}>Ratings are out of 4: 1 weak, 2 below the bar, 3 meets the bar, 4 strong.</p>
          </section>
        </>)}
      </main>
    </>
  );
}

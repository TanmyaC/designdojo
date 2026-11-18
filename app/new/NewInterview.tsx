"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header, BudgetMini, useUI } from "@/components/ui";
import { CATEGORIES, TOPICS } from "@/lib/questions";
import type { PublicQuestion } from "@/lib/catalog";
import { competencyAverages, finishedSessions, newSession, store, useCurrentId, useCustomQuestions, useMounted, useSessions, useSettings } from "@/lib/store";
import type { Level } from "@/lib/types";

export default function NewInterview({ library }: { library: PublicQuestion[] }) {
  const first = library[0]?.id || "auto";
  const params = useSearchParams(); const router = useRouter();
  const mounted = useMounted(); const settings = useSettings(); const sessions = useSessions(); const currentId = useCurrentId();
  const custom = useCustomQuestions(); const { confirm, toast } = useUI();
  const done = mounted ? finishedSessions(sessions) : [];
  const weakest = competencyAverages(done).filter((c) => c.avg !== null).sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0))[0];

  const [mode, setMode] = useState<"library" | "custom">(params.get("mode") === "custom" ? "custom" : "library");
  const [cat, setCat] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string>(params.get("q") || "");
  const [level, setLevel] = useState<Level>("Senior");
  const [len, setLen] = useState(50);
  const [form, setForm] = useState({ title: "", spec: "", topic: "Storage", difficulty: "Medium", save: true });
  const [added, setAdded] = useState(false);

  useEffect(() => { if (!mounted) return; setLevel(settings.level); setLen(settings.duration);
    if (!params.get("q")) setSel(settings.autoTargetWeakest && done.length ? "auto" : first);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  const all = useMemo(() => [
    ...custom.map((c) => ({ id: "c:" + c.id, title: c.title, cat: "Yours", diff: c.difficulty, desc: c.spec ? "Your question, with a hidden spec for Alex." : "Your question.", custom: c })),
    ...library.map((x) => ({ ...x, custom: undefined })),
  ], [custom, library]);
  const shown = all.filter((x) => (cat === "All" || x.cat === cat || (x.custom && x.custom.topic === cat)) && (!q.trim() || [x.title, x.desc, ...("tags" in x ? x.tags : [])].join(" ").toLowerCase().includes(q.trim().toLowerCase())));
  const picked = sel === "auto" ? null : all.find((x) => x.id === sel) || null;

  const selTitle = sel === "auto" ? "Alex picks a question for you" : picked?.title || "Pick a question";
  const selMeta = sel === "auto" ? `${weakest ? "Targets " + weakest.short.toLowerCase() : "A classic you haven’t done"} · Surprise · ${level} · ${len} min`
    : picked ? `${picked.custom ? "Your question" : picked.cat} · ${picked.diff} · ${level} · ${len} min` : `${level} · ${len} min`;

  function applyCustom() {
    const title = form.title.trim(); if (!title) { toast("Write your question first."); return; }
    const id = String(Date.now());
    // Unsaved questions are still stored so they can be selected, then removed when the interview starts.
    store.addQuestion({ id, title, spec: form.spec.trim(), topic: form.topic, difficulty: form.difficulty, createdAt: Date.now() });
    setSel("c:" + id); setAdded(true); if (!form.save) sessionStorage.setItem("dd.tempQ", id);
  }
  async function removeCustom(id: string) {
    if (!(await confirm({ title: "Remove this question?", body: "It's removed from your library. Past interviews on it stay in History.", ok: "Remove", danger: true }))) return;
    store.removeQuestion(id); if (sel === "c:" + id) setSel(first);
  }

  async function start() {
    if (!sel) { toast("Pick a question first."); return; }
    const live = currentId ? store.get(currentId) : null;
    if (live && (live.status === "interview" || live.status === "starting")) {
      if (!(await confirm({ title: "Replace the interview in progress?", body: `“${live.question || live.spec?.question || "Your current interview"}” hasn't been debriefed yet. Starting a new one deletes it.`, ok: "Start new", danger: true }))) return;
      store.remove(live.id);
    }
    const s = newSession({
      question: picked?.title || "", source: sel === "auto" ? "auto" : picked?.custom ? "custom" : "library",
      questionId: picked && !picked.custom ? picked.id : undefined,
      topic: picked?.custom?.topic || picked?.cat, difficulty: picked?.diff, customSpec: picked?.custom?.spec || undefined,
      level, duration: len, style: settings.style, rubric: settings.rubric, quoteEvidence: settings.quoteEvidence,
    });
    const temp = sessionStorage.getItem("dd.tempQ");
    if (temp && picked?.custom?.id === temp) { store.removeQuestion(temp); sessionStorage.removeItem("dd.tempQ"); }
    store.put(s); store.setCurrent(s.id); router.push("/room");
  }

  return (
    <>
      <Header cta={false} />
      <main className="page">
        <div className="stack" style={{ gap: 10 }}>
          <Link href="/" style={{ fontSize: 14, fontWeight: 500, textDecoration: "none" }}>← Home</Link>
          <h1 className="h1">Run a mock interview</h1>
          <p className="lede">Choose a question to practise, or add your own. Alex scopes it with you, challenges your design and grades you at the end.</p>
        </div>

        <div className="newgrid">
          <section className="card">
            <div role="tablist" aria-label="Question source" className="seg inline" style={{ alignSelf: "flex-start" }}>
              <button type="button" role="tab" aria-selected={mode === "library"} onClick={() => setMode("library")} style={{ padding: "0 16px" }}>Question library</button>
              <button type="button" role="tab" aria-selected={mode === "custom"} onClick={() => setMode("custom")} style={{ padding: "0 16px" }}>Add your own</button>
            </div>

            {mode === "library" ? (
              <div className="stack" style={{ gap: 14 }}>
                <label htmlFor="search" className="sr-only">Search questions</label>
                <div className="search">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--muted)" strokeWidth="1.5" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" /></svg>
                  <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search questions, like “chat” or “payments”" />
                </div>
                <div className="pills" aria-label="Filter by topic">
                  {CATEGORIES.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
                </div>
                <button type="button" className="qrow auto" aria-pressed={sel === "auto"} onClick={() => setSel("auto")}>
                  <span className="radio" aria-hidden="true" />
                  <span style={{ flex: 1, minWidth: 0 }} className="stack">
                    <span style={{ fontWeight: 600, color: "var(--blue)" }}>Let Alex choose</span>
                    <span className="muted" style={{ fontSize: 14 }}>{weakest ? <>Picks a question that targets your weakest competency. Right now: {weakest.short.toLowerCase()}.</> : "Picks a classic question that fits your level."}</span>
                  </span>
                </button>
                <ul className="qlist">
                  {shown.map((x) => (
                    <li key={x.id} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                      <button type="button" className="qrow" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
                        <span className="radio" aria-hidden="true" />
                        <span style={{ flex: 1, minWidth: 0 }} className="stack"><span className="qrow-t">{x.title}</span><span className="muted" style={{ fontSize: 14 }}>{x.desc}</span></span>
                        <span className="qrow-m"><span className={"chip-cat cat-" + x.cat}>{x.cat === "Yours" ? "Your question" : x.cat}</span><span className={"diff d-" + x.diff}><i />{x.diff}</span></span>
                      </button>
                      {x.custom && <button type="button" className="icon-btn danger del" aria-label={`Remove “${x.title}” from your library`} onClick={() => removeCustom(x.custom!.id)}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" /></svg></button>}
                    </li>
                  ))}
                  {!shown.length && <li className="muted small">No questions match. Try another word, or add your own.</li>}
                </ul>
              </div>
            ) : (
              <form className="stack" style={{ gap: 20 }} onSubmit={(e) => { e.preventDefault(); applyCustom(); }}>
                <div className="field">
                  <label htmlFor="cq">Your question</label>
                  <textarea id="cq" rows={3} className="textarea" style={{ fontSize: 17 }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Design a ticket booking system for live concerts" />
                  <span className="small muted">Write it the way an interviewer would say it. Keep it short; Alex adds details when you ask.</span>
                </div>
                <div className="field">
                  <label htmlFor="ctx">Hidden spec for Alex <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
                  <textarea id="ctx" rows={4} className="textarea" value={form.spec} onChange={(e) => setForm({ ...form, spec: e.target.value })} placeholder="Scale, constraints, or the company you are interviewing with. Alex reveals these only when you ask the right questions." />
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                  <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor="ctopic">Topic</label>
                    <select id="ctopic" className="select" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>{TOPICS.map((t) => <option key={t}>{t}</option>)}</select></div>
                  <div className="field" style={{ flex: "1 1 200px" }}><label htmlFor="cdiff">Difficulty</label>
                    <select id="cdiff" className="select" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
                </div>
                <label className="check" style={{ fontSize: 14.5 }}><input type="checkbox" checked={form.save} onChange={(e) => setForm({ ...form, save: e.target.checked })} />Save to my library so I can practise it again</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                  <button type="submit" className="btn">Use this question</button>
                  {added && <span className="pill-ok"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>{form.save ? "Added to your library and selected" : "Selected for this interview"}</span>}
                </div>
              </form>
            )}
          </section>

          <aside aria-labelledby="sumh">
            <div className="sticky-card" style={{ transform: "rotate(-1deg)" }}>
              <h2 id="sumh" style={{ margin: "0 0 6px", fontSize: 12.5, fontWeight: 600, opacity: 0.8, fontFamily: "var(--body)", letterSpacing: 0 }}>Your interview</h2>
              <div style={{ font: "700 22px/1.2 var(--display)" }}>{selTitle}</div>
              <div style={{ fontSize: 14, marginTop: 6 }}>{selMeta}</div>
            </div>
            <div className="card stack" style={{ gap: 18 }}>
              <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Level</legend>
                <div className="seg">{(["Mid", "Senior", "Staff"] as Level[]).map((x) => <button key={x} type="button" aria-pressed={level === x} onClick={() => setLevel(x)}>{x}</button>)}</div></fieldset>
              <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Length</legend>
                <div className="seg">{[45, 50, 60].map((x) => <button key={x} type="button" aria-pressed={len === x} onClick={() => setLen(x)}>{x} min</button>)}</div></fieldset>
              <div className="stack" style={{ gap: 5 }}><span style={{ fontSize: 14, fontWeight: 600 }}>Time budget</span><BudgetMini durations={len} /></div>
              <button type="button" className="btn primary lg" onClick={start} disabled={!sel}>Start interview <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <span className="small muted" style={{ textAlign: "center", marginTop: -8 }}>The clock starts when Alex speaks.</span>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

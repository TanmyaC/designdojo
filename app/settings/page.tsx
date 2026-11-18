"use client";
import { useEffect, useRef, useState } from "react";
import { Header, useUI } from "@/components/ui";
import { DEFAULT_SETTINGS, store, useCustomQuestions, useMounted } from "@/lib/store";
import { Speaker, speechStatus, type SpeechStatus } from "@/lib/voice";
import type { Level, Rubric, Settings as S, Style } from "@/lib/types";

const STYLES: { label: Style; mark: string; desc: string; badge: string }[] = [
  { label: "Supportive", mark: "S", desc: "Hints when you stall. Good for first runs.", badge: "var(--green-soft);color:var(--green)" },
  { label: "Neutral", mark: "N", desc: "Answers what you ask, nudges on time.", badge: "var(--sticky);color:var(--sticky-ink)" },
  { label: "Tough", mark: "T", desc: "Interrupts and challenges every number.", badge: "var(--red-soft);color:var(--red-ink)" },
];

export default function Settings() {
  const mounted = useMounted(); const { confirm, toast } = useUI(); const questions = useCustomQuestions();
  const [s, setS] = useState<S>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [showQ, setShowQ] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mounted) setS(store.settings()); }, [mounted]);
  const [speech, setSpeech] = useState<SpeechStatus | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const previewer = useRef<Speaker | null>(null);
  useEffect(() => { speechStatus(true).then(setSpeech); return () => previewer.current?.destroy(); }, []);
  async function preview() {
    if (!previewer.current) previewer.current = new Speaker();
    if (previewing) { previewer.current.stop(); return; }
    setPreviewing(true);
    try { await previewer.current.unlock(); await previewer.current.speak("Let's design a URL shortener. Where would you like to start?", { voice: s.voiceName || undefined, speed: s.voiceSpeed }); }
    catch { toast("Couldn't reach the speech server."); }
    finally { setPreviewing(false); }
  }
  const set = (p: Partial<S>) => { setS((x) => ({ ...x, ...p })); setSaved(false); };

  function save() { store.saveSettings(s); setSaved(true); }
  function exportAll() {
    const data = { app: "designdojo", version: 1, exportedAt: new Date().toISOString(), settings: store.settings(), questions: store.questions(), sessions: Object.values(store.sessions()) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `designdojo-history-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importAll(f?: File) {
    if (!f) return;
    f.text().then((t) => {
      const d = JSON.parse(t);
      if (d?.app !== "designdojo" || !Array.isArray(d.sessions)) throw new Error("bad");
      const cur = store.sessions(); d.sessions.forEach((x: { id: string }) => { if (x?.id && !cur[x.id]) store.put(x as never); });
      const have = new Set(store.questions().map((q) => q.id)); (d.questions || []).forEach((q: { id: string }) => { if (!have.has(q.id)) store.addQuestion(q as never); });
      toast(`Imported ${d.sessions.length} interview${d.sessions.length === 1 ? "" : "s"}.`);
    }).catch(() => toast("That file isn't a Design Dojo export."));
  }
  async function wipe() {
    if (!(await confirm({ title: "Delete all history?", body: "Every interview, debrief and model solution on this device is removed for good. Export first if you want a copy.", ok: "Delete everything", danger: true }))) return;
    store.clearAll(); toast("History deleted.");
  }

  const seg = <T extends string | number>(opts: T[], v: T, on: (x: T) => void, fmt = (x: T) => String(x)) => (
    <div className="seg">{opts.map((o) => <button key={String(o)} type="button" aria-pressed={v === o} onClick={() => on(o)}>{fmt(o)}</button>)}</div>
  );

  return (
    <>
      <Header />
      <main className="page narrow">
        <div className="stack" style={{ gap: 8 }}><h1 className="h1">Settings</h1><p className="lede">Defaults for new interviews. You can still change level and length on each one.</p></div>

        <section aria-labelledby="s1" className="card stack" style={{ gap: 18, padding: 22 }}>
          <h2 id="s1" style={{ fontSize: 20 }}>Interview defaults</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
            <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Target level</legend>{seg<Level>(["Mid", "Senior", "Staff"], s.level, (x) => set({ level: x }))}</fieldset>
            <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Length</legend>{seg<number>([45, 50, 60], s.duration, (x) => set({ duration: x }), (x) => `${x} min`)}</fieldset>
          </div>
          <fieldset>
            <legend className="lab" style={{ marginBottom: 8 }}>How Alex interviews</legend>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              {STYLES.map((x) => (
                <button key={x.label} type="button" aria-pressed={s.style === x.label} onClick={() => set({ style: x.label })} className="qrow" style={{ flexDirection: "column", gap: 6 }}>
                  <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, background: x.badge.split(";")[0], color: x.badge.split("color:")[1] }}>{x.mark}</span>
                  <span style={{ font: "700 17px var(--display)" }}>{x.label}</span>
                  <span className="muted" style={{ fontSize: 14 }}>{x.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="check"><input type="checkbox" checked={s.warnOverrun} onChange={(e) => set({ warnOverrun: e.target.checked })} /><span>Warn me when a phase runs over its time budget</span></label>
          <label className="check"><input type="checkbox" checked={s.autoTargetWeakest} onChange={(e) => set({ autoTargetWeakest: e.target.checked })} /><span>When I start a new interview, preselect “Let Alex choose” so it targets my weakest competency</span></label>
        </section>

        <section aria-labelledby="s2" className="card stack" style={{ gap: 14, padding: 22 }}>
          <h2 id="s2" style={{ fontSize: 20 }}>Debrief</h2>
          <label className="check"><input type="checkbox" checked={s.autoSolution} onChange={(e) => set({ autoSolution: e.target.checked })} /><span>Write a model solution after each debrief</span></label>
          <label className="check"><input type="checkbox" checked={s.quoteEvidence} onChange={(e) => set({ quoteEvidence: e.target.checked })} /><span>Quote my own messages as evidence for each rating</span></label>
          <div className="field" style={{ maxWidth: 380 }}><label htmlFor="rubric">Rubric</label>
            <select id="rubric" className="select" value={s.rubric} onChange={(e) => set({ rubric: e.target.value as Rubric })}>
              <option value="default">Four competencies (default)</option><option value="bigtech">Big-tech loop</option><option value="startup">Startup generalist</option>
            </select></div>
        </section>

        <section aria-labelledby="sv" className="card stack" style={{ gap: 14, padding: 22 }}>
          <h2 id="sv" style={{ fontSize: 20 }}>Voice</h2>
          {speech && !speech.enabled ? (
            <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>
              {speech.reason === "not_configured" ? "Voice needs the speech server, which isn't set up for this site yet." : "The speech server isn't reachable right now, so interviews use text."}{" "}
              To run it, see <code>speech-server/README.md</code> in the repository and set <code>SPEECH_URL</code>.
            </p>
          ) : null}
          <label className="check"><input type="checkbox" checked={s.voice} onChange={(e) => set({ voice: e.target.checked })} /><span>Speak with Alex: hear the replies and answer out loud</span></label>
          <div className="stack" style={{ gap: 16, opacity: s.voice ? 1 : 0.55 }}>
            <div className="field" style={{ maxWidth: 460 }}><label htmlFor="vname">Alex&apos;s voice</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select id="vname" className="select" style={{ flex: 1 }} value={s.voiceName} disabled={!speech?.enabled} onChange={(e) => set({ voiceName: e.target.value })}>
                  <option value="">{speech?.defaultVoice ? `Default: ${speech.voices.find((v) => v.id === speech.defaultVoice)?.label || speech.defaultVoice}` : "Default"}</option>
                  {(speech?.voices || []).map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
                <button type="button" className="btn" onClick={preview} disabled={!speech?.enabled}>{previewing ? "Stop" : "Hear Alex"}</button>
              </div></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Speaking speed</legend>{seg<number>([0.9, 1, 1.15], s.voiceSpeed, (x) => set({ voiceSpeed: x }), (x) => (x === 1 ? "Normal" : x < 1 ? "Slower" : "Faster"))}</fieldset>
            <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Send my answer after a pause of</legend>{seg<number>([2, 3, 5], s.endSilenceSec, (x) => set({ endSilenceSec: x as 2 | 3 | 5 }), (x) => `${x} s`)}</fieldset>
            </div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>Audio goes only to this site&apos;s own speech server and is never stored; the interview keeps the text, as with typed answers.</p>
        </section>

        <section aria-labelledby="s3" className="card stack" style={{ gap: 12, padding: 22 }}>
          <h2 id="s3" style={{ fontSize: 20 }}>Appearance</h2>
          <fieldset><legend className="lab" style={{ marginBottom: 6 }}>Theme</legend>
            <div className="seg inline">{(["System", "Light", "Dark"] as const).map((t) => <button key={t} type="button" aria-pressed={s.theme === t} onClick={() => set({ theme: t })} style={{ padding: "0 16px" }}>{t}</button>)}</div></fieldset>
        </section>

        <section aria-labelledby="s4" className="card stack" style={{ gap: 12, padding: 22 }}>
          <h2 id="s4" style={{ fontSize: 20 }}>Your data</h2>
          <p className="muted" style={{ margin: 0, fontSize: 14.5 }}>History and your own questions are stored in this browser only. Export them to keep a copy or move to another device.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="button" className="btn" onClick={exportAll}>Export history</button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import</button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { importAll(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" className="btn" aria-expanded={showQ} onClick={() => setShowQ((v) => !v)}>Manage my questions ({questions.length})</button>
            <button type="button" className="btn danger" onClick={wipe}>Delete all history</button>
          </div>
          {showQ && (questions.length ? (
            <ul className="qlist">{questions.map((q) => (
              <li key={q.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <span style={{ flex: 1 }}><b>{q.title}</b><span className="small muted"> · {q.topic} · {q.difficulty}{q.spec ? " · has hidden spec" : ""}</span></span>
                <button type="button" className="btn sm danger" onClick={() => store.removeQuestion(q.id)}>Remove</button>
              </li>))}</ul>
          ) : <p className="small muted" style={{ margin: 0 }}>You haven&apos;t added any questions yet.</p>)}
        </section>

        <div className="card" style={{ position: "sticky", bottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 14px", boxShadow: "0 10px 28px rgba(27,36,54,.08)" }}>
          <span className="muted" style={{ flex: 1, minWidth: 160, fontSize: 14.5 }}>Changes apply to your next interview.</span>
          {saved && <span className="pill-ok"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" /></svg>Saved</span>}
          <button type="button" className="btn primary" onClick={save}>Save changes</button>
        </div>
      </main>
    </>
  );
}

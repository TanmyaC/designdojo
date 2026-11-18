"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { useSettings } from "@/lib/store";
import { PHASES, verdictTone } from "@/lib/constants";

/* ---------- brand + header ---------- */
export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#4A3B00" strokeWidth="1.5"><rect x="2" y="3" width="5" height="4" rx="1" /><rect x="11" y="3" width="5" height="4" rx="1" /><rect x="6.5" y="11" width="5" height="4" rx="1" /><path d="M4.5 7v2h9V7M9 9v2" /></svg>
    </span>
  );
}
export function Brand({ tagline = true }: { tagline?: boolean }) {
  return (
    <Link href="/" className="brand">
      <Logo />
      <span className="brand-t"><span className="brand-n">Design Dojo</span>{tagline && <span className="brand-s">System design practice</span>}</span>
    </Link>
  );
}
export function Header({ cta = true }: { cta?: boolean }) {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link href={href} className="tab" aria-current={path === href ? "page" : undefined}>{label}</Link>
  );
  return (
    <header className="top">
      <div className="top-in">
        <Brand />
        <nav aria-label="Sections" className="tabs">{tab("/", "Home")}{tab("/history", "History")}{tab("/settings", "Settings")}</nav>
        {cta && <Link href="/new" className="btn primary sm" style={{ marginLeft: "auto", minHeight: 40 }}>New interview</Link>}
      </div>
    </header>
  );
}

/* ---------- theme: applies the saved theme to <html> ---------- */
export function ThemeSync() {
  const { theme } = useSettings();
  useEffect(() => {
    const r = document.documentElement;
    if (theme === "Light") r.dataset.theme = "light"; else if (theme === "Dark") r.dataset.theme = "dark"; else delete r.dataset.theme;
  }, [theme]);
  return null;
}

/* ---------- markdown ---------- */
export function md(text: string): string {
  if (typeof window === "undefined") return "";
  return DOMPurify.sanitize(marked.parse(text || "", { gfm: true, breaks: false, async: false }) as string);
}
export function Markdown({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => md(text), [text]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

/* ---------- small display bits ---------- */
export function Dots() { return <span className="dots" aria-hidden="true"><span /><span /><span /></span>; }
export function Thinking({ label }: { label: string }) {
  const [t0] = useState(() => Date.now()); const [s, setS] = useState(0);
  useEffect(() => { const i = setInterval(() => setS(Math.round((Date.now() - t0) / 1000)), 1000); return () => clearInterval(i); }, [t0]);
  return <div className="thinking" role="status" aria-live="polite"><Dots />{label}{s >= 5 && <span className="small muted"> {s}s</span>}</div>;
}
export function Bars({ value, of = 4, tone, small }: { value: number | null; of?: number; tone?: "g" | "b" | "r"; small?: boolean }) {
  const v = value ?? 0, t = tone || (v >= 4 ? "g" : v >= 3 ? "b" : "r");
  return (
    <span className={"bars" + (small ? " sm" : "")} role="img" aria-label={value === null ? "No rating" : `${value.toFixed(value % 1 ? 1 : 0)} of ${of}`}>
      {Array.from({ length: of }, (_, i) => <i key={i} className={i < Math.round(v) ? t : ""} />)}
    </span>
  );
}
export function Verdict({ v, size = "chip" }: { v?: string; size?: "chip" | "stamp" }) {
  if (!v) return <span className="muted">—</span>;
  return <span className={(size === "chip" ? "vchip" : "vstamp") + " v-" + verdictTone(v)}>{v}</span>;
}
export function BudgetMini({ labels = true, durations }: { labels?: boolean; durations?: number }) {
  const total = PHASES.reduce((a, p) => a + p.weight, 0);
  return (
    <div className="stack" style={{ gap: 5 }}>
      <div className="budget-mini" aria-hidden="true">{PHASES.map((p) => <span key={p.key} style={{ flex: p.weight, background: p.color }} />)}</div>
      {labels && <div className="budget-mini-l">{PHASES.map((p) => <span key={p.key} style={{ flex: p.weight }}>{durations ? `${Math.round((p.weight / total) * durations)} min` : p.label}</span>)}</div>}
    </div>
  );
}

/* ---------- toast + dialogs ---------- */
export interface ChoiceOption { id: string; label: string; kind?: "primary" | "danger" }
type Choose = (o: { title: string; body?: string; options: ChoiceOption[] }) => Promise<string | null>;
type Confirm = (o: { title: string; body?: string; ok: string; danger?: boolean }) => Promise<boolean>;
const Ctx = createContext<{ toast: (m: string) => void; confirm: Confirm; choose: Choose }>({ toast: () => {}, confirm: async () => false, choose: async () => null });
export const useUI = () => useContext(Ctx);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [dlg, setDlg] = useState<{ title: string; body?: string; options: ChoiceOption[]; resolve: (v: string | null) => void } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toast = useCallback((m: string) => { setMsg(m); clearTimeout(timer.current); timer.current = setTimeout(() => setMsg(null), 4200); }, []);
  /** A dialog with Cancel plus one or more choices. Resolves with the chosen id, or null (Cancel, Escape, click outside). */
  const choose = useCallback<Choose>((o) => new Promise((resolve) => setDlg({ ...o, resolve })), []);
  /** Yes/no confirmation, built on choose(). */
  const confirm = useCallback<Confirm>(async (o) => (await choose({ title: o.title, body: o.body, options: [{ id: "ok", label: o.ok, kind: o.danger ? "danger" : "primary" }] })) === "ok", [choose]);
  useEffect(() => { const h = (e: Event) => toast(String((e as CustomEvent).detail)); window.addEventListener("dd-toast", h); return () => window.removeEventListener("dd-toast", h); }, [toast]);
  const focusRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!dlg) return; focusRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { dlg.resolve(null); setDlg(null); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, [dlg]);
  const done = (v: string | null) => { dlg?.resolve(v); setDlg(null); };
  // Focus the primary (or danger) choice, else the last one.
  const focusIdx = dlg ? Math.max(0, dlg.options.findIndex((x) => x.kind === "primary") >= 0 ? dlg.options.findIndex((x) => x.kind === "primary") : dlg.options.length - 1) : 0;
  return (
    <Ctx.Provider value={{ toast, confirm, choose }}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
      {dlg && (
        <div className="modal-bg" onClick={(e) => { if (e.target === e.currentTarget) done(null); }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
            <h3 id="dlg-t">{dlg.title}</h3>
            {dlg.body && <p>{dlg.body}</p>}
            <div className="acts">
              <button type="button" className="btn" onClick={() => done(null)}>Cancel</button>
              {dlg.options.map((o, i) => (
                <button key={o.id} type="button" ref={i === focusIdx ? focusRef : undefined}
                  className={"btn" + (o.kind === "primary" ? " primary" : o.kind === "danger" ? " danger-solid" : "")} onClick={() => done(o.id)}>{o.label}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function fmtClock(min: number) {
  const sec = Math.max(0, Math.floor(min * 60));
  return String(Math.floor(sec / 60)).padStart(2, "0") + ":" + String(sec % 60).padStart(2, "0");
}
export function fmtDate(t: number | null | undefined, year = false) {
  if (!t) return "";
  return new Date(t).toLocaleDateString(undefined, year ? { day: "numeric", month: "short", year: "numeric" } : { month: "short", day: "2-digit" });
}

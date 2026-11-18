"use client";
import Link from "next/link";
import { useEffect } from "react";

/* Shown instead of a blank page if any screen fails to render. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="page narrow">
      <div className="card stack" style={{ gap: 12 }}>
        <h1 style={{ fontSize: 24 }}>This page couldn&apos;t be shown</h1>
        <p className="muted" style={{ margin: 0 }}>Something in the saved data didn&apos;t look the way the page expected. Your interviews are still saved on this device.</p>
        <pre className="small muted" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{String(error?.message || error)}</pre>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn primary" onClick={reset}>Try again</button>
          <Link href="/history" className="btn">Go to history</Link>
        </div>
      </div>
    </main>
  );
}

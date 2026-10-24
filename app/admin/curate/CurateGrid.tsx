"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GiphyAttribution } from "@/components/GiphyAttribution";

export type CurateRow = {
  concept_id: string;
  english_gloss: string;
  kind: string;
  emoji: string | null;
  candidates: { gif_id: string; mp4: string | null; webp: string | null; qa_score: number | null; qa_notes: string | null }[];
};

/** Keyboard: 1–5 approve, x none good (→ Noto fallback), ↑/↓ move between concepts. */
export function CurateGrid({ rows: initial, approvedCount, total }: { rows: CurateRow[]; approvedCount: number; total: number }) {
  const [rows, setRows] = useState(initial);
  const [active, setActive] = useState(0);
  const [approved, setApproved] = useState(approvedCount);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);

  const decide = useCallback(
    async (rowIndex: number, gifId: string | null) => {
      const row = rows[rowIndex];
      if (!row || busy) return;
      setBusy(true);
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concept_id: row.concept_id, gif_id: gifId }),
      });
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      if (!res.ok) return setMessage(body.error ?? "Failed");
      setMessage(`${row.concept_id}: ${gifId ? "approved" : `none good → ${body.result}`}`);
      if (gifId || body.result !== "none") setApproved((n) => n + 1);
      setRows((r) => r.filter((_, i) => i !== rowIndex));
      setActive((a) => Math.min(a, rows.length - 2));
    },
    [rows, busy],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(rows.length - 1, a + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key.toLowerCase() === "x") void decide(active, null);
      else if (/^[1-5]$/.test(e.key)) {
        const c = rows[active]?.candidates[Number(e.key) - 1];
        if (c) void decide(active, c.gif_id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, active, decide]);

  useEffect(() => {
    rowRefs.current[active]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [active]);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <header className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-white/90 px-4 py-3 backdrop-blur">
        <div>
          <h1 className="text-xl font-semibold">GIF curation</h1>
          <p className="text-sm text-ink-2">
            <kbd className="rounded bg-canvas px-1">1</kbd>–<kbd className="rounded bg-canvas px-1">5</kbd> approve ·{" "}
            <kbd className="rounded bg-canvas px-1">x</kbd> none good · <kbd className="rounded bg-canvas px-1">↑</kbd>
            <kbd className="rounded bg-canvas px-1">↓</kbd> move
          </p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{approved} / {total} approved</div>
          <div className="mt-1 h-1.5 w-48 overflow-hidden rounded bg-line">
            <i className="block h-full bg-green" style={{ width: `${total ? (approved / total) * 100 : 0}%` }} />
          </div>
          {message && <p className="mt-1 text-xs text-ink-2">{message}</p>}
        </div>
      </header>

      {rows.length === 0 && (
        <p className="mt-16 text-center text-ink-2">Nothing to review. Run scripts 03 and 04 to fetch and screen candidates.</p>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((row, i) => (
          <section
            key={row.concept_id}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            onClick={() => setActive(i)}
            className={`rounded-lg p-3 transition ${i === active ? "bg-blue-tint ring-2 ring-blue" : "bg-canvas"}`}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                <span aria-hidden="true">{row.emoji} </span>
                {row.english_gloss} <span className="text-xs font-normal text-ink-3">{row.concept_id} · {row.kind}</span>
              </h2>
              <button type="button" onClick={() => void decide(i, null)} className="rounded-full bg-surface px-3 py-1 text-sm shadow-soft">
                x · none good
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {row.candidates.map((c, n) => (
                <button
                  key={c.gif_id}
                  type="button"
                  onClick={() => void decide(i, c.gif_id)}
                  title={c.qa_notes ?? undefined}
                  className="group relative aspect-square overflow-hidden rounded-md bg-surface"
                >
                  {i === active || Math.abs(i - active) < 3 ? (
                    c.mp4 ? (
                      <video src={c.mp4} autoPlay loop muted playsInline className="h-full w-full object-contain" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.webp ?? ""} alt="" className="h-full w-full object-contain" />
                    )
                  ) : null}
                  <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-ink text-xs font-semibold text-white">{n + 1}</span>
                  {c.qa_score != null && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-1.5 text-xs">★ {c.qa_score}</span>
                  )}
                </button>
              ))}
            </div>
            <GiphyAttribution className="mt-1 block text-right" />
          </section>
        ))}
      </div>
    </main>
  );
}

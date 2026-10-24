"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { load, save } from "@/lib/client/storage";
import { getLanguage, languageName } from "@/lib/languages";
import type { LookupResponse, SentenceResponse } from "@/lib/schemas";
import { AlternativeChips, type Alternative } from "./AlternativeChips";
import { AudioButton } from "./AudioButton";
import { CharacterPalette } from "./CharacterPalette";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Arrow, Back, Cards, Info, Star } from "./Icons";
import { LanguagePicker } from "./LanguagePicker";
import { Logo } from "./Logo";
import { PracticeMode, type PracticeItem } from "./PracticeMode";
import { RatingRow, type Rating } from "./RatingRow";
import { EmptyWordCard, WordCard, WordCardSkeleton } from "./WordCard";
import { WordInUse } from "./WordInUse";
import { SentenceCard } from "./SentenceCard";
import { isSentence } from "@/lib/sentence-detect";

type Pair = { from: string; to: string };
type HistoryItem = PracticeItem & { key: string; text: string; from: string; to: string; rating: Rating | null; ts: number };
type Stats = { day: string; today: number; total: number; seenToday: string[] };
type Result = { ok: true; data: LookupResponse } | { ok: false; error: string };

const DAILY_GOAL = 20;
const today = () => new Date().toISOString().slice(0, 10);

// Client-side cache, also used to preload the next likely word.
const lookupCache = new Map<string, Promise<Result>>();
function fetchLookup(text: string, pair: Pair, conceptId?: string): Promise<Result> {
  const key = `${pair.from}|${pair.to}|${text.trim().toLowerCase()}|${conceptId ?? ""}`;
  const hit = lookupCache.get(key);
  if (hit) return hit;
  const p: Promise<Result> = fetch("/api/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source_lang: pair.from, target_lang: pair.to, ...(conceptId ? { concept_id: conceptId } : {}) }),
  })
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      return r.ok ? ({ ok: true, data: body } as Result) : ({ ok: false, error: body.error ?? "Something went wrong." } as Result);
    })
    .catch(() => ({ ok: false, error: "You seem to be offline. Check your connection." }) as Result)
    .then((res) => {
      if (!res.ok) lookupCache.delete(key);
      return res;
    });
  lookupCache.set(key, p);
  return p;
}

const sentenceCache = new Map<string, Promise<{ ok: true; data: SentenceResponse } | { ok: false; error: string }>>();
function fetchSentence(text: string, pair: Pair) {
  const key = `${pair.from}|${pair.to}|${text.trim().toLowerCase()}`;
  const hit = sentenceCache.get(key);
  if (hit) return hit;
  const p = fetch("/api/sentence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source_lang: pair.from, target_lang: pair.to }),
  })
    .then(async (r) => {
      const body = await r.json().catch(() => ({}));
      return r.ok ? ({ ok: true, data: body } as const) : ({ ok: false, error: body.error ?? "Something went wrong." } as const);
    })
    .catch(() => ({ ok: false, error: "You seem to be offline. Check your connection." }) as const)
    .then((res) => {
      if (!res.ok) sentenceCache.delete(key);
      return res;
    });
  sentenceCache.set(key, p);
  return p;
}

function preloadVisual(data: LookupResponse) {
  for (const v of data.visuals) {
    if (v.webp) new Image().src = v.webp;
    else if (v.mp4) {
      const video = document.createElement("video");
      video.preload = "auto";
      video.muted = true;
      video.src = v.mp4;
    }
  }
}

export function TranslateApp() {
  const [pair, setPair] = useState<Pair>({ from: "eng", to: "spa" });
  const [text, setText] = useState("");
  const [view, setView] = useState<"input" | "output">("input");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [sentence, setSentence] = useState<SentenceResponse | null>(null);
  const [mode, setMode] = useState<"word" | "sentence">("word");
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [stats, setStats] = useState<Stats>({ day: today(), today: 0, total: 0, seenToday: [] });
  const [slow, setSlow] = useState(false);
  const [autoPlayKey, setAutoPlayKey] = useState<string | null>(null);
  const [practice, setPractice] = useState(false);
  const [shake, setShake] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  // Restore saved preferences after mount (localStorage is per browser, so it can't be read during SSR).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const savedPair = load<Pair | null>("pair", null);
    if (savedPair && getLanguage(savedPair.from) && getLanguage(savedPair.to) && savedPair.from !== savedPair.to) setPair(savedPair);
    setHistory(load<HistoryItem[]>("history", []));
    const s = load<Stats | null>("stats", null);
    if (s) setStats(s.day === today() ? s : { ...s, day: today(), today: 0, seenToday: [] });
    setSlow(load<boolean>("slow", false));
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const changePair = (p: Pair) => {
    setPair(p);
    save("pair", p);
  };

  const fromLang = getLanguage(pair.from)!;
  const record = useCallback((data: LookupResponse, p: Pair) => {
    const key = `${p.from}:${p.to}:${data.concept_id}`;
    setHistory((h) => {
      const prev = h.find((x) => x.key === key);
      const item: HistoryItem = {
        key, text: data.source.text, from: p.from, to: p.to, concept_id: data.concept_id, form: data.target.form,
        gloss: data.english_gloss, emoji: data.emoji, visual: data.visuals[0] ?? null, rating: prev?.rating ?? null, ts: Date.now(),
      };
      const next = [item, ...h.filter((x) => x.key !== key)].slice(0, 40);
      save("history", next);
      return next;
    });
    setStats((s) => {
      const base = s.day === today() ? s : { ...s, day: today(), today: 0, seenToday: [] };
      if (base.seenToday.includes(key)) return base;
      const next = { ...base, today: base.today + 1, total: base.total + 1, seenToday: [...base.seenToday, key] };
      save("stats", next);
      return next;
    });
  }, []);

  const show = useCallback(
    async (
      word: string,
      opts: { conceptId?: string; pickedFrom?: { primary: Alternative; alts: Alternative[] }; pairOverride?: Pair } = {},
    ) => {
      const p = opts.pairOverride ?? pair;
      const clean = word.trim();
      if (!clean) {
        setShake((n) => n + 1);
        inputRef.current?.focus();
        return;
      }
      const id = ++requestId.current;
      setView("output");
      setStatus("loading");
      setError(null);

      if (!opts.conceptId && isSentence(clean, getLanguage(p.from)?.ime)) {
        const sres = await fetchSentence(clean, p);
        if (id !== requestId.current) return;
        if (!sres.ok) {
          setStatus("error");
          setError(sres.error);
          return;
        }
        setSentence(sres.data);
        setMode("sentence");
        setStatus("done");
        return;
      }

      const res = await fetchLookup(clean, p, opts.conceptId);
      if (id !== requestId.current) return; // a newer request won
      if (!res.ok) {
        setStatus("error");
        setError(res.error);
        return;
      }
      const data = res.data;
      setResult(data);
      setMode("word");
      setStatus("done");
      if (opts.pickedFrom) {
        setAlternatives([opts.pickedFrom.primary, ...opts.pickedFrom.alts].filter((a) => a.concept_id !== data.concept_id));
      } else {
        setAlternatives(data.alternatives);
      }
      record(data, p);
      // The learner just tapped, so autoplay is allowed by the browser.
      if (data.audio.available) setAutoPlayKey(`${data.concept_id}:${data.target_lang}:${Date.now()}`);

      // Preload the next likely word: the next starter word not seen yet.
      const seen = new Set(load<HistoryItem[]>("history", []).filter((h) => h.from === p.from).map((h) => h.text.toLowerCase()));
      const next = getLanguage(p.from)?.tryWords.find((w) => w.word.toLowerCase() !== clean.toLowerCase() && !seen.has(w.word.toLowerCase()));
      if (next) void fetchLookup(next.word, p).then((r) => r.ok && preloadVisual(r.data));
    },
    [pair, record],
  );

  const pickAlternative = (a: Alternative) => {
    if (!result) return;
    const primary: Alternative = { concept_id: result.concept_id, english_gloss: result.english_gloss, emoji: result.emoji };
    void show(result.source.text, {
      conceptId: a.concept_id,
      pickedFrom: { primary, alts: alternatives.filter((x) => x.concept_id !== a.concept_id) },
    });
  };

  const rate = (r: Rating) => {
    if (!result) return;
    const key = `${result.source.lang}:${result.target_lang}:${result.concept_id}`;
    setHistory((h) => {
      const next = h.map((x) => (x.key === key ? { ...x, rating: r } : x));
      save("history", next);
      return next;
    });
  };

  const toggleSlow = () => {
    setSlow((s) => {
      save("slow", !s);
      return !s;
    });
  };

  const shown = mode === "sentence" ? sentence : result;
  const sentenceMode = isSentence(text, fromLang.ime);
  const currentRating = result
    ? history.find((x) => x.key === `${result.source.lang}:${result.target_lang}:${result.concept_id}`)?.rating ?? null
    : null;
  const recent = history.slice(0, 5);
  const practiceItems = useMemo(() => {
    const seen = new Set<string>();
    return history.filter((h) => h.to === pair.to && !seen.has(h.concept_id) && seen.add(h.concept_id));
  }, [history, pair.to]);
  const level = Math.floor(stats.total / 10) + 1;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[920px] flex-col px-0 sm:px-4 lg:py-8">
      <div className="grid flex-1 gap-8 lg:grid-cols-2">
        {/* ================= INPUT ================= */}
        <section className={`${view === "output" ? "hidden lg:flex" : "flex"} min-h-dvh flex-col lg:min-h-0`} aria-label="Translate">
          <header className="grid grid-cols-[40px_1fr_40px] items-center px-[18px] pb-3 pt-4">
            <span />
            <h1 className="flex justify-center">
              <Logo />
              <span className="sr-only"> · Translate</span>
            </h1>
            <AboutBubble />
          </header>

          <div className="no-scrollbar mx-2.5 flex-1 rounded-t-xl bg-canvas px-4 pb-7 pt-[18px] lg:rounded-b-xl">
            <div className="flex items-center justify-between px-1.5 text-sm text-ink-2">
              <span className="inline-flex items-center gap-1.5"><Star /> Level {level}</span>
              <span>{stats.today} {stats.today === 1 ? "word" : "words"} today</span>
            </div>
            <div className="mx-1.5 mb-[18px] mt-2.5 h-[5px] overflow-hidden rounded-[3px] bg-line" role="progressbar" aria-label="Daily goal" aria-valuenow={Math.min(stats.today, DAILY_GOAL)} aria-valuemax={DAILY_GOAL}>
              <motion.i
                className="block h-full rounded-[3px] bg-green"
                initial={false}
                animate={{ width: `${Math.min(100, (stats.today / DAILY_GOAL) * 100)}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 20 }}
              />
            </div>

            <LanguagePicker from={pair.from} to={pair.to} onChange={changePair} />

            <motion.form
              key={shake}
              animate={shake ? { x: [0, -8, 8, -5, 5, 0] } : {}}
              transition={{ duration: 0.35 }}
              onSubmit={(e) => {
                e.preventDefault();
                void show(text);
              }}
              className="relative mt-4 rounded-xl bg-blue p-[18px] text-white shadow-card"
            >
              <label htmlFor="wordInput" className="flex items-center justify-between gap-2 text-sm">
                <span className="opacity-85">Type a word or sentence in {fromLang.name}</span>
                {sentenceMode && (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">Sentence</span>
                )}
              </label>
              <input
                ref={inputRef}
                id="wordInput"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, 120))}
                placeholder={fromLang.tryWords[0]?.word ?? "water"}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                maxLength={120}
                lang={fromLang.code === "eng" ? "en" : undefined}
                className={`mt-1.5 w-full bg-transparent font-bold text-white caret-white outline-none transition-[font-size] placeholder:text-white/50 ${sentenceMode ? "text-xl" : "text-[30px]"}`}
              />
              {/* Mic button (speech input) is hidden until milestone M6. */}
              {!fromLang.ime && (
                <CharacterPalette chars={fromLang.palette} inputRef={inputRef} value={text} onChange={setText} />
              )}
            </motion.form>

            <h2 className="mx-1 mb-2.5 mt-5 text-[15px] font-semibold">Try one</h2>
            <div className="flex flex-wrap gap-2">
              {fromLang.tryWords.map((w) => (
                <motion.button
                  key={w.word}
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  whileHover={{ y: -2 }}
                  onClick={() => {
                    setText(w.word);
                    void show(w.word);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[15px] shadow-soft"
                >
                  <span aria-hidden="true">{w.emoji}</span> {w.word}
                </motion.button>
              ))}
            </div>

            <motion.button
              type="button"
              whileTap={{ y: 1, scale: 0.99 }}
              onClick={() => void show(text)}
              className="mt-[22px] flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-ink text-[17px] font-semibold text-white"
            >
              Show me <Arrow />
            </motion.button>

            {recent.length > 0 && (
              <>
                <div className="mx-1 mb-2.5 mt-5 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">Recent</h2>
                  <button
                    type="button"
                    onClick={() => setPractice(true)}
                    disabled={practiceItems.length < 3}
                    title={practiceItems.length < 3 ? `Look up ${3 - practiceItems.length} more ${languageName(pair.to)} words to practise` : undefined}
                    className="inline-flex items-center gap-1.5 rounded-full bg-blue-tint px-3 py-1.5 text-sm font-semibold text-blue disabled:opacity-50"
                  >
                    <Cards size={15} /> Practice
                  </button>
                </div>
                <ul className="flex flex-col gap-2">
                  {recent.map((h) => (
                    <li key={h.key} className="grid grid-cols-[36px_1fr_auto] items-center gap-2.5 rounded-md bg-surface px-3 py-2.5">
                      <span className="text-center text-2xl" aria-hidden="true">{h.emoji ?? "✨"}</span>
                      <button
                        type="button"
                        className="min-w-0 text-left"
                        onClick={() => {
                          const p = { from: h.from, to: h.to };
                          changePair(p);
                          setText(h.text);
                          void show(h.text, { pairOverride: p });
                        }}
                      >
                        <b className="block truncate font-semibold">{h.form}</b>
                        <small className="block truncate text-[13px] text-ink-2">
                          {h.gloss} · {languageName(h.to)}
                        </small>
                      </button>
                      <AudioButton
                        variant="mini"
                        clip={null}
                        request={{ concept_id: h.concept_id, lang: h.to, kind: "word" }}
                        slow={slow}
                        label={`Play ${h.form}`}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}

            <footer className="mt-8 text-center text-xs text-ink-3">
              Visuals: GIPHY and Noto Emoji · Voice: Gemini TTS (synthetic) ·{" "}
              <Link href="/about" className="underline underline-offset-2">About</Link>
            </footer>
          </div>
        </section>

        {/* ================= OUTPUT ================= */}
        <section className={`${view === "input" ? "hidden lg:flex" : "flex"} min-h-dvh flex-col lg:min-h-0`} aria-label="Your word" aria-live="polite">
          <header className="grid grid-cols-[40px_1fr_40px] items-center px-[18px] pb-3 pt-4">
            <button type="button" onClick={() => setView("input")} className="grid h-9 w-9 place-items-center rounded-full lg:invisible" aria-label="Back">
              <Back />
            </button>
            <h2 className="text-center text-xl font-semibold">{mode === "sentence" && status === "done" ? "Your sentence" : "Your word"}</h2>
            <AboutBubble />
          </header>

          <div className="no-scrollbar mx-2.5 flex-1 rounded-t-xl bg-canvas px-4 pb-7 pt-[18px] lg:rounded-b-xl">
            <div className="mb-3.5 flex items-center justify-center gap-2 text-sm text-ink-2">
              <b className="font-semibold text-ink">{languageName(shown && status === "done" ? shown.source.lang : pair.from)}</b>
              <Arrow size={14} />
              <b className="font-semibold text-ink">{languageName(shown && status === "done" ? shown.target_lang : pair.to)}</b>
            </div>

            <AnimatePresence mode="wait">
              {status === "loading" ? (
                <motion.div key="loading" exit={{ opacity: 0 }}>
                  <WordCardSkeleton />
                </motion.div>
              ) : status === "error" ? (
                <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                  <div className="mt-7 rounded-xl bg-surface p-6 text-center shadow-soft">
                    <div className="text-5xl" aria-hidden="true">🙈</div>
                    <p className="mt-3 text-lg font-semibold">Oops, that one slipped away</p>
                    <p className="mt-1 text-ink-2">{error}</p>
                    <button type="button" onClick={() => void show(text || result?.source.text || "")} className="mt-4 rounded-full bg-blue px-5 py-2.5 font-semibold text-white">
                      Try again
                    </button>
                  </div>
                </motion.div>
              ) : mode === "sentence" && sentence ? (
                <motion.div key={`sentence-${sentence.source.text}-${sentence.target_lang}`}>
                  <SentenceCard data={sentence} />
                </motion.div>
              ) : result ? (
                <motion.div key={`card-${result.concept_id}-${result.target_lang}`}>
                  <WordCard data={result} slow={slow} autoPlayKey={autoPlayKey} />

                  <div className="mx-1 mt-4 flex flex-wrap items-center gap-2">
                    <ConfidenceBadge confidence={result.confidence} />
                    {result.audio.available ? (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-tint px-2.5 py-1.5 text-[12.5px] text-amber-ink">
                          <Info /> Synthetic voice
                        </span>
                        <button
                          type="button"
                          onClick={toggleSlow}
                          aria-pressed={slow}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12.5px] transition ${slow ? "bg-blue text-white" : "bg-surface text-ink-2 shadow-soft"}`}
                        >
                          <span aria-hidden="true">🐢</span> 0.75×
                        </button>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-2 shadow-soft">
                        <Info /> No audio yet for {languageName(result.target_lang)}
                      </span>
                    )}
                    {result.offline && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1.5 text-[12.5px] text-ink-2 shadow-soft">
                        📦 Saved demo answer
                      </span>
                    )}
                  </div>

                  <WordInUse key={`${result.concept_id}:${result.target_lang}`} data={result} slow={slow} />
                  <AlternativeChips items={alternatives} onPick={pickAlternative} />
                  <RatingRow value={currentRating} onChange={rate} />
                </motion.div>
              ) : (
                <motion.div key="empty">
                  <EmptyWordCard />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {practice && <PracticeMode items={practiceItems} lang={pair.to} onClose={() => setPractice(false)} />}
      </AnimatePresence>
    </div>
  );
}

function AboutBubble() {
  return (
    <Link
      href="/about"
      aria-label="About and credits"
      className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-soft to-blue text-sm font-semibold text-white"
    >
      <span aria-hidden="true">👋</span>
    </Link>
  );
}

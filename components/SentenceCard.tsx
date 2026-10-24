"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { languageName } from "@/lib/languages";
import type { SentenceResponse, WordVisual } from "@/lib/schemas";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { WordDeck, type DeckWord } from "./WordDeck";

const LANG_TAG: Record<string, string> = { eng: "en", spa: "es", fra: "fr", deu: "de", ita: "it", por: "pt", jpn: "ja", kor: "ko", cmn: "zh" };

// Pictures per sentence, so flipping back to a sentence doesn't refetch.
const visualsCache = new Map<string, Promise<WordVisual[] | null>>();
function fetchVisuals(words: string[]): Promise<WordVisual[] | null> {
  const key = words.join("|").toLowerCase();
  let p = visualsCache.get(key);
  if (!p) {
    p = fetch("/api/visuals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ words }) })
      .then((r) => (r.ok ? (r.json() as Promise<WordVisual[]>) : null))
      .catch(() => null);
    visualsCache.set(key, p);
  }
  return p;
}

/** Underline the deck's current word where it appears in the sentence. */
function Highlighted({ text, word }: { text: string; word: string | null }) {
  const i = word ? text.toLowerCase().indexOf(word.toLowerCase()) : -1;
  if (!word || i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <motion.span
        key={word}
        initial={{ backgroundColor: "rgba(255,255,255,0.35)" }}
        animate={{ backgroundColor: "rgba(255,255,255,0)" }}
        transition={{ duration: 0.8 }}
        className="rounded-md underline decoration-white/70 decoration-[3px] underline-offset-[6px]"
      >
        {text.slice(i, i + word.length)}
      </motion.span>
      {text.slice(i + word.length)}
    </>
  );
}

/** A whole sentence on the blue card, with an animated deck of its key words below. */
export function SentenceCard({ data }: { data: SentenceResponse }) {
  const reduce = useReducedMotion();
  const words = data.key_words;
  const [visuals, setVisuals] = useState<WordVisual[] | null>(null);
  const [loading, setLoading] = useState(words.length > 0);
  const [current, setCurrent] = useState(0);
  const onIndexChange = useCallback((i: number) => setCurrent(i), []);

  useEffect(() => {
    if (!words.length) return;
    let alive = true;
    fetchVisuals(words.map((k) => k.english)).then((v) => {
      if (!alive) return;
      setVisuals(v);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [words]);

  const deck: DeckWord[] = words.map((k, i) => ({
    target: k.target,
    romanization: k.romanization ?? null,
    english: k.english,
    visual: visuals?.[i]?.visual ?? null,
    emoji: visuals?.[i]?.emoji ?? null,
  }));

  return (
    <div>
      <div className="relative mx-1 mt-7">
        <div aria-hidden="true" className="absolute inset-0 translate-x-[10px] -translate-y-[14px] rotate-[4deg] rounded-xl bg-blue-mist" />
        <div aria-hidden="true" className="absolute inset-0 translate-x-[5px] -translate-y-[7px] rotate-[2deg] rounded-xl bg-blue-soft" />
        <motion.article
          initial={reduce ? false : { rotate: -3, scale: 0.9, y: 18, opacity: 0.3 }}
          animate={{ rotate: -3, scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 15, mass: 0.9 }}
          className="relative flex min-h-[220px] flex-col rounded-xl bg-blue px-5 pb-5 pt-4 text-white shadow-card"
          aria-label={`Sentence in ${languageName(data.target_lang)}: ${data.translation}`}
        >
          <span className="text-sm opacity-85">
            {languageName(data.source.lang)} · <b className="font-semibold">{data.source.text}</b>
          </span>
          <div className="flex flex-1 flex-col justify-center py-4 text-center">
            <motion.p
              lang={LANG_TAG[data.target_lang]}
              initial={reduce ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="break-words text-[clamp(24px,7vw,32px)] font-bold leading-[1.3]"
            >
              <Highlighted text={data.translation} word={words[current]?.target ?? null} />
            </motion.p>
            {data.romanization && <p className="mt-2 text-base italic opacity-85">{data.romanization}</p>}
          </div>
          {data.target_lang !== "eng" && <p className="text-center text-[15px] font-medium opacity-95">{data.english}</p>}
        </motion.article>
      </div>

      {data.confidence !== "high" && (
        <div className="mx-1 mt-4">
          <ConfidenceBadge confidence={data.confidence} />
        </div>
      )}

      <WordDeck words={deck} loading={loading} lang={LANG_TAG[data.target_lang]} onIndexChange={onIndexChange} />
    </div>
  );
}

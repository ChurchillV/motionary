"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { Visual } from "@/lib/schemas";
import { languageName } from "@/lib/languages";
import { GifPlayer } from "./GifPlayer";
import { Close } from "./Icons";

export type PracticeItem = { concept_id: string; form: string; gloss: string; emoji: string | null; visual: Visual | null };

function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Quick quiz over words seen this session: look at the GIF, pick the word. */
export function PracticeMode({ items, lang, onClose }: { items: PracticeItem[]; lang: string; onClose: () => void }) {
  const deck = useMemo(() => shuffle(items).slice(0, 10), [items]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const card = deck[index];
  const options = useMemo(() => {
    if (!card) return [];
    const others = shuffle(items.filter((i) => i.concept_id !== card.concept_id)).slice(0, 3);
    return shuffle([card, ...others]);
  }, [card, items]);

  const done = index >= deck.length;

  const choose = (concept: string) => {
    if (picked) return;
    setPicked(concept);
    if (concept === card.concept_id) setScore((s) => s + 1);
    setTimeout(() => {
      setPicked(null);
      setIndex((i) => i + 1);
    }, 1100);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-label="Practice"
    >
      <motion.div
        initial={{ y: 40, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 300, damping: 24 }}
        className="w-full max-w-[400px] rounded-xl bg-canvas p-4 shadow-card"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Practice · {languageName(lang)}</h2>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-surface shadow-soft" aria-label="Close practice">
            <Close />
          </button>
        </div>

        {done ? (
          <div className="py-10 text-center">
            <div className="text-6xl" aria-hidden="true">{score === deck.length ? "🏆" : score >= deck.length / 2 ? "🎉" : "💪"}</div>
            <p className="mt-3 text-2xl font-semibold">{score} / {deck.length}</p>
            <p className="mt-1 text-ink-2">{score === deck.length ? "Perfect round!" : "Nice work. Keep looping!"}</p>
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setScore(0);
              }}
              className="mt-6 h-12 w-full rounded-[18px] bg-ink font-semibold text-white"
            >
              Go again
            </button>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div key={index} initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -40, opacity: 0 }}>
              <p className="mt-2 text-sm text-ink-2">
                {index + 1} of {deck.length} · Which word is this?
              </p>
              <div className="mt-3 grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-[18px] bg-surface">
                {card.visual ? (
                  <GifPlayer visual={card.visual} alt="Guess the word" emoji={card.emoji} />
                ) : (
                  <span className="text-7xl" aria-hidden="true">{card.emoji ?? "❓"}</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {options.map((o) => {
                  const right = picked && o.concept_id === card.concept_id;
                  const wrong = picked === o.concept_id && o.concept_id !== card.concept_id;
                  return (
                    <motion.button
                      key={o.concept_id}
                      type="button"
                      onClick={() => choose(o.concept_id)}
                      animate={wrong ? { x: [0, -6, 6, -4, 0] } : right ? { scale: [1, 1.06, 1] } : {}}
                      className={`min-h-14 rounded-md px-3 py-2 text-lg font-semibold shadow-soft transition ${
                        right ? "bg-green text-white" : wrong ? "bg-amber-tint text-amber-ink" : "bg-surface"
                      }`}
                    >
                      {o.form}
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </motion.div>
    </motion.div>
  );
}

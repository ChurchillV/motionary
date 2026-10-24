"use client";

import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { useEffect, useState } from "react";
import type { Visual } from "@/lib/schemas";
import { EmojiFallback } from "./EmojiFallback";
import { GifPlayer } from "./GifPlayer";
import { GiphyAttribution } from "./GiphyAttribution";
import { Arrow } from "./Icons";

export type DeckWord = {
  target: string;
  romanization?: string | null;
  english: string;
  visual: Visual | null;
  emoji: string | null;
};

const SWIPE = 70;

/**
 * A stacked deck of word cards. Swipe, tap the arrows, or use ←/→ to flip
 * through. The top card flies off in the swipe direction and the next one
 * rises from the stack.
 */
export function WordDeck({
  words,
  loading,
  lang,
  onIndexChange,
}: {
  words: DeckWord[];
  loading: boolean;
  lang?: string;
  onIndexChange?: (i: number) => void;
}) {
  const reduce = useReducedMotion();
  const [[index, dir], setState] = useState<[number, number]>([0, 0]);
  const count = words.length;

  const go = (step: number) => {
    if (count < 2) return;
    setState(([i]) => [(i + step + count) % count, step]);
  };

  useEffect(() => onIndexChange?.(index), [index, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!count) return null;
  const word = words[index];

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE || info.velocity.x < -500) go(1);
    else if (info.offset.x > SWIPE || info.velocity.x > 500) go(-1);
  };

  return (
    <section className="mt-6" aria-roledescription="carousel" aria-label="Words in this sentence">
      <div className="mx-1 mb-2 flex items-center justify-between">
        <small className="text-[13px] text-ink-2">Words in this sentence</small>
        <small className="text-[13px] font-semibold text-ink-2" aria-live="polite">
          {index + 1} / {count}
        </small>
      </div>

      <div className="relative mx-auto h-[300px] max-w-[340px]">
        {/* Peeking cards behind, so it reads as a deck. */}
        {count > 2 && <div aria-hidden="true" className="absolute inset-x-4 bottom-0 top-3 translate-y-3 rotate-[3deg] rounded-xl bg-blue-mist" />}
        {count > 1 && <div aria-hidden="true" className="absolute inset-x-2 bottom-0 top-1.5 translate-y-1.5 -rotate-[2deg] rounded-xl bg-blue-soft" />}

        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.article
            key={index}
            custom={dir}
            variants={{
              enter: (d: number) => (reduce ? { opacity: 0 } : { x: d * 60, y: 24, scale: 0.92, rotate: d * 4, opacity: 0 }),
              center: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 },
              exit: (d: number) => (reduce ? { opacity: 0 } : { x: d * -320, rotate: d * -18, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            drag={count > 1 ? "x" : false}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.7}
            onDragEnd={onDragEnd}
            whileDrag={{ rotate: 0, scale: 1.02 }}
            className="absolute inset-0 flex cursor-grab touch-pan-y flex-col items-center rounded-xl bg-surface p-3 shadow-card active:cursor-grabbing"
            aria-label={`${word.target}: ${word.english}`}
          >
            <div className="relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-[16px] bg-blue-tint">
              {loading ? (
                <span className="h-full w-full animate-shimmer bg-blue-mist/60" />
              ) : word.visual ? (
                <GifPlayer visual={word.visual} alt={word.english} emoji={word.emoji} />
              ) : word.emoji ? (
                <EmojiFallback emoji={word.emoji} label={word.english} size={72} />
              ) : (
                <span className="text-5xl" aria-hidden="true">✨</span>
              )}
              {word.visual?.provider === "giphy" && <GiphyAttribution className="absolute bottom-1.5 right-2" />}
            </div>
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <div lang={lang} className="text-[clamp(26px,8vw,32px)] font-bold leading-tight text-blue">
                {word.target}
              </div>
              {word.romanization && <div className="text-[15px] italic text-ink-2">{word.romanization}</div>}
              <div className="mt-0.5 text-[15px] font-medium text-ink-2">{word.english}</div>
            </div>
          </motion.article>
        </AnimatePresence>
      </div>

      {count > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => go(-1)}
            aria-label="Previous word"
            className="grid h-10 w-10 place-items-center rounded-full bg-surface shadow-soft"
          >
            <Arrow className="rotate-180" />
          </motion.button>
          <div className="flex gap-1.5" role="tablist">
            {words.map((w, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={w.english}
                onClick={() => setState(([cur]) => [i, i > cur ? 1 : -1])}
                className={`h-2 rounded-full transition-all ${i === index ? "w-6 bg-blue" : "w-2 bg-blue-mist"}`}
              />
            ))}
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={() => go(1)}
            aria-label="Next word"
            className="grid h-10 w-10 place-items-center rounded-full bg-blue text-white shadow-card"
          >
            <Arrow />
          </motion.button>
        </div>
      )}
    </section>
  );
}

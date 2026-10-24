"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { languageName } from "@/lib/languages";
import type { LookupResponse } from "@/lib/schemas";
import { AudioButton } from "./AudioButton";
import { EmojiFallback } from "./EmojiFallback";
import { GifPlayer } from "./GifPlayer";
import { GiphyAttribution } from "./GiphyAttribution";

/** Source word on top, the GIF in the middle, the target word below. */
export function WordCard({ data, slow, autoPlayKey }: { data: LookupResponse; slow: boolean; autoPlayKey: string | null }) {
  const reduce = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const hasGiphy = data.visuals.some((v) => v.provider === "giphy");
  const combo = data.visuals.length > 1;
  const showAudio = data.audio.available;
  const alt = data.english_gloss;

  return (
    <div className="relative mx-1 mt-7">
      <div aria-hidden="true" className="absolute inset-0 translate-x-[10px] -translate-y-[14px] rotate-[4deg] rounded-xl bg-blue-mist" />
      <div aria-hidden="true" className="absolute inset-0 translate-x-[5px] -translate-y-[7px] rotate-[2deg] rounded-xl bg-blue-soft" />
      <motion.article
        key={`${data.concept_id}:${data.target_lang}:${data.source.text}`}
        initial={reduce ? false : { rotate: -3, scale: 0.9, y: 18, opacity: 0.3 }}
        animate={{ rotate: -3, scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 320, damping: 15, mass: 0.9 }}
        className="relative flex min-h-[380px] flex-col items-center rounded-xl bg-blue px-4 pb-[18px] pt-4 text-white shadow-card"
        aria-label={`${data.source.text} in ${languageName(data.target_lang)}: ${data.target.form}`}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm opacity-85">
            {languageName(data.source.lang)} · <b className="font-semibold">{data.source.text}</b>
          </span>
          {showAudio && (
            <AudioButton
              key={`${data.concept_id}:${data.target_lang}:word`}
              variant="sound"
              clip={data.audio.word}
              request={{ concept_id: data.concept_id, lang: data.target_lang, kind: "word" }}
              slow={slow}
              label={`Play pronunciation of ${data.target.form}`}
              autoPlayKey={autoPlayKey}
              onPlayingChange={setPlaying}
            />
          )}
        </div>

        {data.visuals.length > 0 ? (
          <div className="relative mt-2.5 grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-[18px] bg-white/95">
            <div className={`grid h-full w-full ${combo ? "grid-cols-2 gap-1 p-1" : ""}`}>
              {data.visuals.map((v, i) => (
                <motion.div
                  key={i}
                  initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.12 + i * 0.12 }}
                  className="flex h-full w-full items-center justify-center overflow-hidden rounded-[14px]"
                >
                  <GifPlayer visual={v} alt={combo ? `${alt} (${v.role})` : alt} emoji={data.emoji} small={combo} />
                </motion.div>
              ))}
            </div>
            {hasGiphy && <GiphyAttribution className="absolute bottom-1.5 right-2" />}
          </div>
        ) : data.emoji ? (
          <div className="mt-2.5 grid aspect-[16/10] w-full place-items-center rounded-[18px] bg-white/95">
            <EmojiFallback emoji={data.emoji} label={alt} />
          </div>
        ) : null}

        <motion.div
          initial={reduce ? false : { y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-3.5 flex w-full flex-col items-center text-center"
        >
          <div lang={langTag(data.target_lang)} className="break-words text-[clamp(28px,9vw,38px)] font-bold leading-[1.05]">
            {data.target.form}
          </div>
          {data.target.romanization && (
            <div className="mt-1 text-base italic opacity-85">{data.target.romanization}</div>
          )}
          {data.target.ipa && (
            <div className={`mt-1.5 tracking-[.03em] opacity-80 ${showAudio ? "text-lg" : "text-[22px] font-medium opacity-95"}`}>
              /{data.target.ipa}/
            </div>
          )}
          <div className={`mt-2 h-[18px] items-center gap-[3px] ${playing ? "flex" : "hidden"}`} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <i key={i} className="block w-[3px] animate-bar rounded-sm bg-white" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        </motion.div>
        <div className="mt-auto pt-3 text-center text-[15px] font-medium opacity-95">{data.english_gloss}</div>
      </motion.article>
    </div>
  );
}

function langTag(code: string) {
  return ({ eng: "en", spa: "es", fra: "fr", deu: "de", ita: "it", por: "pt", jpn: "ja", kor: "ko", cmn: "zh" } as Record<string, string>)[code];
}

export function WordCardSkeleton() {
  return (
    <div className="relative mx-1 mt-7" aria-busy="true" aria-label="Loading your word">
      <div aria-hidden="true" className="absolute inset-0 translate-x-[10px] -translate-y-[14px] rotate-[4deg] rounded-xl bg-blue-mist" />
      <div aria-hidden="true" className="absolute inset-0 translate-x-[5px] -translate-y-[7px] rotate-[2deg] rounded-xl bg-blue-soft" />
      <div className="relative flex min-h-[380px] -rotate-3 flex-col items-center rounded-xl bg-blue px-4 pb-[18px] pt-4 shadow-card">
        <div className="flex w-full items-center justify-between">
          <span className="h-3.5 w-28 animate-shimmer rounded-full bg-white/30" />
          <span className="h-[38px] w-[38px] animate-shimmer rounded-full bg-white/20" />
        </div>
        <div className="mt-2.5 grid aspect-[16/10] w-full animate-shimmer place-items-center rounded-[18px] bg-white/80">
          <span className="text-5xl opacity-60" aria-hidden="true">✨</span>
        </div>
        <span className="mt-4 h-9 w-40 animate-shimmer rounded-xl bg-white/35" />
        <span className="mt-2.5 h-4 w-24 animate-shimmer rounded-full bg-white/25" />
        <span className="mt-auto h-4 w-20 animate-shimmer rounded-full bg-white/25" />
      </div>
    </div>
  );
}

export function EmptyWordCard() {
  return (
    <div className="relative mx-1 mt-7">
      <div aria-hidden="true" className="absolute inset-0 translate-x-[10px] -translate-y-[14px] rotate-[4deg] rounded-xl bg-blue-mist" />
      <div aria-hidden="true" className="absolute inset-0 translate-x-[5px] -translate-y-[7px] rotate-[2deg] rounded-xl bg-blue-soft" />
      <div className="relative flex min-h-[380px] -rotate-3 flex-col items-center justify-center rounded-xl bg-blue px-6 text-center text-white shadow-card">
        <motion.span
          className="text-6xl"
          aria-hidden="true"
          animate={{ rotate: [0, 18, -8, 18, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.4 }}
        >
          👋
        </motion.span>
        <p className="mt-4 text-2xl font-semibold">Your word lands here</p>
        <p className="mt-1.5 opacity-85">Type a word, then press “Show me”. You’ll see it, hear it and use it.</p>
      </div>
    </div>
  );
}

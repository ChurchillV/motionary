"use client";

import { motion, useReducedMotion } from "framer-motion";
import { languageName } from "@/lib/languages";
import type { SentenceResponse } from "@/lib/schemas";
import { ConfidenceBadge } from "./ConfidenceBadge";

const LANG_TAG: Record<string, string> = { eng: "en", spa: "es", fra: "fr", deu: "de", ita: "it", por: "pt", jpn: "ja", kor: "ko", cmn: "zh" };

/** A whole sentence on the blue card, with key words to open as word cards. */
export function SentenceCard({ data, onWord }: { data: SentenceResponse; onWord: (sourceWord: string) => void }) {
  const reduce = useReducedMotion();
  return (
    <div>
      <div className="relative mx-1 mt-7">
        <div aria-hidden="true" className="absolute inset-0 translate-x-[10px] -translate-y-[14px] rotate-[4deg] rounded-xl bg-blue-mist" />
        <div aria-hidden="true" className="absolute inset-0 translate-x-[5px] -translate-y-[7px] rotate-[2deg] rounded-xl bg-blue-soft" />
        <motion.article
          initial={reduce ? false : { rotate: -3, scale: 0.9, y: 18, opacity: 0.3 }}
          animate={{ rotate: -3, scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 15, mass: 0.9 }}
          className="relative flex min-h-[300px] flex-col rounded-xl bg-blue px-5 pb-5 pt-4 text-white shadow-card"
          aria-label={`Sentence in ${languageName(data.target_lang)}: ${data.translation}`}
        >
          <span className="text-sm opacity-85">
            {languageName(data.source.lang)} · <b className="font-semibold">{data.source.text}</b>
          </span>
          <div className="flex flex-1 flex-col justify-center py-5 text-center">
            <motion.p
              lang={LANG_TAG[data.target_lang]}
              initial={reduce ? false : { y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="break-words text-[clamp(24px,7vw,32px)] font-bold leading-[1.2]"
            >
              {data.translation}
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

      {data.key_words.length > 0 && (
        <section className="mt-4">
          <small className="mx-1 mb-1.5 block text-[13px] text-ink-2">Key words: tap one to see it in motion</small>
          <div className="flex flex-wrap gap-2">
            {data.key_words.map((k, i) => (
              <motion.button
                key={`${k.source}-${i}`}
                type="button"
                onClick={() => onWord(k.source)}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.06 }}
                whileTap={{ scale: 0.95 }}
                className="flex flex-col items-start rounded-[14px] bg-surface px-3.5 py-2 text-left shadow-soft"
              >
                <span lang={LANG_TAG[data.target_lang]} className="text-[17px] font-semibold text-blue">{k.target}</span>
                <span className="text-[13px] text-ink-2">{k.english}</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

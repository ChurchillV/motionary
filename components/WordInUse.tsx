"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { LookupResponse } from "@/lib/schemas";
import { AudioButton } from "./AudioButton";
import { Bulb, ChevronUp } from "./Icons";

/** Splits the sentence around the target word so it can be highlighted. */
function highlight(sentence: string, word: string) {
  const i = sentence.toLowerCase().indexOf(word.toLowerCase());
  if (!word || i === -1) return <>{sentence}</>;
  return (
    <>
      {sentence.slice(0, i)}
      <span className="text-blue underline underline-offset-[3px]">{sentence.slice(i, i + word.length)}</span>
      {sentence.slice(i + word.length)}
    </>
  );
}

export function WordInUse({ data, slow }: { data: LookupResponse; slow: boolean }) {
  const [open, setOpen] = useState(true);
  if (!data.example) return null;
  return (
    <section className="mt-3.5 rounded-lg bg-surface px-4 py-3.5 shadow-soft">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Bulb /> Word in use
        </span>
        <ChevronUp className={`transition ${open ? "" : "rotate-180"}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 grid grid-cols-[1fr_34px] items-start gap-2">
              <p className="italic leading-[1.4] text-ink-2">
                {highlight(data.example.target, data.target.form)}
                {data.target_lang !== "eng" && data.example.english && (
                  <small className="mt-1 block text-[13px] not-italic text-ink-3">{data.example.english}</small>
                )}
              </p>
              {data.audio.available && (
                <AudioButton
                  key={`${data.concept_id}:${data.target_lang}:sentence`}
                  variant="mini"
                  clip={data.audio.sentence}
                  request={{ concept_id: data.concept_id, lang: data.target_lang, kind: "sentence" }}
                  slow={slow}
                  label="Play the example sentence"
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

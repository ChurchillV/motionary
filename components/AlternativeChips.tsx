"use client";

import { motion } from "framer-motion";

export type Alternative = { concept_id: string; english_gloss: string; emoji?: string | null };

export function AlternativeChips({ items, onPick, disabled }: { items: Alternative[]; onPick: (a: Alternative) => void; disabled?: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <small className="mx-1 mb-1.5 block text-[13px] text-ink-2">Did you mean</small>
      <div className="flex flex-wrap gap-2">
        {items.map((a, i) => (
          <motion.button
            key={a.concept_id}
            type="button"
            disabled={disabled}
            onClick={() => onPick(a)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.06 }}
            whileTap={{ scale: 0.95 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[15px] shadow-soft disabled:opacity-50"
          >
            {a.emoji && <span aria-hidden="true">{a.emoji}</span>}
            {a.english_gloss}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

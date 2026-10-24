"use client";

import { motion } from "framer-motion";

export type Rating = "hard" | "medium" | "easy";

const OPTIONS: { value: Rating; face: string; label: string }[] = [
  { value: "hard", face: "😞", label: "Hard" },
  { value: "medium", face: "🙂", label: "Medium" },
  { value: "easy", face: "😆", label: "Easy" },
];

export function RatingRow({ value, onChange }: { value: Rating | null; onChange: (r: Rating) => void }) {
  return (
    <div className="mt-[18px] grid grid-cols-3 text-center" role="radiogroup" aria-label="How well did you know it?">
      {OPTIONS.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex flex-col items-center gap-1.5 text-[13px] ${on ? "font-semibold text-green" : "text-ink-3"}`}
          >
            <motion.span
              animate={on ? { scale: [1, 1.25, 1.05] } : { scale: 1 }}
              transition={{ duration: 0.35 }}
              className={`grid h-14 w-14 place-items-center rounded-full border-[3px] bg-surface text-[30px] ${on ? "border-green" : "border-transparent"}`}
            >
              {o.face}
            </motion.span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

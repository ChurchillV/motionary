"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { LANGUAGES, getLanguage } from "@/lib/languages";
import { ChevronDown, Swap } from "./Icons";

/** "From" and "To" pickers with a swap button. Picking the same language on both sides swaps them. */
export function LanguagePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (pair: { from: string; to: string }) => void;
}) {
  const [open, setOpen] = useState<"from" | "to" | null>(null);
  const [spins, setSpins] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const swap = () => {
    setSpins((s) => s + 1);
    onChange({ from: to, to: from });
  };

  const pick = (side: "from" | "to", code: string) => {
    setOpen(null);
    if (side === "from") onChange(code === to ? { from: code, to: from } : { from: code, to });
    else onChange(code === from ? { from: to, to: code } : { from, to: code });
  };

  const button = (side: "from" | "to", code: string) => {
    const lang = getLanguage(code);
    return (
      <button
        type="button"
        onClick={() => setOpen(open === side ? null : side)}
        aria-haspopup="listbox"
        aria-expanded={open === side}
        aria-label={`Translate ${side}: ${lang?.name}`}
        className="flex min-w-0 flex-col gap-0.5 rounded-md bg-blue-tint px-2.5 py-2 text-left"
      >
        <small className="text-xs text-ink-2">{side === "from" ? "From" : "To"}</small>
        <strong className="flex items-center justify-between gap-1 text-base font-semibold">
          <span className="truncate">
            <span aria-hidden="true">{lang?.flag} </span>
            {lang?.name}
          </span>
          <ChevronDown className={`shrink-0 transition ${open === side ? "rotate-180" : ""}`} />
        </strong>
      </button>
    );
  };

  return (
    <div ref={ref} className="relative grid grid-cols-[1fr_40px_1fr] items-center gap-1.5 rounded-lg bg-surface p-3 shadow-soft">
      {button("from", from)}
      <motion.button
        type="button"
        onClick={swap}
        aria-label="Swap languages"
        animate={{ rotate: spins * 180 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        whileTap={{ scale: 0.9 }}
        className="grid h-10 w-10 place-items-center rounded-full bg-blue text-white"
      >
        <Swap />
      </motion.button>
      {button("to", to)}

      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            aria-label={open === "from" ? "Translate from" : "Translate to"}
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="absolute inset-x-0 top-[calc(100%+8px)] z-30 grid max-h-[320px] grid-cols-2 gap-1 overflow-y-auto rounded-lg bg-surface p-2 shadow-[0_18px_40px_-12px_rgba(22,24,29,.3)]"
          >
            {LANGUAGES.map((l) => {
              const selected = (open === "from" ? from : to) === l.code;
              return (
                <li key={l.code}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => pick(open, l.code)}
                    className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition hover:bg-blue-tint ${
                      selected ? "bg-blue-tint font-semibold text-blue" : ""
                    }`}
                  >
                    <span className="text-xl" aria-hidden="true">{l.flag}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px]">{l.name}</span>
                      <span className="block truncate text-xs text-ink-2">{l.nativeName}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

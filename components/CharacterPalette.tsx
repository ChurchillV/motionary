"use client";

import type { RefObject } from "react";

/** Tappable special characters, inserted at the cursor. Hidden for IME languages. */
export function CharacterPalette({
  chars,
  inputRef,
  value,
  onChange,
}: {
  chars: string[];
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  if (!chars.length) return null;
  const insert = (ch: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const next = (value.slice(0, start) + ch + value.slice(end)).slice(0, 40);
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + ch.length, start + ch.length);
    });
  };
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Special characters">
      {chars.map((ch) => (
        <button
          key={ch}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(ch)}
          className="h-[34px] min-w-[34px] rounded-[10px] bg-white/20 px-2 font-semibold text-white transition active:scale-95 active:bg-white/35"
          aria-label={`Insert ${ch}`}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "framer-motion";

/** The ∞ loop on the front card: a GIF that never ends. */
const LOOP = "M24 25C27 20.5 33 20.5 33 25C33 29.5 27 29.5 24 25C21 20.5 15 20.5 15 25C15 29.5 21 29.5 24 25Z";

/**
 * Motionary mark: the app's stacked word cards, fanning out on load,
 * with a dot tracing an endless loop on the front card.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  const reduce = useReducedMotion();
  const card = { x: 10, y: 8, width: 28, height: 34, rx: 7 };
  const spring = { type: "spring" as const, stiffness: 220, damping: 14 };

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className="overflow-visible">
      <motion.rect
        {...card}
        fill="var(--color-blue-mist)"
        style={{ originX: 0.5, originY: 0.95 }}
        initial={reduce ? false : { rotate: 0 }}
        animate={{ rotate: 14 }}
        transition={{ ...spring, delay: 0.1 }}
      />
      <motion.rect
        {...card}
        fill="var(--color-blue-soft)"
        style={{ originX: 0.5, originY: 0.95 }}
        initial={reduce ? false : { rotate: 0 }}
        animate={{ rotate: 6 }}
        transition={{ ...spring, delay: 0.05 }}
      />
      <motion.g
        style={{ originX: 0.5, originY: 0.95 }}
        initial={reduce ? false : { rotate: 0, y: 4, opacity: 0 }}
        animate={reduce ? { rotate: -6 } : { rotate: [-6, -3, -6], y: [0, -1.2, 0], opacity: 1 }}
        transition={
          reduce
            ? { duration: 0 }
            : { rotate: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" }, opacity: { duration: 0.3 } }
        }
      >
        <rect {...card} fill="var(--color-blue)" />
        <motion.path
          d={LOOP}
          stroke="#fff"
          strokeOpacity={0.55}
          strokeWidth={2.2}
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.9, delay: 0.35, ease: "easeInOut" }}
        />
        <circle r={2.6} fill="#fff" cx={reduce ? 33 : 0} cy={reduce ? 25 : 0}>
          {!reduce && <animateMotion dur="2.6s" repeatCount="indefinite" path={LOOP} rotate="auto" />}
        </circle>
      </motion.g>
    </svg>
  );
}

/** Mark + wordmark. The letters pop in one by one. */
export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  const reduce = useReducedMotion();
  const letters = [..."Motion"].map((ch) => ({ ch, blue: false })).concat([..."ary"].map((ch) => ({ ch, blue: true })));

  return (
    <motion.span
      className={`inline-flex items-center gap-1.5 ${className}`}
      whileHover={reduce ? undefined : { scale: 1.04 }}
      aria-label="Motionary"
      role="img"
    >
      <LogoMark size={size} />
      <span className="flex text-[22px] font-bold leading-none tracking-[-0.01em]" aria-hidden="true">
        {letters.map((l, i) => (
          <motion.span
            key={i}
            className={l.blue ? "text-blue" : "text-ink"}
            initial={reduce ? false : { y: 10, opacity: 0, scale: 0.6 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 16, delay: 0.25 + i * 0.04 }}
          >
            {l.ch}
          </motion.span>
        ))}
      </span>
    </motion.span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { Visual } from "@/lib/schemas";
import { EmojiFallback } from "./EmojiFallback";
import { Play } from "./Icons";

/**
 * Plays one visual. MP4 → <video autoplay loop muted playsinline>, WebP → <img>.
 * With reduced motion it shows the first frame (or the static emoji) and a play button.
 */
export function GifPlayer({ visual, alt, emoji, small = false }: { visual: Visual; alt: string; emoji: string | null; small?: boolean }) {
  const reduce = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const [userPlay, setUserPlay] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackEmoji = visual.emoji ?? emoji;
  const animate = !reduce || userPlay;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (animate) v.play().catch(() => {});
    else v.pause();
  }, [animate]);

  const emojiSize = small ? 60 : 84;

  if (failed || visual.provider === "emoji" || (!visual.mp4 && !visual.webp)) {
    return <EmojiFallback emoji={fallbackEmoji} label={alt} size={emojiSize} />;
  }

  const playButton = !animate && (
    <button
      type="button"
      onClick={() => setUserPlay(true)}
      className="absolute inset-0 m-auto grid h-12 w-12 place-items-center rounded-full bg-blue text-white shadow-card"
      aria-label={`Play animation: ${alt}`}
    >
      <Play size={18} />
    </button>
  );

  if (visual.mp4) {
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        <video
          ref={videoRef}
          src={visual.mp4}
          poster={undefined}
          autoPlay={animate}
          loop
          muted
          playsInline
          preload="auto"
          aria-label={alt}
          onError={() => setFailed(true)}
          className="h-full w-full object-contain"
          style={{ aspectRatio: `${visual.width} / ${visual.height}` }}
        />
        {playButton}
      </div>
    );
  }

  // Animated WebP cannot be paused: with reduced motion show the static emoji until asked.
  if (!animate && fallbackEmoji) {
    return (
      <div className="relative flex h-full w-full items-center justify-center">
        <EmojiFallback emoji={fallbackEmoji} label={alt} size={emojiSize} />
        {playButton}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={visual.webp!}
      alt={alt}
      width={visual.width}
      height={visual.height}
      onError={() => setFailed(true)}
      className={`object-contain ${visual.provider === "noto" ? (small ? "h-[70%] w-[70%]" : "h-[86%] w-[58%]") : "h-full w-full"}`}
    />
  );
}

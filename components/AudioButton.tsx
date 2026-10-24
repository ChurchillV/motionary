"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playClip } from "@/lib/client/player";
import type { AudioClip } from "@/lib/schemas";
import { Play, Speaker, Spinner } from "./Icons";

type Req = { concept_id: string; lang: string; kind: "word" | "sentence" };

/** Ask the server to generate (or fetch) a clip. Shared so the card and list reuse one request. */
const pending = new Map<string, Promise<AudioClip | null>>();
export function requestClip(req: Req): Promise<AudioClip | null> {
  const key = `${req.concept_id}:${req.lang}:${req.kind}`;
  let p = pending.get(key);
  if (!p) {
    p = fetch("/api/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) })
      .then((r) => (r.ok ? (r.json() as Promise<AudioClip>) : null))
      .catch(() => null)
      .then((clip) => {
        if (!clip) pending.delete(key); // allow a retry later
        return clip;
      });
    pending.set(key, p);
  }
  return p;
}

/**
 * Tap to play, tap again to replay. Long-press (or the slow toggle) plays at 0.75×.
 * Shows a spinner while the clip is generated on demand.
 */
export function AudioButton({
  clip,
  request,
  variant,
  slow,
  label,
  autoPlayKey,
  onPlayingChange,
}: {
  clip: AudioClip | null;
  request: Req;
  variant: "sound" | "mini";
  slow: boolean;
  label: string;
  autoPlayKey?: string | null;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [url, setUrl] = useState<string | null>(clip?.url ?? null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const lastAuto = useRef<string | null>(null);

  const play = useCallback(
    async (rate: number) => {
      let src = url;
      if (!src) {
        setState("loading");
        src = (await requestClip(request))?.url ?? null;
        if (!src) {
          setState("error");
          setTimeout(() => setState("idle"), 1800);
          return;
        }
        setUrl(src);
      }
      setState("playing");
      onPlayingChange?.(true);
      try {
        await playClip(src, rate);
      } catch {
        // Autoplay blocked or decode error: just reset.
      }
      setState("idle");
      onPlayingChange?.(false);
    },
    [url, request, onPlayingChange],
  );

  useEffect(() => {
    if (autoPlayKey && lastAuto.current !== autoPlayKey) {
      lastAuto.current = autoPlayKey;
      const t = setTimeout(() => void play(slow ? 0.75 : 1), 450);
      return () => clearTimeout(t);
    }
  }, [autoPlayKey, play, slow]);

  const onPointerDown = () => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      void play(0.75);
    }, 450);
  };
  const clearPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const onClick = () => {
    if (longPressed.current) return;
    void play(slow ? 0.75 : 1);
  };

  const playing = state === "playing";
  const title = state === "error" ? "Audio isn't available right now" : `${label} (hold for slow)`;

  if (variant === "sound") {
    return (
      <button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerUp={clearPress}
        onPointerLeave={clearPress}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={label}
        title={title}
        className={`grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full transition ${
          playing ? "bg-white text-blue" : "bg-white/20 text-white"
        } ${state === "error" ? "opacity-50" : ""}`}
      >
        {state === "loading" ? <Spinner /> : <Speaker />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={clearPress}
      onPointerLeave={clearPress}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={label}
      title={title}
      className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full transition ${
        playing ? "bg-blue text-white" : "bg-blue-tint text-blue"
      } ${state === "error" ? "opacity-50" : ""}`}
    >
      {state === "loading" ? <Spinner size={14} /> : <Play />}
    </button>
  );
}

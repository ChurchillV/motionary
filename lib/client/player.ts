"use client";

/** One shared audio element, so a new clip always stops the previous one. */
let audio: HTMLAudioElement | null = null;
let stopCurrent: (() => void) | null = null;

export function playClip(url: string, rate = 1): Promise<void> {
  stopCurrent?.();
  audio ??= new Audio();
  const el = audio;
  return new Promise((resolve, reject) => {
    const done = () => {
      el.onended = el.onerror = el.onpause = null;
      stopCurrent = null;
      resolve();
    };
    stopCurrent = () => {
      el.pause();
      done();
    };
    el.onended = done;
    el.onpause = done;
    el.onerror = () => {
      el.onended = el.onerror = el.onpause = null;
      stopCurrent = null;
      reject(new Error("Could not play audio"));
    };
    el.src = url;
    el.playbackRate = rate;
    el.preservesPitch = true;
    el.play().catch((e) => {
      el.onended = el.onerror = el.onpause = null;
      stopCurrent = null;
      reject(e);
    });
  });
}

export function stopClip() {
  stopCurrent?.();
}

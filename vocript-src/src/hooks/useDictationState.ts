import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * What dictation is doing right now, as reported by the backend. The overlay
 * has always known this; the main window didn't, because `show-overlay` is
 * emitted to the overlay window only. `dictation-state` is the app-wide
 * version, emitted from the same places (see overlay.rs) and *before* the
 * "is the capsule enabled" check, so the Today screen still follows along for
 * someone who turned the capsule off.
 */
export type DictationState =
  | "idle"
  | "recording"
  | "transcribing"
  | "processing"
  | "copied"
  | "live";

/** How many bars the meter draws. */
export const METER_BARS = 24;

const ZERO_BARS: number[] = Array(METER_BARS).fill(0);

/**
 * Collapse the backend's spectrum into `count` bars by taking the peak of each
 * slice. Same approach as the overlay: averaging would let a loud sibilant
 * disappear into the quiet bins next to it.
 */
function collapseToBars(raw: number[], count: number): number[] {
  if (raw.length === 0) return Array(count).fill(0);
  const result = new Array(count).fill(0);
  for (let i = 0; i < count; i++) {
    const start = Math.floor((i * raw.length) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * raw.length) / count));
    let peak = 0;
    for (let j = start; j < end; j++) {
      peak = Math.max(peak, raw[j] || 0);
    }
    result[i] = peak;
  }
  return result;
}

/**
 * Live dictation state plus the microphone levels, for anything in the main
 * window that wants to show what's happening.
 */
export const useDictationState = () => {
  const [state, setState] = useState<DictationState>("idle");
  const [levels, setLevels] = useState<number[]>(ZERO_BARS);
  const smoothed = useRef<number[]>(ZERO_BARS);

  useEffect(() => {
    const pending = [
      listen<string>("dictation-state", (event) => {
        setState(event.payload as DictationState);
      }),
      // Asymmetric smoothing, same as the overlay: fast attack so a syllable
      // shows up immediately, slow release so the bars fall gracefully.
      listen<number[]>("mic-level", (event) => {
        const target = collapseToBars(event.payload ?? [], METER_BARS);
        const next = smoothed.current.map((prev, i) => {
          const to = target[i] || 0;
          return prev + (to - prev) * (to > prev ? 0.75 : 0.22);
        });
        smoothed.current = next;
        setLevels(next);
      }),
    ];

    return () => {
      pending.forEach((p) => p.then((off) => off()).catch(() => {}));
    };
  }, []);

  // Nothing is being recorded, so leave the meter flat rather than frozen on
  // whatever the last syllable happened to be.
  useEffect(() => {
    if (state !== "recording" && state !== "live") {
      smoothed.current = ZERO_BARS;
      setLevels(ZERO_BARS);
    }
  }, [state]);

  return { state, levels };
};

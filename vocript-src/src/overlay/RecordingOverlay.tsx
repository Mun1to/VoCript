import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow, PhysicalPosition } from "@tauri-apps/api/window";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CancelIcon,
  CheckIcon,
  CopyIcon,
  VoCriptMark,
} from "../components/icons";
import "./RecordingOverlay.css";
import { commands } from "@/bindings";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import {
  DEFAULT_ACCENT,
  darkenHex,
  hexToRgba,
} from "@/lib/constants/accentColors";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState =
  | "recording"
  | "transcribing"
  | "processing"
  | "copied"
  | "live";

interface LiveFinishedPayload {
  text: string;
  copied: boolean;
}

const BAR_COUNT = 5;
const ZERO_LEVELS = Array(BAR_COUNT).fill(0);

// How far the pointer must move (in px) before a pointerdown on the logo is
// treated as a drag instead of a click. See handlePointerDown.
const DRAG_THRESHOLD_PX = 4;

/**
 * Height ratios of the 5 bars in the VoCript logo mark itself (see
 * VoCriptMark.tsx: rects of height 6, 12, 19, 11, 5 out of a 24-tall canvas).
 * Reusing them here makes the recording bars read as "the logo waking up"
 * instead of a generic equalizer, per Munir's ask.
 */
const LOGO_BAR_RATIOS = [6, 12, 19, 11, 5];
const MAX_LOGO_RATIO = Math.max(...LOGO_BAR_RATIOS);

/**
 * The backend's mic-level spectrum has more bands than we show (see
 * AudioVisualiser::BUCKETS in audio_toolkit). Collapse it down to BAR_COUNT by
 * taking the peak of each slice, so a handful of thick bars still reacts to
 * the full spectrum instead of only its lowest frequencies.
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
 * Mirror the app's accent color onto this overlay window. App.tsx's accent
 * effect only runs in the main window and the overlay does not load App.css, so
 * without this the logo mark and the cancel/copy icons — which read
 * `--color-logo-primary`/`--color-logo-stroke` — would render in the CSS
 * defaults instead of the user's chosen accent (and used to render black before
 * the defaults existed). Module-level so the mount effect and the show-overlay
 * listener can both call it without re-creating the function on every render.
 */
async function applyOverlayAccent() {
  try {
    const result = await commands.getAppSettings();
    const accent =
      result.status === "ok" && result.data.accent_color
        ? result.data.accent_color
        : DEFAULT_ACCENT;
    const root = document.documentElement;
    root.style.setProperty("--color-logo-primary", accent);
    root.style.setProperty("--color-logo-stroke", darkenHex(accent));
    root.style.setProperty("--color-logo-glow", hexToRgba(accent, 0.5));
  } catch (e) {
    console.warn("Failed to apply accent color in overlay:", e);
  }
}

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  const [state, setState] = useState<OverlayState>("recording");
  const [levels, setLevels] = useState<number[]>(ZERO_LEVELS);
  const [liveText, setLiveText] = useState("");
  // Live session finished: the bubble becomes editable and shows the copy button.
  const [liveFinished, setLiveFinished] = useState(false);
  // Brief "copied ✓" feedback on the copy button.
  const [copyFeedback, setCopyFeedback] = useState(false);
  const smoothedLevelsRef = useRef<number[]>(Array(BAR_COUNT).fill(0));
  const liveTextRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);
  // Mirror of liveFinished for use inside event listeners (avoids stale closure).
  const liveFinishedRef = useRef(false);
  // Latest full partial from the backend. The displayed `liveText` catches up to
  // this one word at a time so the bubble reads smoothly instead of jumping
  // phrase by phrase.
  const liveTargetRef = useRef("");
  const direction = getLanguageDirection(i18n.language);

  // ---------- manual window dragging ----------
  // Tauri's native startDragging() felt unresponsive/laggy on some machines
  // (the same problem hit in the Layco overlay, fixed there the same way —
  // see moveWindowFast/pumpDrag in layco-core/src/App.tsx). Moving the window
  // ourselves via setPosition(), coalesced to one IPC call per animation
  // frame, keeps the capsule tracking the cursor smoothly instead of queueing
  // up position updates faster than the OS can apply them.
  const overlayWindowRef = useRef(getCurrentWindow());
  // Last known physical position of the window — refreshed whenever the
  // overlay is (re)shown and after every applied drag move, so a new drag
  // never has to await outerPosition() before it can start.
  const windowPosRef = useRef<{ x: number; y: number } | null>(null);
  const dragOriginRef = useRef<{
    screenX: number;
    screenY: number;
    winX: number;
    winY: number;
  } | null>(null);
  const dragTargetRef = useRef<{ x: number; y: number } | null>(null);
  const dragSeqRef = useRef(0);
  const dragSentRef = useRef(0);
  const dragBusyRef = useRef(false);
  const dragRafRef = useRef(0);

  // Applies the latest queued drag target, with never more than one
  // setPosition IPC call in flight at a time (queueing more was the visible
  // stutter with the previous approach).
  const pumpDrag = () => {
    if (dragBusyRef.current) return;
    if (dragSentRef.current === dragSeqRef.current) return;
    const t = dragTargetRef.current;
    if (!t) return;
    dragSentRef.current = dragSeqRef.current;
    dragBusyRef.current = true;
    windowPosRef.current = t;
    void overlayWindowRef.current
      .setPosition(new PhysicalPosition(Math.round(t.x), Math.round(t.y)))
      .finally(() => {
        dragBusyRef.current = false;
        if (dragSentRef.current !== dragSeqRef.current) pumpDrag();
      });
  };

  useEffect(() => {
    liveFinishedRef.current = liveFinished;
  }, [liveFinished]);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Apply the accent color as soon as the overlay window mounts.
      void applyOverlayAccent();

      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", async (event) => {
        // Sync language + accent from settings each time the overlay is shown,
        // so a change made in the main window is reflected on the next capsule.
        await syncLanguageFromSettings();
        void applyOverlayAccent();
        const overlayState = event.payload as OverlayState;
        // Starting a fresh live session: clear any previous text/state.
        if (overlayState === "live") {
          setLiveText("");
          liveTargetRef.current = "";
          setLiveFinished(false);
          setCopyFeedback(false);
        }
        setState(overlayState);
        setIsVisible(true);
        // Rust just (re)positioned the window (see overlay.rs); refresh our
        // cached position so the next drag starts from the real spot instead
        // of a stale one.
        try {
          const pos = await overlayWindowRef.current.outerPosition();
          windowPosRef.current = { x: pos.x, y: pos.y };
        } catch (e) {
          console.warn("Failed to read overlay window position:", e);
        }
      });

      // Listen for hide-overlay event from Rust
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        // Reiniciar las barras para que no se queden "congeladas" en el último
        // valor cuando el overlay vuelve a aparecer.
        smoothedLevelsRef.current = Array(BAR_COUNT).fill(0);
        setLevels(ZERO_LEVELS);
        setLiveText("");
        liveTargetRef.current = "";
        setLiveFinished(false);
        setCopyFeedback(false);
      });

      // Listen for mic-level updates
      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = collapseToBars(event.payload as number[], BAR_COUNT);

        // Suavizado asimétrico: ataque rápido (sube casi al instante con la voz)
        // y caída suave (baja con elegancia). Así la animación se nota mucho más
        // y reacciona de inmediato, sin el "retardo" que la hacía parecer floja.
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          const factor = target > prev ? 0.6 : 0.22;
          return prev + (target - prev) * factor;
        });

        smoothedLevelsRef.current = smoothed;
        setLevels(smoothed.slice(0, BAR_COUNT));
      });

      // Listen for live transcription partials (text grows as you speak).
      // Ignore late partials once the session has finished, so they don't
      // overwrite the final/edited text in the bubble.
      const unlistenLive = await listen<string>("live-text", (event) => {
        if (liveFinishedRef.current) return;
        // Just update the target; the reveal loop reveals it word by word.
        liveTargetRef.current = event.payload as string;
      });

      // Live session finished: deliver final text + whether it was auto-copied,
      // and switch the bubble to its editable state.
      const unlistenLiveFinished = await listen<LiveFinishedPayload>(
        "live-finished",
        (event) => {
          const payload = event.payload as LiveFinishedPayload;
          // Show the final text in full immediately (no gradual reveal) so it
          // can be edited/copied right away.
          liveTargetRef.current = payload.text;
          setLiveText(payload.text);
          setLiveFinished(true);
          if (payload.copied) {
            setCopyFeedback(true);
            if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = window.setTimeout(
              () => setCopyFeedback(false),
              1600,
            );
          }
        },
      );

      // Cleanup function
      return () => {
        unlistenShow();
        unlistenHide();
        unlistenLevel();
        unlistenLive();
        unlistenLiveFinished();
      };
    };

    setupEventListeners();
  }, []);

  // Reveal the live partial one word at a time, so the bubble reads smoothly
  // instead of jumping a whole phrase every time a new partial arrives.
  useEffect(() => {
    if (state !== "live" || liveFinished) return;
    const id = window.setInterval(() => {
      setLiveText((shown) => {
        const target = liveTargetRef.current;
        if (shown === target) return shown;
        // Append case: reveal the next word of the (longer) target.
        if (target.startsWith(shown)) {
          const rest = target.slice(shown.length);
          const next = rest.match(/^\s*\S+/);
          return next ? shown + next[0] : target;
        }
        // Whisper corrected an earlier word — snap to the new text.
        return target;
      });
    }, 70);
    return () => window.clearInterval(id);
  }, [state, liveFinished]);

  // While recording live, keep the read-only bubble scrolled to the latest text.
  useEffect(() => {
    if (!liveFinished && liveTextRef.current) {
      liveTextRef.current.scrollTop = liveTextRef.current.scrollHeight;
    }
  }, [liveText, liveFinished]);

  const openApp = () => {
    commands.showMainWindowCommand();
  };

  const cancel = () => {
    commands.cancelOperation();
  };

  // Drag the overlay like a normal window, in every state — the backend
  // remembers wherever it is dropped (see overlay.rs) and puts it back there
  // next time instead of re-centering it. Never when the pointerdown lands on
  // textarea/X/copy, which have their own click behaviour with nothing to
  // reconcile it with.
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const targetEl = e.target as HTMLElement;
    if (targetEl.closest("textarea, .cancel-button, .copy-button")) {
      return;
    }

    // The logo is both clickable (opens the app) and, now that the compact
    // capsule is small, a big chunk of the only grabbable surface. Rather
    // than excluding it from dragging outright — which made it easy to grab
    // the capsule right on the logo and have nothing happen — only start the
    // drag once the pointer has actually moved past a small threshold. Below
    // that threshold it's treated as a plain click and falls through to the
    // logo's own onClick.
    const onLogo = !!targetEl.closest(".overlay-logo");
    const dpr = window.devicePixelRatio || 1;
    const originScreenX = e.screenX * dpr;
    const originScreenY = e.screenY * dpr;
    let dragArmed = !onLogo;

    // Pointer capture: without it, once the window (small, chasing the
    // cursor via setPosition) falls behind and the cursor exits its bounds,
    // this window would stop receiving pointermove entirely and the drag
    // would freeze mid-gesture. Capturing on the element keeps events
    // flowing to it regardless of where the cursor physically is.
    const capsule = e.currentTarget;
    const pointerId = e.pointerId;
    capsule.setPointerCapture(pointerId);

    const armDrag = async () => {
      if (dragOriginRef.current) return;
      const cached = windowPosRef.current;
      const pos = cached ?? (await overlayWindowRef.current.outerPosition());
      dragOriginRef.current = {
        screenX: originScreenX,
        screenY: originScreenY,
        winX: pos.x,
        winY: pos.y,
      };
    };

    if (dragArmed) void armDrag();

    const onMove = (moveEvent: PointerEvent) => {
      const curX = moveEvent.screenX * dpr;
      const curY = moveEvent.screenY * dpr;
      if (!dragArmed) {
        if (Math.hypot(curX - originScreenX, curY - originScreenY) < DRAG_THRESHOLD_PX * dpr) {
          return;
        }
        dragArmed = true;
        void armDrag();
      }
      const origin = dragOriginRef.current;
      if (!origin) return; // still resolving the starting position
      dragTargetRef.current = {
        x: origin.winX + (curX - origin.screenX),
        y: origin.winY + (curY - origin.screenY),
      };
      dragSeqRef.current++;
      if (!dragRafRef.current) {
        dragRafRef.current = requestAnimationFrame(() => {
          dragRafRef.current = 0;
          pumpDrag();
        });
      }
    };

    const onUp = () => {
      capsule.removeEventListener("pointermove", onMove);
      capsule.removeEventListener("pointerup", onUp);
      try {
        capsule.releasePointerCapture(pointerId);
      } catch {
        // pointer already released (e.g. capture lost mid-gesture)
      }
      if (dragRafRef.current) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = 0;
      }
      dragOriginRef.current = null;
      pumpDrag(); // apply the final pending position, if any
    };

    capsule.addEventListener("pointermove", onMove);
    capsule.addEventListener("pointerup", onUp);
  };

  const handleCopy = async () => {
    try {
      await writeText(liveText);
      setCopyFeedback(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(
        () => setCopyFeedback(false),
        1600,
      );
    } catch (e) {
      console.error("Failed to copy live transcription:", e);
    }
  };

  return (
    <div
      dir={direction}
      onPointerDown={handlePointerDown}
      className={`recording-overlay ${state === "live" ? "live" : ""} ${
        state === "recording" ? "compact" : ""
      } ${
        state === "transcribing" || state === "processing" || state === "copied"
          ? "status"
          : ""
      } ${liveFinished ? "live-finished" : ""} ${isVisible ? "fade-in" : ""}`}
    >
      <div
        className="overlay-left overlay-logo"
        onClick={openApp}
        title="VoCript"
        role="button"
        tabIndex={0}
        aria-label="VoCript"
      >
        <VoCriptMark />
      </div>

      {state === "recording" && <div className="overlay-divider" />}

      <div className="overlay-middle">
        {state === "recording" && (
          <div className="bars-container">
            {levels.map((v, i) => {
              // Ganancia extra para que los picos de voz lleguen bien arriba.
              const gained = Math.min(1, Math.pow(v, 0.6) * 1.4);
              // Cada barra crece/decrece manteniendo la proporción de su
              // homóloga en el logo (la del medio siempre la más alta), en vez
              // de que las 5 tengan la misma altura como un ecualizador genérico.
              const ratio = LOGO_BAR_RATIOS[i] / MAX_LOGO_RATIO;
              const minHeight = 3 + ratio * 5;
              const maxHeight = 8 + ratio * 14;
              return (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${minHeight + gained * (maxHeight - minHeight)}px`,
                    transition: "height 70ms ease-out, opacity 100ms ease-out",
                    // Tenues en reposo (se leen como medidor neutro, distinto
                    // del logo que siempre está a color pleno) y se iluminan
                    // con la voz.
                    opacity: Math.max(0.3, gained),
                  }}
                />
              );
            })}
          </div>
        )}
        {state === "transcribing" && (
          <div className="transcribing-text">{t("overlay.transcribing")}</div>
        )}
        {state === "processing" && (
          <div className="transcribing-text">{t("overlay.processing")}</div>
        )}
        {state === "copied" && (
          <div className="copied-text">{t("overlay.copied")}</div>
        )}
        {state === "live" &&
          (liveFinished ? (
            <textarea
              className="live-textarea"
              value={liveText}
              onChange={(e) => setLiveText(e.target.value)}
              spellCheck={false}
              aria-label={t("overlay.editTranscription")}
            />
          ) : (
            <div className="live-text" ref={liveTextRef}>
              {liveText ? (
                <>
                  {liveText}
                  <span className="live-caret" />
                </>
              ) : (
                <span className="live-placeholder">
                  {t("overlay.listening")}
                </span>
              )}
            </div>
          ))}
      </div>

      {(state === "recording" || state === "live") && (
        <div className="overlay-right">
          <div
            className="cancel-button"
            onClick={cancel}
            title={t("overlay.cancel")}
          >
            <CancelIcon />
          </div>
          {state === "live" && liveFinished && (
            <div
              className="copy-button"
              onClick={handleCopy}
              title={t("overlay.copyToClipboard")}
            >
              {copyFeedback ? <CheckIcon /> : <CopyIcon />}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RecordingOverlay;

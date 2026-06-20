import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
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

const BAR_COUNT = 9;
const ZERO_LEVELS = Array(BAR_COUNT).fill(0);

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
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    liveFinishedRef.current = liveFinished;
  }, [liveFinished]);

  useEffect(() => {
    const setupEventListeners = async () => {
      // Listen for show-overlay event from Rust
      const unlistenShow = await listen("show-overlay", async (event) => {
        // Sync language from settings each time overlay is shown
        await syncLanguageFromSettings();
        const overlayState = event.payload as OverlayState;
        // Starting a fresh live session: clear any previous text/state.
        if (overlayState === "live") {
          setLiveText("");
          setLiveFinished(false);
          setCopyFeedback(false);
        }
        setState(overlayState);
        setIsVisible(true);
      });

      // Listen for hide-overlay event from Rust
      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        // Reiniciar las barras para que no se queden "congeladas" en el último
        // valor cuando el overlay vuelve a aparecer.
        smoothedLevelsRef.current = Array(BAR_COUNT).fill(0);
        setLevels(ZERO_LEVELS);
        setLiveText("");
        setLiveFinished(false);
        setCopyFeedback(false);
      });

      // Listen for mic-level updates
      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];

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
        setLiveText(event.payload as string);
      });

      // Live session finished: deliver final text + whether it was auto-copied,
      // and switch the bubble to its editable state.
      const unlistenLiveFinished = await listen<LiveFinishedPayload>(
        "live-finished",
        (event) => {
          const payload = event.payload as LiveFinishedPayload;
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

  // Drag the live capsule like a normal window. Only in live mode, and never
  // when the mousedown lands on an interactive control (logo, textarea, X, copy)
  // so those keep working.
  const handleDragStart = (e: React.MouseEvent) => {
    if (state !== "live" || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("textarea, .cancel-button, .copy-button, .overlay-logo")
    ) {
      return;
    }
    void getCurrentWindow().startDragging();
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
      onMouseDown={handleDragStart}
      className={`recording-overlay ${state === "live" ? "live" : ""} ${
        liveFinished ? "live-finished" : ""
      } ${isVisible ? "fade-in" : ""}`}
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

      <div className="overlay-middle">
        {state === "recording" && (
          <div className="bars-container">
            {levels.map((v, i) => {
              // Ganancia extra para que los picos de voz lleguen bien arriba.
              const gained = Math.min(1, Math.pow(v, 0.6) * 1.4);
              return (
                <div
                  key={i}
                  className="bar"
                  style={{
                    height: `${4 + gained * 16}px`,
                    transition: "height 70ms ease-out, opacity 100ms ease-out",
                    opacity: Math.max(0.35, gained),
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

      <div className="overlay-right">
        {(state === "recording" || state === "live") && (
          <div
            className="cancel-button"
            onClick={cancel}
            title={t("overlay.cancel")}
          >
            <CancelIcon />
          </div>
        )}
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
    </div>
  );
};

export default RecordingOverlay;
